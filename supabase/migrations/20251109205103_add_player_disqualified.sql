/*
  # Add Disqualification Support

  1. Changes to Tables
    - `players`
      - Add `is_disqualified` (boolean) - Whether player called false bingo
      - Add `disqualified_at` (timestamptz) - When player was disqualified
  
  2. Notes
    - Players who are disqualified cannot win the game
    - Disqualified players can continue to see the game but cannot claim bingo
*/

-- Add new columns to players table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'players' AND column_name = 'is_disqualified'
  ) THEN
    ALTER TABLE players ADD COLUMN is_disqualified boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'players' AND column_name = 'disqualified_at'
  ) THEN
    ALTER TABLE players ADD COLUMN disqualified_at timestamptz;
  END IF;
END $$;