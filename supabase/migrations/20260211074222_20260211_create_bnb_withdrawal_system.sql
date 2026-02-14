/*
  # BNB Crypto Withdrawal System

  1. New Tables
    - `bnb_withdrawal_requests`
      - Tracks all BNB crypto withdrawal requests with blockchain transaction details
      - Links to telegram_users for user tracking
      - Stores wallet address, signature, and blockchain transaction hash
      - Status: pending, processing, completed, failed, refunded
      - Separate from bank withdrawals

    - `bnb_withdrawal_limits_tracking`
      - Tracks daily and weekly BNB withdrawal totals per user
      - Auto-resets based on timestamps
      - Prevents users from exceeding limits

  2. Settings Updates
    - Add BNB withdrawal configuration: min/max amounts, conversion rate, contract details

  3. Security
    - Enable RLS on all withdrawal tables
    - Users can only view their own withdrawal requests
    - Only authenticated users can request withdrawals
    - Admin access handled through edge functions
    - Automatic limit validation
    - Balance separation enforcement (won_balance only)

  4. Functions
    - check_bnb_withdrawal_limits(): Validates daily/weekly limits
    - process_bnb_withdrawal_request(): Creates withdrawal with validation
    - refund_bnb_withdrawal(): Handles failed transaction refunds
    - complete_bnb_withdrawal(): Finalizes successful withdrawal
    - get_bnb_withdrawal_stats(): Provides statistics for admin dashboard

  5. Important Notes
    - Minimum withdrawal: 0.1 BNB (stored in credits equivalent)
    - Maximum daily: 5 BNB per user
    - Maximum weekly: 10 BNB per user
    - Only won_balance can be withdrawn (deposited_balance is locked)
    - Users cannot play with money pending withdrawal
    - Automatic transaction monitoring and status updates
*/

-- Create bnb_withdrawal_requests table
CREATE TABLE IF NOT EXISTS bnb_withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id bigint NOT NULL,
  wallet_address text NOT NULL,
  amount_credits numeric NOT NULL CHECK (amount_credits > 0),
  amount_bnb numeric NOT NULL CHECK (amount_bnb > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'refunded')),
  signature text,
  transaction_hash text,
  nonce text NOT NULL,
  error_message text,
  created_at timestamptz DEFAULT now(),
  processed_at timestamptz,
  completed_at timestamptz
);

-- Add foreign key constraint
ALTER TABLE bnb_withdrawal_requests 
  ADD CONSTRAINT fk_bnb_withdrawal_telegram_user 
  FOREIGN KEY (telegram_user_id) 
  REFERENCES telegram_users(telegram_user_id) 
  ON DELETE CASCADE;

