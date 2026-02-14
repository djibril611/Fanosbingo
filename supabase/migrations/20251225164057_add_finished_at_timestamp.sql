/*
  # Add Finished At Timestamp to Games Table

  1. Changes
    - Add `finished_at` column to `games` table to track exactly when a game ends
    - Add index on `finished_at` for efficient queries of recently finished games
    - This enables synchronized winner card viewing and lobby return timing

  2. Purpose
    - Track precise game finish time to coordinate next game countdown
    - Ensure players viewing winner cards get fair countdown time in next game
    - Enable smart countdown extension based on time since last game finished
*/

-- Add finished_at column to games table
ALTER TABLE games
ADD COLUMN IF NOT EXISTS finished_at timestamptz;

-- Add index for efficient queries of recently finished games
CREATE INDEX IF NOT EXISTS idx_games_finished_at ON games(finished_at DESC)
WHERE finished_at IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN games.finished_at IS 'Timestamp when the game was marked as finished, used to coordinate next game countdown timing';
