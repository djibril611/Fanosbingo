/*
  # Deduct Balance When Player Joins Game
  
  1. Changes to Deduction Logic
    - Remove trigger that deducts when game starts
    - Add trigger that deducts immediately when player joins
    - Deduct from player's balance on insert to players table
  
  2. New Function
    - `deduct_stake_on_join` function to:
      - Trigger when player record is inserted
      - Deduct stake from player's balance immediately
      - Update total_spent tracking
      - Mark player's stake_paid as true
      - Validate sufficient balance before allowing join
  
  3. Benefits
    - Immediate payment when joining
    - Players know cost upfront
    - No risk of insufficient balance at game start
    - Clear transaction at join time
  
  4. Notes
    - If player has insufficient balance, join will fail
    - stake_paid flag prevents double-charging
    - Balance deducted before player record is created
*/

-- Drop the trigger that deducts when game starts
DROP TRIGGER IF EXISTS deduct_stakes_on_game_start ON games;

-- Create function to deduct stake when player joins
CREATE OR REPLACE FUNCTION deduct_stake_on_join()
RETURNS TRIGGER AS $$
DECLARE
  stake_amount_val integer;
  current_balance integer;
BEGIN
  -- Only process if player has telegram_user_id and hasn't paid yet
  IF NEW.telegram_user_id IS NOT NULL AND NEW.stake_paid = false THEN
    -- Get the stake amount from the game
    SELECT stake_amount INTO stake_amount_val
    FROM games
    WHERE id = NEW.game_id;
    
    -- Get current balance
    SELECT balance INTO current_balance
    FROM telegram_users
    WHERE telegram_user_id = NEW.telegram_user_id;
    
    -- Check if user has sufficient balance
    IF current_balance < stake_amount_val THEN
      RAISE EXCEPTION 'Insufficient balance. Required: % ETB, Available: % ETB', 
        stake_amount_val, current_balance;
    END IF;
    
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
DROP TRIGGER IF EXISTS deduct_stake_on_join ON players;
CREATE TRIGGER deduct_stake_on_join
  BEFORE INSERT ON players
  FOR EACH ROW
  EXECUTE FUNCTION deduct_stake_on_join();

-- Remove the old function that was used for game start deduction
DROP FUNCTION IF EXISTS deduct_stakes_on_game_start();
