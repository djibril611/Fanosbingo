/*
  # Fix Balance Constraint to Prevent Negative Balances
  
  1. Changes to telegram_users Table
    - Add CHECK constraint to prevent negative balances
    - Ensures balance never goes below 0
  
  2. Update deduct_stake_from_balance Function
    - Add validation to check if user has sufficient balance
    - Raise exception if insufficient balance
    - Prevents users from spending more than they have
  
  3. Security
    - Database-level constraint prevents negative balances
    - Function-level validation provides clear error messages
    - Atomic operation ensures consistency
  
  4. Notes
    - Existing negative balances (if any) should be manually corrected
    - This prevents future negative balance issues
*/

-- Add constraint to prevent negative balances
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'telegram_users_balance_check'
  ) THEN
    ALTER TABLE telegram_users 
    ADD CONSTRAINT telegram_users_balance_check 
    CHECK (balance >= 0);
  END IF;
END $$;

-- Update the deduct_stake_from_balance function to check balance first
CREATE OR REPLACE FUNCTION deduct_stake_from_balance()
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
      RAISE EXCEPTION 'Insufficient balance. Required: %, Available: %', stake_amount_val, current_balance;
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
