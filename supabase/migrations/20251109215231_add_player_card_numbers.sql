/*
  # Add card numbers storage to players table

  1. Changes
    - Add `card_numbers` column to store the bingo card numbers for each player
    - This ensures all players see the same card across sessions and refreshes
    
  2. Notes
    - card_numbers is a 2D array: jsonb array of 5 columns, each containing 5 numbers
    - Generated once when player joins and never changes
    - Ensures consistency across all clients viewing the same player's card
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'players' AND column_name = 'card_numbers'
  ) THEN
    ALTER TABLE players ADD COLUMN card_numbers jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;