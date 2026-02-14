/*
  # Enable Deposited Balance Transfer

  ## Summary
  Updates the balance transfer system to allow users to transfer both deposited balance
  and won balance. Previously, only won balance could be transferred.

  ## Changes

  ### 1. Update balance_transfers Table
  - Add `balance_type` column to track whether transfer was from 'deposited' or 'won' balance
  - Add constraint to ensure valid balance types

  ### 2. Update transfer_balance Function
  - Add `balance_type` parameter ('deposited' or 'won')
  - Update logic to deduct from and credit to appropriate balance fields
  - Maintain rule: deposited → deposited, won → deposited (recipient gets deposited balance)
  - Add validation to ensure sufficient balance of selected type

  ### 3. Transfer Rules
  - Users can transfer from either deposited_balance or won_balance
  - Transfers from won_balance → add to recipient's deposited_balance
  - Transfers from deposited_balance → add to recipient's deposited_balance
  - Minimum transfer amount remains 10 ETB
  - Cannot transfer to self

  ## Security
  - All existing RLS policies remain in effect
  - Function uses SECURITY DEFINER for balance updates
  - Proper balance validation and atomicity maintained
*/

-- Add balance_type column to balance_transfers table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'balance_transfers' AND column_name = 'balance_type'
  ) THEN
    ALTER TABLE balance_transfers ADD COLUMN balance_type text CHECK (balance_type IN ('deposited', 'won'));
  END IF;
END $$;

-- Update existing records to have a default balance_type
UPDATE balance_transfers
SET balance_type = 'won'
WHERE balance_type IS NULL AND transfer_type = 'user_transfer';

-- Drop and recreate transfer_balance function with balance_type support
DROP FUNCTION IF EXISTS transfer_balance(bigint, integer, bigint);

CREATE OR REPLACE FUNCTION transfer_balance(
  from_telegram_id bigint,
  transfer_amount integer,
  to_telegram_id bigint,
  balance_type_param text DEFAULT 'won'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  from_balance integer;
  result json;
BEGIN
  -- Validate balance_type parameter
  IF balance_type_param NOT IN ('deposited', 'won') THEN
    RETURN json_build_object('success', false, 'error', 'Invalid balance type. Must be "deposited" or "won"');
  END IF;

  -- Validate minimum transfer amount
  IF transfer_amount < 10 THEN
    RETURN json_build_object('success', false, 'error', 'Minimum transfer amount is 10 ETB');
  END IF;

  -- Check sender's balance based on balance_type
  IF balance_type_param = 'won' THEN
    SELECT won_balance INTO from_balance
    FROM telegram_users
    WHERE telegram_user_id = from_telegram_id
    FOR UPDATE;
  ELSE
    SELECT deposited_balance INTO from_balance
    FROM telegram_users
    WHERE telegram_user_id = from_telegram_id
    FOR UPDATE;
  END IF;

  -- Check if sender has enough balance
  IF from_balance IS NULL OR from_balance < transfer_amount THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Insufficient ' || balance_type_param || ' balance'
    );
  END IF;

  -- Check if recipient exists
  IF NOT EXISTS(SELECT 1 FROM telegram_users WHERE telegram_user_id = to_telegram_id) THEN
    RETURN json_build_object('success', false, 'error', 'Recipient not found');
  END IF;

  -- Cannot transfer to self
  IF from_telegram_id = to_telegram_id THEN
    RETURN json_build_object('success', false, 'error', 'Cannot transfer to yourself');
  END IF;

  -- Deduct from sender's balance (either won or deposited)
  IF balance_type_param = 'won' THEN
    UPDATE telegram_users
    SET won_balance = won_balance - transfer_amount,
        balance = balance - transfer_amount
    WHERE telegram_user_id = from_telegram_id;
  ELSE
    UPDATE telegram_users
    SET deposited_balance = deposited_balance - transfer_amount,
        balance = balance - transfer_amount
    WHERE telegram_user_id = from_telegram_id;
  END IF;

  -- Add to recipient's deposited_balance (transfers always become deposited for recipient)
  UPDATE telegram_users
  SET deposited_balance = deposited_balance + transfer_amount,
      balance = balance + transfer_amount
  WHERE telegram_user_id = to_telegram_id;

  -- Record the transfer
  INSERT INTO balance_transfers (from_user_id, to_user_id, amount, transfer_type, balance_type, notes)
  VALUES (
    from_telegram_id,
    to_telegram_id,
    transfer_amount,
    'user_transfer',
    balance_type_param,
    'User-to-user transfer from ' || balance_type_param || ' balance'
  );

  result := json_build_object(
    'success', true,
    'amount', transfer_amount,
    'from_user', from_telegram_id,
    'to_user', to_telegram_id,
    'balance_type', balance_type_param
  );

  RETURN result;
END;
$$;

-- Add helpful comment
COMMENT ON FUNCTION transfer_balance(bigint, integer, bigint, text) IS
'Transfers balance between users. Supports both deposited and won balance types. Transfers always credit recipient deposited_balance.';
