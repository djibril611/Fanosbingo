/*
  # Fix Winner Prize Calculation to Use Dynamic Commission Rate

  ## Summary
  Updates the `update_game_pot()` function to use the dynamic commission_rate setting
  instead of the hardcoded 75% (25% commission). This ensures winner prizes reflect
  the current 20% commission rate.

  ## Changes
  - Replaces hardcoded 0.75 multiplier with dynamic calculation based on commission_rate setting
  - Winner prize now correctly calculated as: total_pot × (100 - commission_rate) / 100
  - With 20% commission: winner gets 80% of pot
  - With old 25% commission: winner got 75% of pot

  ## Example
  Before (25% commission): 10 ETB × 0.75 = 7 ETB
  After (20% commission): 10 ETB × 0.80 = 8 ETB
*/

-- Update the function to use dynamic commission rate
CREATE OR REPLACE FUNCTION update_game_pot()
RETURNS TRIGGER AS $$
DECLARE
  commission_rate_val integer;
BEGIN
  -- Get current commission rate from settings
  SELECT COALESCE(value::integer, 20) INTO commission_rate_val
  FROM settings
  WHERE id = 'commission_rate';

  -- Update total pot and winner prize when a player joins
  UPDATE games
  SET
    total_pot = total_pot + stake_amount,
    winner_prize = FLOOR((total_pot + stake_amount) * (100 - commission_rate_val) / 100)
  WHERE id = NEW.game_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add helpful comment
COMMENT ON FUNCTION update_game_pot() IS
'Trigger function that updates game pot and winner prize when a player joins. Uses dynamic commission rate from settings.';