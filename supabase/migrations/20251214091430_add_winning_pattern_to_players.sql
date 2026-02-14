/*
  # Add Winning Pattern Storage to Players
  
  1. Changes
    - Add `winning_pattern` column to `players` table to store the complete winning pattern
    - This stores the actual winning cells positions and pattern type
    - Used to display the winning card with all winning cells highlighted
  
  2. Schema
    - `winning_pattern` (jsonb, nullable)
      - Stores: { type, description, cells: [[col, row], ...] }
      - Only populated for winning players
      - Allows displaying the winning pattern even if player didn't mark all cells
  
  3. Purpose
    - Transparency: Show all players exactly how the winning combination was formed
    - Even if winner didn't manually mark all numbers, display shows the complete pattern
*/

-- Add winning_pattern column to store the complete winning pattern for winners
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'players' AND column_name = 'winning_pattern'
  ) THEN
    ALTER TABLE players ADD COLUMN winning_pattern jsonb DEFAULT NULL;
  END IF;
END $$;