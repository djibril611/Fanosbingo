/*
  # Add Simultaneous Winner Claim Window Support
  
  1. Problem
    - When 2+ players click BINGO within milliseconds, only the first one wins
    - This is unfair as network latency determines the winner, not skill
  
  2. Solution
    - Add a 1-second "claim window" after first valid BINGO claim
    - All valid claims within this window are recognized as winners
    - Prize is split equally among all simultaneous winners
  
  3. New Columns
    - `claim_window_start` (timestamptz): When first valid BINGO was claimed
    - Used to determine if subsequent claims are within the 1-second window
  
  4. Logic
    - First valid claim sets claim_window_start
    - Subsequent valid claims within 1 second are added to winner_ids
    - Game finalizes after window expires (handled by trigger)
  
  5. Security
    - No RLS changes needed (uses existing game policies)
*/

-- Add claim_window_start column to games table
ALTER TABLE games ADD COLUMN IF NOT EXISTS claim_window_start timestamptz DEFAULT NULL;

-- Create function to finalize games after claim window expires
CREATE OR REPLACE FUNCTION finalize_claim_window()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_winner_count integer;
  v_prize_each integer;
BEGIN
  -- Only process if game has an active claim window and is still playing
  IF NEW.claim_window_start IS NOT NULL 
     AND NEW.status = 'playing' 
     AND NEW.winner_ids IS NOT NULL 
     AND array_length(NEW.winner_ids, 1) > 0 
     AND (EXTRACT(EPOCH FROM (NOW() - NEW.claim_window_start)) * 1000) >= 1000 THEN
    
    -- Calculate prize per winner
    v_winner_count := array_length(NEW.winner_ids, 1);
    v_prize_each := FLOOR(COALESCE(NEW.winner_prize, 0) / v_winner_count);
    
    -- Finalize the game
    NEW.status := 'finished';
    NEW.winner_prize_each := v_prize_each;
    NEW.finished_at := NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-finalize on any game update after claim window expires
DROP TRIGGER IF EXISTS finalize_claim_window_trigger ON games;
CREATE TRIGGER finalize_claim_window_trigger
  BEFORE UPDATE ON games
  FOR EACH ROW
  EXECUTE FUNCTION finalize_claim_window();

-- Create index for efficient claim window queries
CREATE INDEX IF NOT EXISTS idx_games_claim_window 
  ON games(claim_window_start) 
  WHERE claim_window_start IS NOT NULL AND status = 'playing';
