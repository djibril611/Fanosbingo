/*
  # Fix Withdrawal Recording and Add Wallet Columns

  1. Bug Fix: record_user_withdrawal function
    - Fixed column reference from `telegram_id` (non-existent) to `telegram_user_id`
    - This was causing the function to crash every time a user completed a withdrawal
    - On-chain withdrawals succeeded but database records were never created

  2. New Columns on telegram_users
    - `wallet_address` (text, nullable) - stores the user's connected BNB wallet address
    - `wallet_connected_at` (timestamptz, nullable) - when the wallet was last connected

  3. Security
    - No RLS changes needed (existing policies cover new columns)
*/

-- Fix the record_user_withdrawal function: telegram_id -> telegram_user_id
CREATE OR REPLACE FUNCTION public.record_user_withdrawal(
  p_telegram_user_id bigint,
  p_wallet_address text,
  p_amount_bnb numeric,
  p_transaction_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_withdrawal_id uuid;
  v_rate numeric;
BEGIN
  SELECT COALESCE(value::numeric, 1000)
  INTO v_rate
  FROM settings
  WHERE id = 'withdrawal_credits_to_bnb_rate';

  INSERT INTO bnb_withdrawal_requests (
    telegram_user_id,
    wallet_address,
    amount_bnb,
    amount_credits,
    status,
    transaction_hash,
    source,
    processed_at,
    completed_at
  ) VALUES (
    p_telegram_user_id,
    p_wallet_address,
    p_amount_bnb,
    p_amount_bnb * COALESCE(v_rate, 1000),
    'completed',
    p_transaction_hash,
    'user',
    now(),
    now()
  )
  RETURNING id INTO v_withdrawal_id;

  UPDATE telegram_users
  SET total_withdrawn = COALESCE(total_withdrawn, 0) + (p_amount_bnb * COALESCE(v_rate, 1000))
  WHERE telegram_user_id = p_telegram_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'withdrawal_id', v_withdrawal_id,
    'amount_bnb', p_amount_bnb,
    'transaction_hash', p_transaction_hash
  );
END;
$$;

-- Add wallet columns to telegram_users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'telegram_users' AND column_name = 'wallet_address'
  ) THEN
    ALTER TABLE telegram_users ADD COLUMN wallet_address text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'telegram_users' AND column_name = 'wallet_connected_at'
  ) THEN
    ALTER TABLE telegram_users ADD COLUMN wallet_connected_at timestamptz;
  END IF;
END $$;
