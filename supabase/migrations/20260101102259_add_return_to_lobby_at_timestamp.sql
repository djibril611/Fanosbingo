/*
  # Add Return to Lobby Timestamp for Synchronized Navigation

  1. Changes
    - Add `return_to_lobby_at` column to `games` table
    - This stores the exact server timestamp when all users should return to lobby
    - Calculated as finished_at + 7 seconds

  2. Purpose
    - Synchronize winner card display duration across all users
    - Ensure all users return to lobby at exactly the same time
    - Network-delay resistant - based on server time, not client timers
    - Late joiners see accurate remaining time

  3. Notes
    - Will be set by edge functions when game finishes
    - Client calculates countdown using: return_to_lobby_at - current_server_time
    - If return_to_lobby_at is in the past, client immediately redirects to lobby
*/

-- Add return_to_lobby_at column to games table
ALTER TABLE games
ADD COLUMN IF NOT EXISTS return_to_lobby_at timestamptz;

-- Add index for efficient queries
CREATE INDEX IF NOT EXISTS idx_games_return_to_lobby_at ON games(return_to_lobby_at)
WHERE return_to_lobby_at IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN games.return_to_lobby_at IS 'Server timestamp when all users should return to lobby after viewing winner card (finished_at + 7 seconds)';
