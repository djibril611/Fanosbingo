/*
  # Fix Winner Payout Trigger

  ## Summary
  Restores the automatic winner payout system that was accidentally broken when
  the balance was split into deposited_balance and won_balance. The previous
  migration dropped the trigger function and replaced it with a table-returning
  function that was never called.

  ## Changes

  1. Drop Incorrect Function
    - Remove the table-returning payout_winners() function that expects 'completed' status

  2. Create Trigger Function
    - Recreate payout_winners() as a proper BEFORE UPDATE trigger function
    - Credits winnings to won_balance (withdrawable)
    - Credits winnings to legacy balance field for compatibility
    - Increments total_won and win_count for winners
    - Works with 'finished' status and winner_ids array
    - Uses winners_paid flag to prevent double payment

  3. Recreate Trigger
    - Automatically pays winners when game status changes to 'finished'
    - Runs BEFORE UPDATE to modify the NEW record
    - Sets winners_paid = true to prevent duplicate payments

  ## Security
  - Function uses SECURITY DEFINER to bypass RLS for balance updates
  - Only processes games transitioning to 'finished' status
  - Validates winner_ids array exists and has winners
*/

-- Drop the incorrect table-returning function
DROP FUNCTION IF EXISTS payout_winners() CASCADE;

-- Create the correct trigger function that credits won_balance
CREATE OR REPLACE FUNCTION payout_winners()
RETURNS TRIGGER AS $$
DECLARE
  winner_id_val uuid;
  prize_amount integer;
BEGIN
  -- Only process if game is finished and winners haven't been paid yet
  IF NEW.status = 'finished' AND NEW.winners_paid = false AND NEW.winner_ids IS NOT NULL AND array_length(NEW.winner_ids, 1) > 0 THEN

    -- Calculate prize per winner (already calculated in winner_prize_each)
    prize_amount := NEW.winner_prize_each;

    -- Pay each winner
    FOREACH winner_id_val IN ARRAY NEW.winner_ids
    LOOP
      -- Get telegram_user_id from player and credit won_balance
      UPDATE telegram_users tu
      SET
        won_balance = won_balance + prize_amount,
        balance = balance + prize_amount,
        total_won = total_won + prize_amount,
        win_count = win_count + 1
      FROM players p
      WHERE p.id = winner_id_val
        AND p.telegram_user_id = tu.telegram_user_id;
    END LOOP;

    -- Mark winners as paid to prevent double payment
    NEW.winners_paid = true;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger to automatically payout winners when game finishes
DROP TRIGGER IF EXISTS payout_on_game_finish ON games;

CREATE TRIGGER payout_on_game_finish
  BEFORE UPDATE ON games
  FOR EACH ROW
  WHEN (NEW.status = 'finished' AND OLD.status != 'finished')
  EXECUTE FUNCTION payout_winners();

-- Add helpful comment
COMMENT ON FUNCTION payout_winners() IS
'Trigger function that automatically credits winnings to won_balance when a game finishes. Runs when game status changes to finished.';