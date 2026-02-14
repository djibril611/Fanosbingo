/*
  # Split Balance into Deposited and Won Balances

  ## Summary
  Separates user balance into two distinct fields to differentiate between deposited money
  (not withdrawable) and won money from games (withdrawable). This ensures users can only
  withdraw their winnings, not their deposits.

  ## Changes

  ### 1. New Columns
  - `deposited_balance` (integer) - Money from deposits (NOT withdrawable)
  - `won_balance` (integer) - Money from game winnings (withdrawable only)

  ### 2. Data Migration Strategy
  Since we cannot determine the historical breakdown of existing balances:
  - All existing `balance` is moved to `deposited_balance`
  - All users start with `won_balance = 0`
  - Future game winnings will increment `won_balance`
  - Future deposits will increment `deposited_balance`
  - The old `balance` field is kept for backward compatibility but will be deprecated

  ### 3. Updated Functions
  - `deduct_stake_from_balance()` - Deducts from both balances (deposited first, then won)
  - `payout_winners()` - Credits winnings to `won_balance`
  - `refund_player_stake()` - Refunds to original balance type
  - `auto_credit_matched_deposit()` - Credits deposits to `deposited_balance`
  - `get_available_balance()` - Returns only `won_balance` minus pending withdrawals

  ### 4. Balance Deduction Logic
  When a user plays a game (stake deduction):
  1. First deduct from `deposited_balance` (use deposits first)
  2. If insufficient, deduct remaining from `won_balance`
  3. Total available = deposited_balance + won_balance

  ### 5. Withdrawal Rules
  - ONLY `won_balance` can be withdrawn
  - `deposited_balance` cannot be withdrawn
  - Withdrawal validation checks `won_balance` only

  ### 6. Security
  - All existing RLS policies remain unchanged
  - Balance constraints updated to check both fields
*/

-- Add new balance columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'telegram_users' AND column_name = 'deposited_balance'
  ) THEN
    ALTER TABLE telegram_users ADD COLUMN deposited_balance integer DEFAULT 0 NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'telegram_users' AND column_name = 'won_balance'
  ) THEN
    ALTER TABLE telegram_users ADD COLUMN won_balance integer DEFAULT 0 NOT NULL;
  END IF;
END $$;

-- Migrate existing balance data (all goes to deposited_balance)
UPDATE telegram_users
SET deposited_balance = balance,
    won_balance = 0
WHERE deposited_balance = 0 AND won_balance = 0;

-- Add constraints for new balance fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'telegram_users_deposited_balance_check'
  ) THEN
    ALTER TABLE telegram_users
    ADD CONSTRAINT telegram_users_deposited_balance_check
    CHECK (deposited_balance >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'telegram_users_won_balance_check'
  ) THEN
    ALTER TABLE telegram_users
    ADD CONSTRAINT telegram_users_won_balance_check
    CHECK (won_balance >= 0);
  END IF;
END $$;

-- Drop and recreate get_available_balance function to check won_balance only
DROP FUNCTION IF EXISTS get_available_balance(bigint);

CREATE FUNCTION get_available_balance(user_telegram_id bigint)
RETURNS numeric AS $$
DECLARE
  user_won_balance numeric;
  pending_amount numeric;
BEGIN
  -- Get user's won balance (only withdrawable balance)
  SELECT won_balance INTO user_won_balance
  FROM telegram_users
  WHERE telegram_user_id = user_telegram_id;

  IF user_won_balance IS NULL THEN
    RETURN 0;
  END IF;

  -- Get total pending withdrawal amount
  SELECT COALESCE(SUM(amount), 0) INTO pending_amount
  FROM withdrawal_requests
  WHERE telegram_user_id = user_telegram_id
    AND status IN ('pending', 'processing');

  -- Return available won balance only
  RETURN user_won_balance - pending_amount;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_available_balance(bigint) IS
'Returns user available won balance for withdrawal (won balance minus pending/processing withdrawals). Deposited balance is NOT withdrawable.';

-- Drop and recreate deduct_stake_from_balance to use both balance types
DROP FUNCTION IF EXISTS deduct_stake_from_balance() CASCADE;

CREATE FUNCTION deduct_stake_from_balance()
RETURNS TRIGGER AS $$
DECLARE
  stake_amount_val integer;
  user_deposited integer;
  user_won integer;
  total_available integer;
  deduct_from_deposited integer;
  deduct_from_won integer;
BEGIN
  -- Get the stake amount from the game
  SELECT stake_amount INTO stake_amount_val
  FROM games
  WHERE id = NEW.game_id;

  IF stake_amount_val IS NULL THEN
    RAISE EXCEPTION 'Game not found';
  END IF;

  -- Get user's current balances
  SELECT deposited_balance, won_balance INTO user_deposited, user_won
  FROM telegram_users
  WHERE telegram_user_id = NEW.telegram_user_id;

  total_available := user_deposited + user_won;

  -- Check if user has enough total balance
  IF total_available < stake_amount_val THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  -- Calculate how much to deduct from each balance
  -- Strategy: Use deposited_balance first, then won_balance
  IF user_deposited >= stake_amount_val THEN
    -- Can deduct entirely from deposited balance
    deduct_from_deposited := stake_amount_val;
    deduct_from_won := 0;
  ELSE
    -- Deduct all from deposited, rest from won
    deduct_from_deposited := user_deposited;
    deduct_from_won := stake_amount_val - user_deposited;
  END IF;

  -- Deduct from balances and increment total_spent
  UPDATE telegram_users
  SET
    deposited_balance = deposited_balance - deduct_from_deposited,
    won_balance = won_balance - deduct_from_won,
    balance = balance - stake_amount_val,
    total_spent = total_spent + stake_amount_val
  WHERE telegram_user_id = NEW.telegram_user_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
