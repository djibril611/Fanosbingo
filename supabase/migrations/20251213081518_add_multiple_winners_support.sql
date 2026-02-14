/*
  # Add Multiple Winners Support

  1. Changes
    - Replace `winner_id` with `winner_ids` array to support multiple simultaneous winners
    - Add `winner_prize_each` to track prize amount per winner when prize is split
    
  2. Migration Steps
    - Add new `winner_ids` column as text array
    - Add new `winner_prize_each` column as integer
    - Copy existing `winner_id` to `winner_ids` array (for backward compatibility)
    - Drop old `winner_id` column
    
  3. Notes
    - When multiple players win simultaneously, the prize is split equally
    - `winner_prize_each` will be `winner_prize / number_of_winners`
*/

-- Add new columns
ALTER TABLE games ADD COLUMN IF NOT EXISTS winner_ids text[] DEFAULT '{}';
ALTER TABLE games ADD COLUMN IF NOT EXISTS winner_prize_each integer DEFAULT 0;

-- Migrate existing data: copy winner_id to winner_ids array
DO $$
BEGIN
  UPDATE games 
  SET winner_ids = ARRAY[winner_id]
  WHERE winner_id IS NOT NULL AND winner_ids = '{}';
END $$;

-- Drop old winner_id column
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'games' AND column_name = 'winner_id'
  ) THEN
    ALTER TABLE games DROP COLUMN winner_id;
  END IF;
END $$;