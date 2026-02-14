/*
  # Fix selection_closed_at Interval

  1. Changes
    - Fix the selection_closed_at trigger from 35 seconds to 5 seconds
    - The previous value of 35 seconds was incorrect: with a 25-second countdown,
      it caused selection_closed_at to be in the past at game creation time,
      making card selection impossible
    - 5 seconds means selection closes 5 seconds before the game starts,
      giving users ~20 seconds to select their cards

  2. Fix Current Games
    - Update all waiting games to use the corrected 5-second cutoff
*/

CREATE OR REPLACE FUNCTION set_selection_closed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.starts_at IS NOT NULL THEN
    NEW.selection_closed_at := NEW.starts_at - interval '5 seconds';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

UPDATE games
SET selection_closed_at = starts_at - interval '5 seconds'
WHERE status = 'waiting' AND starts_at IS NOT NULL;
