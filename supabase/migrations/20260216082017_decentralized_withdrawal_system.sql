/*
  # Decentralized Withdrawal System Migration

  1. Overview
    - Transitions from admin-custodial withdrawals to fully decentralized user-signed withdrawals
    - Users now call withdraw() directly on the smart contract
    - Backend only credits win amounts via addWinCredits(), never signs withdrawal transactions

  2. Changes to bnb_withdrawal_requests
    - Make nonce and signature columns nullable (no longer needed for user-signed withdrawals)
    - Add source column to distinguish admin-executed vs user-executed withdrawals
    - Keep existing records intact

  3. New simplified function: record_user_withdrawal
    - Lightweight function for frontend to log completed on-chain withdrawals
    - No balance deductions (claim step already handled that)
    - Records transaction hash and amount for audit trail

  4. Simplified complete_bnb_withdrawal function
    - Now only records the completion event
    - No balance adjustments needed

  5. Security
    - RLS policies maintained on bnb_withdrawal_requests
    - Users can only view their own withdrawal records
    - Service role required for recording withdrawals

  6. Important Notes
    - Withdrawal limits are now enforced on-chain by the smart contract
    - Database-side limit tracking (bnb_withdrawal_limits_tracking) is kept for analytics but no longer authoritative
    - The process_bnb_withdrawal_request function is deprecated (contract handles validation)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bnb_withdrawal_requests' AND column_name = 'source'
  ) THEN
    ALTER TABLE bnb_withdrawal_requests ADD COLUMN source text NOT NULL DEFAULT 'admin';
  END IF;
END $$;

ALTER TABLE bnb_withdrawal_requests ALTER COLUMN nonce DROP NOT NULL;
ALTER TABLE bnb_withdrawal_requests ALTER COLUMN signature DROP NOT NULL;

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
  WHERE telegram_id = p_telegram_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'withdrawal_id', v_withdrawal_id,
    'amount_bnb', p_amount_bnb,
    'transaction_hash', p_transaction_hash
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_bnb_withdrawal_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_withdrawn_today', COALESCE(SUM(CASE
      WHEN status = 'completed' AND completed_at >= CURRENT_DATE
      THEN amount_bnb ELSE 0 END), 0),
    'total_withdrawn_week', COALESCE(SUM(CASE
      WHEN status = 'completed' AND completed_at >= date_trunc('week', CURRENT_DATE)
      THEN amount_bnb ELSE 0 END), 0),
    'total_withdrawn_all_time', COALESCE(SUM(CASE
      WHEN status = 'completed'
      THEN amount_bnb ELSE 0 END), 0),
    'pending_count', COUNT(CASE WHEN status = 'pending' THEN 1 END),
    'pending_amount', COALESCE(SUM(CASE
      WHEN status = 'pending' THEN amount_bnb ELSE 0 END), 0),
    'failed_today', COUNT(CASE
      WHEN status = 'failed' AND created_at >= CURRENT_DATE THEN 1 END),
    'completed_today', COUNT(CASE
      WHEN status = 'completed' AND completed_at >= CURRENT_DATE THEN 1 END),
    'user_withdrawals_today', COUNT(CASE
      WHEN status = 'completed' AND source = 'user' AND completed_at >= CURRENT_DATE THEN 1 END),
    'admin_withdrawals_today', COUNT(CASE
      WHEN status = 'completed' AND source = 'admin' AND completed_at >= CURRENT_DATE THEN 1 END)
  ) INTO v_result
  FROM bnb_withdrawal_requests;

  RETURN v_result;
END;
$$;
