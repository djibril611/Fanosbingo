/*
  # Add Spending and Winning Tracking
  
  1. Changes to telegram_users Table
    - Add `total_spent` column to track all ETB spent on games
    - Add `total_won` column to track all ETB won from games
  
  2. New Function
    - Create `deduct_stake_from_balance` function to:
      - Deduct stake amount from user's balance when joining
      - Increment total_spent by stake amount
      - Mark player's stake_paid as true
  
  3. New Trigger
    - Trigger on player insert to automatically deduct stake
    - Only deducts if player has a telegram_user_id
  
  4. Notes
    - Default values are 0 for both tracking columns
    - Function ensures atomic balance deduction and tracking
    - Prevents double-charging with stake_paid flag
*/

-- Add tracking columns to telegram_users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'telegram_users' AND column_name = 'total_spent'
  ) THEN
    ALTER TABLE telegram_users ADD COLUMN total_spent integer DEFAULT 0 NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'telegram_users' AND column_name = 'total_won'
  ) THEN
    ALTER TABLE telegram_users ADD COLUMN total_won integer DEFAULT 0 NOT NULL;
  END IF;
END $$;

-- Create function to deduct stake and update tracking
CREATE OR REPLACE FUNCTION deduct_stake_from_balance()
RETURNS TRIGGER AS $$
DECLARE
  stake_amount_val integer;
BEGIN
  -- Only process if player has telegram_user_id and hasn't paid yet
  IF NEW.telegram_user_id IS NOT NULL AND NEW.stake_paid = false THEN
    -- Get the stake amount from the game
    SELECT stake_amount INTO stake_amount_val
    FROM games
    WHERE id = NEW.game_id;
    
    -- Deduct from balance and increment total_spent
    UPDATE telegram_users
    SET 
      balance = balance - stake_amount_val,
      total_spent = total_spent + stake_amount_val
    WHERE telegram_user_id = NEW.telegram_user_id;
    
    -- Mark stake as paid
    NEW.stake_paid = true;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to deduct stake when player joins
DROP TRIGGER IF EXISTS deduct_stake_on_player_join ON players;
CREATE TRIGGER deduct_stake_on_player_join
  BEFORE INSERT ON players
  FOR EACH ROW
  EXECUTE FUNCTION deduct_stake_from_balance();