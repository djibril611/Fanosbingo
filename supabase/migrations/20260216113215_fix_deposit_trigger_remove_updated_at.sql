/*
  # Fix Deposit Trigger - Remove updated_at Field
  
  The telegram_users table doesn't have an updated_at column,
  so we need to remove it from the deposit processing function.
*/

-- Update function to not reference updated_at
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
      total_deposited = COALESCE(total_deposited, 0) + NEW.amount_credits
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