-- Create withdrawal_limits_tracking table
CREATE TABLE IF NOT EXISTS bnb_withdrawal_limits_tracking (
  telegram_user_id bigint PRIMARY KEY,
  daily_total_bnb numeric DEFAULT 0 CHECK (daily_total_bnb >= 0),
  weekly_total_bnb numeric DEFAULT 0 CHECK (weekly_total_bnb >= 0),
  last_daily_reset timestamptz DEFAULT now(),
  last_weekly_reset timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add foreign key constraint
ALTER TABLE bnb_withdrawal_limits_tracking 
  ADD CONSTRAINT fk_bnb_limits_telegram_user 
  FOREIGN KEY (telegram_user_id) 
  REFERENCES telegram_users(telegram_user_id) 
  ON DELETE CASCADE;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_bnb_withdrawal_requests_user ON bnb_withdrawal_requests(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_bnb_withdrawal_requests_status ON bnb_withdrawal_requests(status);
CREATE INDEX IF NOT EXISTS idx_bnb_withdrawal_requests_created_at ON bnb_withdrawal_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bnb_withdrawal_requests_wallet ON bnb_withdrawal_requests(wallet_address);
CREATE INDEX IF NOT EXISTS idx_bnb_withdrawal_limits_tracking_user ON bnb_withdrawal_limits_tracking(telegram_user_id);

-- Enable RLS
ALTER TABLE bnb_withdrawal_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE bnb_withdrawal_limits_tracking ENABLE ROW LEVEL SECURITY;

-- RLS Policies for bnb_withdrawal_requests (users can view their own)
CREATE POLICY "Users can view own BNB withdrawal requests"
  ON bnb_withdrawal_requests FOR SELECT
  TO authenticated
  USING (
    telegram_user_id = (SELECT telegram_user_id FROM telegram_users WHERE telegram_users.id = auth.uid())
  );

CREATE POLICY "Users can insert own BNB withdrawal requests"
  ON bnb_withdrawal_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    telegram_user_id = (SELECT telegram_user_id FROM telegram_users WHERE telegram_users.id = auth.uid())
  );

-- RLS Policies for bnb_withdrawal_limits_tracking
CREATE POLICY "Users can view own BNB withdrawal limits"
  ON bnb_withdrawal_limits_tracking FOR SELECT
  TO authenticated
  USING (
    telegram_user_id = (SELECT telegram_user_id FROM telegram_users WHERE telegram_users.id = auth.uid())
  );

-- Add withdrawal settings
INSERT INTO settings (id, value, description) VALUES
  ('withdrawal_min_bnb', '0.1', 'Minimum BNB withdrawal amount'),
  ('withdrawal_max_daily_bnb', '5', 'Maximum BNB withdrawal per day per user'),
  ('withdrawal_max_weekly_bnb', '10', 'Maximum BNB withdrawal per week per user'),
  ('withdrawal_credits_to_bnb_rate', '1000', 'Conversion rate: 1 BNB = X credits'),
  ('withdrawal_contract_address', '', 'Smart contract address for BNB withdrawals'),
  ('withdrawal_contract_private_key', '', 'Private key for withdrawal contract (encrypted)'),
  ('withdrawal_low_balance_threshold', '10', 'Alert threshold for low contract balance in BNB')
ON CONFLICT (id) DO NOTHING;

-- Function to check if user can withdraw (limits validation)
CREATE OR REPLACE FUNCTION check_bnb_withdrawal_limits(
  p_telegram_user_id bigint,
  p_amount_bnb numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limits record;
  v_min_bnb numeric;
  v_max_daily_bnb numeric;
  v_max_weekly_bnb numeric;
  v_daily_remaining numeric;
  v_weekly_remaining numeric;
  v_user_won_balance numeric;
  v_credits_to_bnb_rate numeric;
  v_amount_credits numeric;
  v_has_pending boolean;
BEGIN
  -- Get withdrawal limits from settings
  SELECT
    (SELECT value::numeric FROM settings WHERE id = 'withdrawal_min_bnb'),
    (SELECT value::numeric FROM settings WHERE id = 'withdrawal_max_daily_bnb'),
    (SELECT value::numeric FROM settings WHERE id = 'withdrawal_max_weekly_bnb'),
    (SELECT value::numeric FROM settings WHERE id = 'withdrawal_credits_to_bnb_rate')
  INTO v_min_bnb, v_max_daily_bnb, v_max_weekly_bnb, v_credits_to_bnb_rate;

  -- Calculate amount in credits
  v_amount_credits := p_amount_bnb * v_credits_to_bnb_rate;

  -- Check for pending withdrawals
  SELECT EXISTS(
    SELECT 1 FROM bnb_withdrawal_requests
    WHERE telegram_user_id = p_telegram_user_id
    AND status IN ('pending', 'processing')
  ) INTO v_has_pending;

  IF v_has_pending THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'You have a pending withdrawal. Please wait for it to complete.',
      'code', 'PENDING_WITHDRAWAL'
    );
  END IF;

  -- Get or create user limits tracking
  INSERT INTO bnb_withdrawal_limits_tracking (telegram_user_id)
  VALUES (p_telegram_user_id)
  ON CONFLICT (telegram_user_id) DO NOTHING;

  -- Get current limits and reset if needed
  SELECT * INTO v_limits
  FROM bnb_withdrawal_limits_tracking
  WHERE telegram_user_id = p_telegram_user_id;

  -- Reset daily limit if 24 hours have passed
  IF EXTRACT(EPOCH FROM (now() - v_limits.last_daily_reset)) >= 86400 THEN
    UPDATE bnb_withdrawal_limits_tracking
    SET daily_total_bnb = 0,
        last_daily_reset = now()
    WHERE telegram_user_id = p_telegram_user_id;
    v_limits.daily_total_bnb := 0;
  END IF;

  -- Reset weekly limit if 7 days have passed
  IF EXTRACT(EPOCH FROM (now() - v_limits.last_weekly_reset)) >= 604800 THEN
    UPDATE bnb_withdrawal_limits_tracking
    SET weekly_total_bnb = 0,
        last_weekly_reset = now()
    WHERE telegram_user_id = p_telegram_user_id;
    v_limits.weekly_total_bnb := 0;
  END IF;

  -- Calculate remaining limits
  v_daily_remaining := v_max_daily_bnb - COALESCE(v_limits.daily_total_bnb, 0);
  v_weekly_remaining := v_max_weekly_bnb - COALESCE(v_limits.weekly_total_bnb, 0);

  -- Check minimum withdrawal
  IF p_amount_bnb < v_min_bnb THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', format('Minimum withdrawal is %s BNB', v_min_bnb),
      'code', 'BELOW_MINIMUM',
      'min_bnb', v_min_bnb
    );
  END IF;

  -- Check daily limit
  IF p_amount_bnb > v_daily_remaining THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', format('Daily limit exceeded. You can withdraw up to %s BNB more today', v_daily_remaining),
      'code', 'DAILY_LIMIT_EXCEEDED',
      'daily_remaining', v_daily_remaining,
      'daily_max', v_max_daily_bnb
    );
  END IF;

  -- Check weekly limit
  IF p_amount_bnb > v_weekly_remaining THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', format('Weekly limit exceeded. You can withdraw up to %s BNB more this week', v_weekly_remaining),
      'code', 'WEEKLY_LIMIT_EXCEEDED',
      'weekly_remaining', v_weekly_remaining,
      'weekly_max', v_max_weekly_bnb
    );
  END IF;

  -- Check user has sufficient won_balance
  SELECT won_balance INTO v_user_won_balance
  FROM telegram_users
  WHERE telegram_user_id = p_telegram_user_id;

  IF v_user_won_balance < v_amount_credits THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'Insufficient withdrawable balance',
      'code', 'INSUFFICIENT_BALANCE',
      'available_credits', v_user_won_balance,
      'available_bnb', v_user_won_balance / v_credits_to_bnb_rate
    );
  END IF;

  -- All checks passed
  RETURN jsonb_build_object(
    'allowed', true,
    'daily_remaining', v_daily_remaining - p_amount_bnb,
    'weekly_remaining', v_weekly_remaining - p_amount_bnb,
    'amount_credits', v_amount_credits
  );
