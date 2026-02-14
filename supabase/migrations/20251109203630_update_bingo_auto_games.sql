/*
  # Update Bingo Tables for Auto-Game System

  1. Changes to Tables
    - `games`
      - Remove `code` field (no longer needed for auto-games)
      - Add `starts_at` (timestamptz) - When the game will start (20s after creation)
      - Add `game_number` (integer) - Sequential game number for identification
    
    - `players`
      - Add `selected_number` (integer) - The number (1-400) the player selected
      - Keep existing card and marked_cells structure
  
  2. Indexes
    - Add index on game_number for quick lookups
    - Add index on starts_at for finding active/upcoming games
  
  3. Security
    - Update RLS policies to work with new structure
*/

-- Drop old constraint and columns
ALTER TABLE games DROP CONSTRAINT IF EXISTS status_check;
ALTER TABLE games DROP COLUMN IF EXISTS code;

-- Add new columns to games table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'games' AND column_name = 'starts_at'
  ) THEN
    ALTER TABLE games ADD COLUMN starts_at timestamptz DEFAULT (now() + interval '20 seconds');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'games' AND column_name = 'game_number'
  ) THEN
    ALTER TABLE games ADD COLUMN game_number integer;
  END IF;
END $$;

-- Add new constraint
ALTER TABLE games ADD CONSTRAINT status_check CHECK (status IN ('waiting', 'playing', 'finished'));

-- Add new column to players table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'players' AND column_name = 'selected_number'
  ) THEN
    ALTER TABLE players ADD COLUMN selected_number integer;
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_games_game_number ON games(game_number);
CREATE INDEX IF NOT EXISTS idx_games_starts_at ON games(starts_at);
CREATE INDEX IF NOT EXISTS idx_players_selected_number ON players(game_id, selected_number);

-- Create sequence for game numbers if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'game_number_seq') THEN
    CREATE SEQUENCE game_number_seq START 1;
  END IF;
END $$;