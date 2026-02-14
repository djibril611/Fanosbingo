/*
  # Update Selection Cutoff to 35 Seconds

  1. Changes
    - Update selection_closed_at trigger to use 35 seconds instead of 5 seconds
    - Update all existing games to use 35-second cutoff
    - Provides more time for users to make selections before game starts

  2. Security
    - Maintains existing RLS policies
    - No changes to security model
*/

-- Update the trigger function to use 35 seconds
CREATE OR REPLACE FUNCTION set_selection_closed_at()
RETURNS TRIGGER AS $$
BEGIN
  -- If starts_at is being set or updated, automatically set selection_closed_at
  IF NEW.starts_at IS NOT NULL THEN
    NEW.selection_closed_at := NEW.starts_at - interval '35 seconds';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update all existing games with waiting status to use 35-second cutoff
UPDATE games
SET selection_closed_at = starts_at - interval '35 seconds'
WHERE status = 'waiting' AND starts_at IS NOT NULL;