END;
$$;

-- Function to process withdrawal request
CREATE OR REPLACE FUNCTION process_bnb_withdrawal_request(
  p_telegram_user_id bigint,
  p_wallet_address text,
  p_amount_bnb numeric,
  p_signature text,
  p_nonce text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_validation jsonb;
  v_amount_credits numeric;
  v_withdrawal_id uuid;
  v_credits_to_bnb_rate numeric;
BEGIN
  -- Validate withdrawal limits
  v_validation := check_bnb_withdrawal_limits(p_telegram_user_id, p_amount_bnb);

  IF NOT (v_validation->>'allowed')::boolean THEN
    RETURN v_validation;
  END IF;

  -- Get conversion rate
  SELECT value::numeric INTO v_credits_to_bnb_rate
  FROM settings WHERE id = 'withdrawal_credits_to_bnb_rate';

  v_amount_credits := p_amount_bnb * v_credits_to_bnb_rate;

  -- Deduct from won_balance
  UPDATE telegram_users
  SET won_balance = won_balance - v_amount_credits
  WHERE telegram_user_id = p_telegram_user_id
  AND won_balance >= v_amount_credits;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'Failed to lock balance. Please try again.',
      'code', 'BALANCE_LOCK_FAILED'
    );
  END IF;

  -- Create withdrawal request
  INSERT INTO bnb_withdrawal_requests (
    telegram_user_id,
    wallet_address,
    amount_credits,
    amount_bnb,
    signature,
    nonce,
    status
  ) VALUES (
    p_telegram_user_id,
    p_wallet_address,
    v_amount_credits,
    p_amount_bnb,
    p_signature,
    p_nonce,
    'pending'
  )
  RETURNING id INTO v_withdrawal_id;

  -- Update withdrawal limits
  UPDATE bnb_withdrawal_limits_tracking
  SET
    daily_total_bnb = daily_total_bnb + p_amount_bnb,
    weekly_total_bnb = weekly_total_bnb + p_amount_bnb,
    updated_at = now()
  WHERE telegram_user_id = p_telegram_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'withdrawal_id', v_withdrawal_id,
    'amount_bnb', p_amount_bnb,
    'amount_credits', v_amount_credits
  );
