/*
  # Add Win Count Tracking

  1. Changes to telegram_users Table
    - Add `win_count` column to track number of times user has won

  2. Updates to payout_winners Function
    - Increment win_count for each winner when they win a game
    - Existing total_won already tracks total ETB won

  3. Notes
    - Default value is 0 for win_count
    - win_count increments by 1 each time user wins (regardless of prize amount)
*/

-- Add win_count column to telegram_users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'telegram_users' AND column_name = 'win_count'
  ) THEN
    ALTER TABLE telegram_users ADD COLUMN win_count integer DEFAULT 0 NOT NULL;
  END IF;
END $$;

-- Update payout_winners function to also increment win_count
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
