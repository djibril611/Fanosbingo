/*
  # Add Winner Payout System
  
  1. New Function
    - Create `payout_winners` function to:
      - Pay winners their prize amount
      - Update balance and total_won for each winner
      - Only pay once (check if already paid)
  
  2. New Trigger
    - Trigger on game update to finished status
    - Automatically pays all winners
  
  3. Changes to Games Table
    - Add `winners_paid` boolean to prevent double payment
  
  4. Notes
    - Splits prize evenly among all winners
    - Updates both balance and total_won tracking
    - Atomic transaction ensures all winners are paid or none
*/

-- Add winners_paid flag to games table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'games' AND column_name = 'winners_paid'
  ) THEN
    ALTER TABLE games ADD COLUMN winners_paid boolean DEFAULT false;
  END IF;
END $$;

-- Create function to payout winners
CREATE OR REPLACE FUNCTION payout_winners()
RETURNS TRIGGER AS $$
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
      -- Get telegram_user_id from player
      UPDATE telegram_users tu
      SET 
        balance = balance + prize_amount,
        total_won = total_won + prize_amount
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

-- Create trigger to payout winners when game finishes
DROP TRIGGER IF EXISTS payout_on_game_finish ON games;
CREATE TRIGGER payout_on_game_finish
  BEFORE UPDATE ON games
  FOR EACH ROW
  WHEN (NEW.status = 'finished' AND OLD.status != 'finished')
  EXECUTE FUNCTION payout_winners();