END;
$$;

-- Function to refund failed withdrawal
CREATE OR REPLACE FUNCTION refund_bnb_withdrawal(
  p_withdrawal_id uuid,
  p_error_message text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_withdrawal record;
BEGIN
  -- Get withdrawal details
  SELECT * INTO v_withdrawal
  FROM bnb_withdrawal_requests
  WHERE id = p_withdrawal_id
  AND status IN ('pending', 'processing', 'failed');

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Refund to won_balance
  UPDATE telegram_users
  SET won_balance = won_balance + v_withdrawal.amount_credits
  WHERE telegram_user_id = v_withdrawal.telegram_user_id;

  -- Rollback limits
  UPDATE bnb_withdrawal_limits_tracking
  SET
    daily_total_bnb = GREATEST(0, daily_total_bnb - v_withdrawal.amount_bnb),
    weekly_total_bnb = GREATEST(0, weekly_total_bnb - v_withdrawal.amount_bnb),
    updated_at = now()
  WHERE telegram_user_id = v_withdrawal.telegram_user_id;

  -- Update withdrawal status
  UPDATE bnb_withdrawal_requests
  SET
    status = 'refunded',
    error_message = p_error_message,
    processed_at = now()
  WHERE id = p_withdrawal_id;

  RETURN true;
END;
$$;

-- Function to complete withdrawal
CREATE OR REPLACE FUNCTION complete_bnb_withdrawal(
  p_withdrawal_id uuid,
  p_transaction_hash text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_withdrawal record;
BEGIN
  -- Get withdrawal details
  SELECT * INTO v_withdrawal
  FROM bnb_withdrawal_requests
  WHERE id = p_withdrawal_id
  AND status IN ('pending', 'processing');

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Update withdrawal status
  UPDATE bnb_withdrawal_requests
  SET
    status = 'completed',
    transaction_hash = p_transaction_hash,
    completed_at = now(),
    processed_at = now()
  WHERE id = p_withdrawal_id;

  -- Update total withdrawn for user
  UPDATE telegram_users
  SET total_withdrawn = COALESCE(total_withdrawn, 0) + v_withdrawal.amount_credits
  WHERE telegram_user_id = v_withdrawal.telegram_user_id;

  RETURN true;
END;
$$;

-- Add total_withdrawn to telegram_users if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'telegram_users' AND column_name = 'total_withdrawn'
  ) THEN
    ALTER TABLE telegram_users ADD COLUMN total_withdrawn numeric DEFAULT 0;
  END IF;
END $$;

-- Function to get withdrawal statistics
CREATE OR REPLACE FUNCTION get_bnb_withdrawal_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stats jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_withdrawn_today', COALESCE(SUM(amount_bnb) FILTER (
      WHERE created_at >= CURRENT_DATE AND status = 'completed'
    ), 0),
    'total_withdrawn_week', COALESCE(SUM(amount_bnb) FILTER (
      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days' AND status = 'completed'
    ), 0),
    'total_withdrawn_all_time', COALESCE(SUM(amount_bnb) FILTER (
      WHERE status = 'completed'
    ), 0),
    'pending_count', COUNT(*) FILTER (WHERE status IN ('pending', 'processing')),
    'pending_amount', COALESCE(SUM(amount_bnb) FILTER (
      WHERE status IN ('pending', 'processing')
    ), 0),
    'failed_today', COUNT(*) FILTER (
      WHERE status = 'failed' AND created_at >= CURRENT_DATE
    ),
    'completed_today', COUNT(*) FILTER (
      WHERE status = 'completed' AND created_at >= CURRENT_DATE
    )
  ) INTO v_stats
  FROM bnb_withdrawal_requests;

  RETURN v_stats;
END;
$$;