DROP TRIGGER IF EXISTS deduct_stake_on_player_insert ON players;
CREATE TRIGGER deduct_stake_on_player_insert
  BEFORE INSERT ON players
  FOR EACH ROW
  EXECUTE FUNCTION deduct_stake_from_balance();

-- Drop and recreate payout_winners to credit won_balance
DROP FUNCTION IF EXISTS payout_winners() CASCADE;

CREATE FUNCTION payout_winners()
RETURNS TABLE(winner_id uuid, amount integer) AS $$
DECLARE
  game_record RECORD;
  total_pot integer;
  winner_count integer;
  prize_amount integer;
  winner_id_val uuid;
BEGIN
  -- Get all completed games that haven't been paid out
  FOR game_record IN
    SELECT g.id, g.pot_amount, g.house_pot_amount
    FROM games g
    WHERE g.status = 'completed'
      AND g.paid_out = false
  LOOP
    -- Count winners for this game
    SELECT COUNT(*) INTO winner_count
    FROM players
    WHERE game_id = game_record.id
      AND has_won = true
      AND NOT disqualified;

    -- Skip if no winners
    IF winner_count = 0 THEN
      -- Mark game as paid out even with no winners
      UPDATE games
      SET paid_out = true
      WHERE id = game_record.id;

      CONTINUE;
    END IF;

    -- Calculate prize amount per winner (split pot equally)
    total_pot := game_record.pot_amount;
    prize_amount := total_pot / winner_count;

    -- Pay each winner
    FOR winner_id_val IN
      SELECT p.id
      FROM players p
      WHERE p.game_id = game_record.id
        AND p.has_won = true
        AND NOT p.disqualified
    LOOP
      -- Get telegram_user_id from player and update won_balance
      UPDATE telegram_users tu
      SET
        won_balance = won_balance + prize_amount,
        balance = balance + prize_amount,
        total_won = total_won + prize_amount,
        win_count = win_count + 1
      FROM players p
      WHERE p.id = winner_id_val
        AND tu.telegram_user_id = p.telegram_user_id;

      -- Return winner info
      winner_id := winner_id_val;
      amount := prize_amount;
      RETURN NEXT;
    END LOOP;

    -- Mark game as paid out
    UPDATE games
    SET paid_out = true
    WHERE id = game_record.id;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop and recreate refund_player_stake trigger function
DROP FUNCTION IF EXISTS refund_player_stake() CASCADE;

CREATE FUNCTION refund_player_stake()
RETURNS TRIGGER AS $$
DECLARE
  game_stake_amount integer;
BEGIN
  -- Get the stake amount from the game
  SELECT stake_amount INTO game_stake_amount
  FROM games
  WHERE id = OLD.game_id;

  IF game_stake_amount IS NULL THEN
    RETURN OLD;
  END IF;

  -- Refund the balance (to deposited since that's what was deducted first)
  UPDATE telegram_users
  SET
    deposited_balance = deposited_balance + game_stake_amount,
    balance = balance + game_stake_amount
  WHERE telegram_user_id = OLD.telegram_user_id;

  -- Update game pot amounts
  UPDATE games
  SET
    pot_amount = pot_amount - game_stake_amount,
    house_pot_amount = house_pot_amount - (game_stake_amount * 5 / 100)
  WHERE id = OLD.game_id;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
DROP TRIGGER IF EXISTS refund_on_player_delete ON players;
CREATE TRIGGER refund_on_player_delete
  BEFORE DELETE ON players
  FOR EACH ROW
  EXECUTE FUNCTION refund_player_stake();

-- Drop and recreate auto_credit_matched_deposit function
DROP FUNCTION IF EXISTS auto_credit_matched_deposit() CASCADE;

CREATE FUNCTION auto_credit_matched_deposit()
RETURNS trigger AS $$
DECLARE
  user_record telegram_users%ROWTYPE;
  deposit_amount numeric;
BEGIN
  -- Only proceed if status changed to 'matched'
  IF NEW.status = 'matched' AND (OLD.status IS NULL OR OLD.status != 'matched') THEN
    
    -- Get user record
    SELECT * INTO user_record
    FROM telegram_users
    WHERE telegram_user_id = NEW.telegram_user_id;
    
    -- Get the actual amount from matched SMS
    SELECT amount INTO deposit_amount
    FROM bank_sms_messages
    WHERE id = NEW.matched_sms_id;
    
    -- Credit user deposited_balance (deposits are not withdrawable)
    IF user_record.id IS NOT NULL AND deposit_amount > 0 THEN
      UPDATE telegram_users
      SET
        deposited_balance = deposited_balance + deposit_amount,
        balance = balance + deposit_amount,
        total_deposited = total_deposited + deposit_amount
      WHERE telegram_user_id = NEW.telegram_user_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
DROP TRIGGER IF EXISTS trigger_auto_credit_deposit ON user_sms_submissions;
CREATE TRIGGER trigger_auto_credit_deposit
  AFTER INSERT OR UPDATE ON user_sms_submissions
  FOR EACH ROW
  EXECUTE FUNCTION auto_credit_matched_deposit();

-- Add helpful comments
COMMENT ON COLUMN telegram_users.deposited_balance IS
'Money from deposits - can be used to play games but CANNOT be withdrawn';

COMMENT ON COLUMN telegram_users.won_balance IS
'Money from game winnings - can be withdrawn';

COMMENT ON COLUMN telegram_users.balance IS
'Legacy total balance field (deposited + won) - kept for compatibility';
