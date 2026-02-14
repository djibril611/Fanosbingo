/*
  # Add timestamp tracking for auto-calling

  1. Changes
    - Add `last_number_called_at` timestamp column to games table
    
  2. Notes
    - This column tracks when the last number was called
    - Used by the edge function to ensure 3-second intervals
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'games' AND column_name = 'last_number_called_at'
  ) THEN
    ALTER TABLE games ADD COLUMN last_number_called_at timestamptz;
  END IF;
END $$;