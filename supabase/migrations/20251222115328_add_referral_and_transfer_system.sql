/*
  # Add Referral System and Balance Transfer

  1. Changes to telegram_users table
    - Add `referred_by` column to track who referred this user
    - Add `referral_code` column for unique referral identifier
    - Add `total_referrals` column to count successful referrals

  2. New Tables
    - `balance_transfers`
      - `id` (uuid, primary key)
      - `from_user_id` (bigint, references telegram_users)
      - `to_user_id` (bigint, references telegram_users)
      - `amount` (integer)
      - `transfer_type` (text) - 'user_transfer', 'referral_bonus', 'welcome_bonus'
      - `created_at` (timestamptz)
    - `referral_bonuses`
      - `id` (uuid, primary key)
      - `referrer_id` (bigint, references telegram_users)
      - `referred_id` (bigint, references telegram_users)
      - `bonus_amount` (integer)
      - `created_at` (timestamptz)

  3. Security
    - Enable RLS on new tables
    - Add policies for authenticated users to view their own transfers
    - Add function to handle referral bonus distribution
*/

-- Add referral columns to telegram_users table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'telegram_users' AND column_name = 'referred_by'
  ) THEN
    ALTER TABLE telegram_users ADD COLUMN referred_by bigint;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'telegram_users' AND column_name = 'referral_code'
  ) THEN
    ALTER TABLE telegram_users ADD COLUMN referral_code text UNIQUE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'telegram_users' AND column_name = 'total_referrals'
  ) THEN
    ALTER TABLE telegram_users ADD COLUMN total_referrals integer DEFAULT 0;
  END IF;
END $$;

