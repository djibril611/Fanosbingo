/*
  # Fix Payout Winners Function Security
  
  1. Problem
    - The payout_winners function cannot update telegram_users table due to RLS restrictions
    - Triggers run with definer privileges, but RLS still blocks updates
    - Only service_role has UPDATE permission on telegram_users
  
  2. Solution
    - Mark payout_winners function as SECURITY DEFINER
    - This allows the function to bypass RLS and update user balances
    - Function runs with elevated privileges to complete payouts
  
  3. Security Notes
    - Function only runs via trigger on game status change
    - All conditions are checked before updates
    - No user input directly affects the function
*/

-- Recreate function with SECURITY DEFINER
CREATE OR REPLACE FUNCTION payout_winners()
RETURNS TRIGGER 
SECURITY DEFINER
AS $$
DECLARE
  winner_id_val uuid;
  prize_amount integer;
BEGIN
  -- Only process if game is finished and winners haven't been paid yet
  IF NEW.status = 'finished' AND NEW.winners_paid = false AND NEW.winner_ids IS NOT NULL AND array_length(NEW.winner_ids, 1) > 0 THEN
    
    -- Calculate prize per winner
    prize_amount := NEW.winner_prize_each;
    
    -- Pay each winner
    FOREACH winner_id_val IN ARRAY NEW.winner_ids
    LOOP
      -- Get telegram_user_id from player and update stats
      UPDATE telegram_users tu
      SET 
        balance = balance + prize_amount,
        total_won = total_won + prize_amount,
        win_count = win_count + 1
      FROM players p
      WHERE p.id = winner_id_val
        AND p.telegram_user_id = tu.telegram_user_id;
    END LOOP;
    
    -- Mark winners as paid
    NEW.winners_paid = true;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;