/*
  # Add Telegram Authentication Fields

  1. Changes to Players Table
    - Add `telegram_user_id` (bigint) - Unique Telegram user ID
    - Add `telegram_username` (text) - Telegram username (without @)
    - Add `telegram_first_name` (text) - User's first name from Telegram
    - Add `telegram_last_name` (text) - User's last name from Telegram
    - Add unique constraint on telegram_user_id per game to prevent duplicate joins

  2. Indexes
    - Add index on telegram_user_id for faster lookups

  3. Notes
    - telegram_user_id is the primary identifier from Telegram
    - telegram_username may be null (not all users have usernames)
    - telegram_first_name is always available from Telegram
    - Players can only join each game once with the same Telegram account
*/

-- Add Telegram authentication columns to players table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'players' AND column_name = 'telegram_user_id'
  ) THEN
    ALTER TABLE players ADD COLUMN telegram_user_id bigint;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'players' AND column_name = 'telegram_username'
  ) THEN
    ALTER TABLE players ADD COLUMN telegram_username text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'players' AND column_name = 'telegram_first_name'
  ) THEN
    ALTER TABLE players ADD COLUMN telegram_first_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'players' AND column_name = 'telegram_last_name'
  ) THEN
    ALTER TABLE players ADD COLUMN telegram_last_name text;
  END IF;
END $$;

-- Create index on telegram_user_id for faster queries
CREATE INDEX IF NOT EXISTS idx_players_telegram_user_id ON players(telegram_user_id);

-- Add unique constraint to prevent same Telegram user from joining a game multiple times
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'unique_telegram_user_per_game'
  ) THEN
    ALTER TABLE players 
    ADD CONSTRAINT unique_telegram_user_per_game 
    UNIQUE (game_id, telegram_user_id);
  END IF;
END $$;