/*
  # Fix Deposit Balance Credit System
  
  1. Problem
    - The process_confirmed_deposit trigger only fires on UPDATE
    - When deposits are inserted with status='confirmed', the trigger never fires
    - Users don't get credited for their deposits
  
  2. Solution
    - Create a new trigger that fires on BOTH INSERT and UPDATE
    - Handle both new confirmed deposits and status changes to confirmed
    - Ensure balance is credited exactly once per transaction
  
  3. Changes
    - Drop the old UPDATE-only trigger
    - Create new function that handles both INSERT and UPDATE
    - Add trigger for both INSERT and UPDATE operations
*/

-- Drop the old trigger
DROP TRIGGER IF EXISTS trigger_process_confirmed_deposit ON deposit_transactions;

-- Create improved function that handles both INSERT and UPDATE
CREATE OR REPLACE FUNCTION process_confirmed_deposit()
RETURNS TRIGGER AS $$
DECLARE
  user_id bigint;
  should_process boolean := false;
BEGIN
  -- Determine if we should process this deposit
  IF TG_OP = 'INSERT' THEN
    -- On INSERT, process if status is 'confirmed' and not yet processed
    should_process := (NEW.status = 'confirmed' AND NEW.processed_at IS NULL);
  ELSIF TG_OP = 'UPDATE' THEN
    -- On UPDATE, process if status changed to 'confirmed' and not yet processed
    should_process := (NEW.status = 'confirmed' AND OLD.status != 'confirmed' AND NEW.processed_at IS NULL);
  END IF;

  IF should_process THEN
    -- Get or verify user ID
    IF NEW.telegram_user_id IS NULL THEN
      RAISE EXCEPTION 'Cannot process deposit: telegram_user_id is NULL';
    END IF;
    
    user_id := NEW.telegram_user_id;
    
    -- Credit the user's deposited_balance
    UPDATE telegram_users
    SET 
      deposited_balance = deposited_balance + NEW.amount_credits,
      total_deposited = COALESCE(total_deposited, 0) + NEW.amount_credits,
      updated_at = now()
    WHERE telegram_user_id = user_id;
    
    -- Check if user was found and updated
    IF NOT FOUND THEN
      RAISE EXCEPTION 'User not found: %', user_id;
    END IF;
    
    -- Mark transaction as processed
    NEW.processed_at := now();
    NEW.status := 'processed';
    NEW.updated_at := now();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for both INSERT and UPDATE
CREATE TRIGGER trigger_process_confirmed_deposit
  BEFORE INSERT OR UPDATE ON deposit_transactions
  FOR EACH ROW
  EXECUTE FUNCTION process_confirmed_deposit();
