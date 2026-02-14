/*
  # Fix Balance Deduction - RLS Issue
  
  1. Problem
    - Trigger function runs with user permissions (anon key)
    - RLS blocks UPDATE on telegram_users table
    - Balance never gets deducted even though stake_paid is set to true
  
  2. Solution
    - Set trigger function to SECURITY DEFINER
    - This makes it run with owner's privileges (bypassing RLS)
    - Allows the UPDATE to telegram_users to succeed
  
  3. Security
    - Function has validation logic (checks sufficient balance)
    - Only deducts when player joins with valid telegram_user_id
    - Atomic operation ensures consistency
*/

-- Recreate the function with SECURITY DEFINER
CREATE OR REPLACE FUNCTION deduct_stake_on_join()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
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
$$;
