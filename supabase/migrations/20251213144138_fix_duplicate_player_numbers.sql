/*
  # Fix duplicate player numbers and add unique constraint

  1. Changes
    - Remove duplicate player entries (keep only the first player for each number)
    - Add unique constraint on (game_id, selected_number) to prevent future duplicates
  
  2. Security
    - No RLS changes needed
*/

-- Delete duplicate players, keeping only the first one for each (game_id, selected_number) combination
DELETE FROM players
WHERE id IN (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY game_id, selected_number ORDER BY joined_at ASC) as rn
    FROM players
    WHERE selected_number IS NOT NULL
  ) t
  WHERE rn > 1
);

-- Add unique constraint to prevent duplicate numbers in the same game
ALTER TABLE players 
  DROP CONSTRAINT IF EXISTS players_game_id_selected_number_key;

ALTER TABLE players 
  ADD CONSTRAINT players_game_id_selected_number_key 
  UNIQUE (game_id, selected_number);