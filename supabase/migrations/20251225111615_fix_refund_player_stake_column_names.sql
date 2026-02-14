/*
  # Fix Refund Player Stake Function - Correct Column Names

  ## Problem
  The `refund_player_stake()` function references non-existent columns:
  - Uses `pot_amount` but the actual column is `total_pot`
  - Uses `house_pot_amount` which doesn't exist in the games table

  This causes deselecting cards to fail silently.

  ## Solution
  - Update function to use correct column name `total_pot`
  - Recalculate `winner_prize` based on commission rate setting
  - Remove reference to non-existent `house_pot_amount`

  ## Changes
  1. Drop and recreate `refund_player_stake()` with correct column references
  2. Ensure trigger is properly connected
*/

-- Drop existing function and trigger
DROP TRIGGER IF EXISTS refund_on_player_delete ON players;
DROP FUNCTION IF EXISTS refund_player_stake() CASCADE;

-- Create fixed refund function
CREATE OR REPLACE FUNCTION refund_player_stake()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  game_stake_amount integer;
  new_total_pot integer;
  commission_rate_val integer;
BEGIN
  -- Only process if player has telegram_user_id
  IF OLD.telegram_user_id IS NULL THEN
    RETURN OLD;
  END IF;

  -- Get the stake amount from the game
  SELECT stake_amount INTO game_stake_amount
  FROM games
  WHERE id = OLD.game_id;

  IF game_stake_amount IS NULL THEN
    RETURN OLD;
  END IF;

  -- Refund the balance to deposited_balance (since that's deducted first)
  UPDATE telegram_users
  SET
    deposited_balance = deposited_balance + game_stake_amount,
    total_spent = GREATEST(0, total_spent - game_stake_amount)
  WHERE telegram_user_id = OLD.telegram_user_id;

  -- Get commission rate from settings (default 25%)
  SELECT COALESCE(value::integer, 25) INTO commission_rate_val
  FROM settings
  WHERE id = 'commission_rate';

  IF commission_rate_val IS NULL THEN
    commission_rate_val := 25;
  END IF;

  -- Calculate new pot and prize
  SELECT GREATEST(0, total_pot - game_stake_amount) INTO new_total_pot
  FROM games
  WHERE id = OLD.game_id;

  -- Update game pot amounts with correct column names
  UPDATE games
  SET
    total_pot = new_total_pot,
    winner_prize = FLOOR(new_total_pot * (100 - commission_rate_val) / 100)
  WHERE id = OLD.game_id;

  RETURN OLD;
END;
$$;

-- Create trigger to refund stake when player is deleted
CREATE TRIGGER refund_on_player_delete
  BEFORE DELETE ON players
  FOR EACH ROW
  EXECUTE FUNCTION refund_player_stake();

-- Also drop any conflicting older trigger
DROP TRIGGER IF EXISTS refund_stake_on_player_delete ON players;

COMMENT ON FUNCTION refund_player_stake() IS
'Refunds stake to user deposited_balance when player is deleted (deselects card). Updates game pot accordingly.';
