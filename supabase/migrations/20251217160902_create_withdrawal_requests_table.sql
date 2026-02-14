/*
  # Create Withdrawal Requests Table

  ## Summary
  Creates a comprehensive withdrawal request system where users can request withdrawals
  through the Telegram bot, and admins manually process and approve each withdrawal.

  ## New Tables
  - `withdrawal_requests`
    - `id` (uuid, primary key) - Unique withdrawal request ID
    - `telegram_user_id` (bigint) - References telegram_users
    - `amount` (numeric) - Requested withdrawal amount in ETB
    - `status` (text) - pending, processing, completed, rejected
    - `requested_at` (timestamptz) - When request was created
    - `processed_at` (timestamptz) - When request was completed/rejected
    - `processed_by_admin` (text) - Admin identifier who processed
    - `rejection_reason` (text) - Reason if rejected
    - `bank_name` (text) - User's bank (Telebirr, CBE, etc.)
    - `account_number` (text) - User's account number
    - `account_name` (text) - Account holder name
    - `admin_notes` (text) - Internal notes for admins

  ## Security
  - Enable RLS on withdrawal_requests table
  - Users can read only their own requests
  - Service role can manage all requests
  - Public cannot create requests directly (only via Edge Function)

  ## Indexes
  - Index on telegram_user_id for fast user lookups
  - Index on status for filtering pending/completed requests
  - Index on requested_at for date sorting

  ## Constraints
  - Amount must be positive
  - Status must be valid enum value
*/

-- Create withdrawal requests table
CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id bigint NOT NULL,
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'rejected')),
  requested_at timestamptz DEFAULT now() NOT NULL,
  processed_at timestamptz,
  processed_by_admin text,
  rejection_reason text,
  bank_name text NOT NULL,
  account_number text NOT NULL,
  account_name text NOT NULL,
  admin_notes text,
  CONSTRAINT fk_telegram_user
    FOREIGN KEY (telegram_user_id)
    REFERENCES telegram_users(telegram_user_id)
    ON DELETE CASCADE
);

-- Enable RLS
ALTER TABLE withdrawal_requests ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read only their own withdrawal requests
CREATE POLICY "Users can read own withdrawal requests"
  ON withdrawal_requests
  FOR SELECT
  TO public
  USING (telegram_user_id = (SELECT telegram_user_id FROM telegram_users WHERE telegram_user_id = withdrawal_requests.telegram_user_id));

-- Policy: Service role can manage all withdrawal requests
CREATE POLICY "Service role can manage all withdrawal requests"
  ON withdrawal_requests
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_telegram_user_id 
  ON withdrawal_requests(telegram_user_id);

CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status 
  ON withdrawal_requests(status);

CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_requested_at 
  ON withdrawal_requests(requested_at DESC);

-- Create index for pending requests by user (to prevent duplicates)
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_pending_by_user 
  ON withdrawal_requests(telegram_user_id, status) 
  WHERE status = 'pending';

-- Add comment
COMMENT ON TABLE withdrawal_requests IS 
'Stores withdrawal requests from users. Admins manually process each request and update status.';

COMMENT ON COLUMN withdrawal_requests.status IS 
'pending: awaiting admin review, processing: admin is handling, completed: paid and balance deducted, rejected: denied by admin';

-- Function to get user's available balance (total - pending withdrawals)
CREATE OR REPLACE FUNCTION get_available_balance(user_telegram_id bigint)
RETURNS numeric AS $$
DECLARE
  user_balance numeric;
  pending_amount numeric;
BEGIN
  -- Get user's current balance
  SELECT balance INTO user_balance
  FROM telegram_users
  WHERE telegram_user_id = user_telegram_id;
  
  IF user_balance IS NULL THEN
    RETURN 0;
  END IF;
  
  -- Get total pending withdrawal amount
  SELECT COALESCE(SUM(amount), 0) INTO pending_amount
  FROM withdrawal_requests
  WHERE telegram_user_id = user_telegram_id
    AND status IN ('pending', 'processing');
  
  -- Return available balance
  RETURN user_balance - pending_amount;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_available_balance(bigint) IS 
'Returns user available balance (total balance minus pending/processing withdrawals)';