-- Create balance_transfers table
CREATE TABLE IF NOT EXISTS balance_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id bigint REFERENCES telegram_users(telegram_user_id) ON DELETE CASCADE,
  to_user_id bigint NOT NULL REFERENCES telegram_users(telegram_user_id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount > 0),
  transfer_type text NOT NULL CHECK (transfer_type IN ('user_transfer', 'referral_bonus', 'welcome_bonus')),
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Create referral_bonuses table
CREATE TABLE IF NOT EXISTS referral_bonuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id bigint NOT NULL REFERENCES telegram_users(telegram_user_id) ON DELETE CASCADE,
  referred_id bigint NOT NULL REFERENCES telegram_users(telegram_user_id) ON DELETE CASCADE,
  bonus_amount integer NOT NULL DEFAULT 10,
  created_at timestamptz DEFAULT now(),
  UNIQUE(referrer_id, referred_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_balance_transfers_from_user ON balance_transfers(from_user_id);
CREATE INDEX IF NOT EXISTS idx_balance_transfers_to_user ON balance_transfers(to_user_id);
CREATE INDEX IF NOT EXISTS idx_referral_bonuses_referrer ON referral_bonuses(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_bonuses_referred ON referral_bonuses(referred_id);
CREATE INDEX IF NOT EXISTS idx_telegram_users_referral_code ON telegram_users(referral_code);

-- Enable RLS
ALTER TABLE balance_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_bonuses ENABLE ROW LEVEL SECURITY;

-- Policies for balance_transfers
CREATE POLICY "Users can view their own transfers"
  ON balance_transfers FOR SELECT
  TO authenticated
  USING (
    from_user_id IN (SELECT telegram_user_id FROM telegram_users WHERE id = auth.uid())
    OR to_user_id IN (SELECT telegram_user_id FROM telegram_users WHERE id = auth.uid())
  );

CREATE POLICY "Users can view their transfers as anon"
  ON balance_transfers FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "System can insert transfers"
  ON balance_transfers FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "System can insert transfers as anon"
  ON balance_transfers FOR INSERT
  TO anon
  WITH CHECK (true);

-- Policies for referral_bonuses
CREATE POLICY "Users can view their referral bonuses"
  ON referral_bonuses FOR SELECT
  TO authenticated
  USING (
    referrer_id IN (SELECT telegram_user_id FROM telegram_users WHERE id = auth.uid())
    OR referred_id IN (SELECT telegram_user_id FROM telegram_users WHERE id = auth.uid())
  );

CREATE POLICY "Users can view referral bonuses as anon"
  ON referral_bonuses FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "System can insert referral bonuses"
  ON referral_bonuses FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "System can insert referral bonuses as anon"
  ON referral_bonuses FOR INSERT
  TO anon
  WITH CHECK (true);

-- Function to generate unique referral code
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  code text;
  exists boolean;
BEGIN
  LOOP
    -- Generate a random 8-character alphanumeric code
    code := upper(substring(md5(random()::text) from 1 for 8));

    -- Check if code already exists
    SELECT EXISTS(SELECT 1 FROM telegram_users WHERE referral_code = code) INTO exists;

    EXIT WHEN NOT exists;
  END LOOP;

  RETURN code;
END;
$$;

-- Function to handle referral bonus distribution
CREATE OR REPLACE FUNCTION handle_referral_bonus(
  new_user_telegram_id bigint,
  referrer_code text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  referrer_telegram_id bigint;
  referrer_user_id uuid;
  new_user_id uuid;
  result json;
BEGIN
  -- Find the referrer by referral code
  SELECT telegram_user_id, id INTO referrer_telegram_id, referrer_user_id
  FROM telegram_users
  WHERE referral_code = referrer_code
  LIMIT 1;

  -- If referrer not found, return error
  IF referrer_telegram_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid referral code');
  END IF;

  -- Get new user's id
  SELECT id INTO new_user_id
  FROM telegram_users
  WHERE telegram_user_id = new_user_telegram_id
  LIMIT 1;

  -- Check if bonus already given
  IF EXISTS(SELECT 1 FROM referral_bonuses WHERE referrer_id = referrer_telegram_id AND referred_id = new_user_telegram_id) THEN
    RETURN json_build_object('success', false, 'error', 'Referral bonus already claimed');
  END IF;

  -- Update referred_by field
  UPDATE telegram_users
  SET referred_by = referrer_telegram_id
  WHERE telegram_user_id = new_user_telegram_id;

  -- Give 10 ETB to new user (welcome bonus)
  UPDATE telegram_users
  SET deposited_balance = deposited_balance + 10
  WHERE telegram_user_id = new_user_telegram_id;

  -- Give 10 ETB to referrer (referral bonus)
  UPDATE telegram_users
  SET deposited_balance = deposited_balance + 10,
      total_referrals = total_referrals + 1
  WHERE telegram_user_id = referrer_telegram_id;

  -- Record referral bonus
  INSERT INTO referral_bonuses (referrer_id, referred_id, bonus_amount)
  VALUES (referrer_telegram_id, new_user_telegram_id, 10);

  -- Record welcome bonus transfer
  INSERT INTO balance_transfers (from_user_id, to_user_id, amount, transfer_type, notes)
  VALUES (NULL, new_user_telegram_id, 10, 'welcome_bonus', 'Welcome bonus via referral');

  -- Record referral bonus transfer
  INSERT INTO balance_transfers (from_user_id, to_user_id, amount, transfer_type, notes)
  VALUES (NULL, referrer_telegram_id, 10, 'referral_bonus', 'Referral bonus for inviting user');

  result := json_build_object(
    'success', true,
    'referrer_bonus', 10,
    'new_user_bonus', 10
  );

  RETURN result;
END;
$$;

-- Function to transfer balance between users
CREATE OR REPLACE FUNCTION transfer_balance(
  from_telegram_id bigint,
  transfer_amount integer,
  to_telegram_id bigint
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
  -- Check sender's balance (only won_balance can be transferred)
  SELECT won_balance INTO from_balance
  FROM telegram_users
  WHERE telegram_user_id = from_telegram_id
  FOR UPDATE;

  -- Check if sender has enough balance
  IF from_balance < transfer_amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient withdrawable balance');
  END IF;

  -- Check if recipient exists
  IF NOT EXISTS(SELECT 1 FROM telegram_users WHERE telegram_user_id = to_telegram_id) THEN
    RETURN json_build_object('success', false, 'error', 'Recipient not found');
  END IF;

  -- Cannot transfer to self
  IF from_telegram_id = to_telegram_id THEN
    RETURN json_build_object('success', false, 'error', 'Cannot transfer to yourself');
  END IF;

  -- Deduct from sender's won_balance
  UPDATE telegram_users
  SET won_balance = won_balance - transfer_amount
  WHERE telegram_user_id = from_telegram_id;

  -- Add to recipient's deposited_balance
  UPDATE telegram_users
  SET deposited_balance = deposited_balance + transfer_amount
  WHERE telegram_user_id = to_telegram_id;

  -- Record the transfer
  INSERT INTO balance_transfers (from_user_id, to_user_id, amount, transfer_type, notes)
  VALUES (from_telegram_id, to_telegram_id, transfer_amount, 'user_transfer', 'User-to-user transfer');

  result := json_build_object(
    'success', true,
    'amount', transfer_amount,
    'from_user', from_telegram_id,
    'to_user', to_telegram_id
  );

  RETURN result;
END;
$$;

-- Trigger to generate referral code on user registration
CREATE OR REPLACE FUNCTION assign_referral_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := generate_referral_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_referral_code_trigger ON telegram_users;
CREATE TRIGGER assign_referral_code_trigger
  BEFORE INSERT ON telegram_users
  FOR EACH ROW
  EXECUTE FUNCTION assign_referral_code();
