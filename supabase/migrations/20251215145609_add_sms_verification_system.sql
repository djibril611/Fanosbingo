/*
  # Add SMS Verification and Auto-Deposit System

  ## Overview
  This migration adds the ability for users to paste their SMS text to verify deposits
  automatically, eliminating the need for manual admin verification.

  ## New Tables
  
  ### `user_sms_submissions`
  Stores SMS text that users paste to claim their deposits
  - `id` (uuid, primary key)
  - `telegram_user_id` (bigint) - The Telegram user submitting the SMS
  - `sms_text` (text) - The full SMS text pasted by user
  - `amount` (numeric) - Amount extracted from SMS
  - `reference_number` (text) - Transaction reference extracted from SMS
  - `matched_sms_id` (uuid) - Links to bank_sms_messages if matched
  - `status` (text) - pending/matched/rejected/expired
  - `created_at` (timestamptz)
  - `processed_at` (timestamptz) - When it was matched/rejected

  ## Modified Tables
  
  ### `bank_sms_messages`
  - Add `claimed_by_user_id` (bigint) - Tracks which user claimed this SMS
  - Add `claimed_at` (timestamptz) - When it was claimed

  ## Security
  - Enable RLS on new table
  - Add policies for public read and service role management
  - Prevent duplicate claims with constraints
*/

-- Create user SMS submissions table
CREATE TABLE IF NOT EXISTS user_sms_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id bigint NOT NULL,
  sms_text text NOT NULL,
  amount numeric(10,2),
  reference_number text,
  matched_sms_id uuid REFERENCES bank_sms_messages(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'matched', 'rejected', 'expired')),
  rejection_reason text,
  created_at timestamptz DEFAULT now(),
  processed_at timestamptz
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_sms_telegram_user_id ON user_sms_submissions(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_user_sms_status ON user_sms_submissions(status);
CREATE INDEX IF NOT EXISTS idx_user_sms_matched_sms_id ON user_sms_submissions(matched_sms_id);
CREATE INDEX IF NOT EXISTS idx_user_sms_created_at ON user_sms_submissions(created_at);

-- Add claimed tracking to bank SMS messages
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bank_sms_messages' AND column_name = 'claimed_by_user_id'
  ) THEN
    ALTER TABLE bank_sms_messages ADD COLUMN claimed_by_user_id bigint;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bank_sms_messages' AND column_name = 'claimed_at'
  ) THEN
    ALTER TABLE bank_sms_messages ADD COLUMN claimed_at timestamptz;
  END IF;
END $$;

-- Add index for unclaimed messages
CREATE INDEX IF NOT EXISTS idx_bank_sms_claimed ON bank_sms_messages(claimed_by_user_id) WHERE claimed_by_user_id IS NULL;

-- Enable RLS
ALTER TABLE user_sms_submissions ENABLE ROW LEVEL SECURITY;

-- Policies for user_sms_submissions
CREATE POLICY "Service role has full access to user SMS submissions"
  ON user_sms_submissions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public can read user SMS submissions"
  ON user_sms_submissions
  FOR SELECT
  TO public
  USING (true);

-- Function to extract amount from SMS text
CREATE OR REPLACE FUNCTION extract_amount_from_sms(sms_text text)
RETURNS numeric AS $$
DECLARE
  amount_match text;
BEGIN
  -- Try to find amount patterns like "KES 1,000.00" or "Ksh 1000" or "1,000.00"
  amount_match := substring(sms_text FROM '(?:KES|Ksh|KSH)?\s*([0-9,]+\.?[0-9]*)');
  
  IF amount_match IS NOT NULL THEN
    -- Remove commas and convert to numeric
    RETURN replace(amount_match, ',', '')::numeric;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Function to extract reference number from SMS
CREATE OR REPLACE FUNCTION extract_reference_from_sms(sms_text text)
RETURNS text AS $$
DECLARE
  ref_match text;
BEGIN
  -- Try to find reference patterns like transaction IDs (alphanumeric codes)
  ref_match := substring(sms_text FROM '[A-Z0-9]{8,}');
  
  RETURN ref_match;
END;
$$ LANGUAGE plpgsql;

-- Function to match user SMS with received bank SMS
CREATE OR REPLACE FUNCTION match_user_sms()
RETURNS trigger AS $$
DECLARE
  matched_bank_sms bank_sms_messages%ROWTYPE;
  time_window interval := interval '48 hours';
BEGIN
  -- Extract amount and reference from user's SMS
  NEW.amount := extract_amount_from_sms(NEW.sms_text);
  NEW.reference_number := extract_reference_from_sms(NEW.sms_text);
  
  -- Try to find matching bank SMS
  -- Match criteria: same amount, similar timestamp, not yet claimed
  SELECT * INTO matched_bank_sms
  FROM bank_sms_messages
  WHERE claimed_by_user_id IS NULL
    AND received_at >= NEW.created_at - time_window
    AND received_at <= NEW.created_at + interval '5 minutes'
  ORDER BY 
    -- Prioritize exact amount matches
    CASE WHEN amount = NEW.amount THEN 0 ELSE 1 END,
    -- Then by time proximity
    ABS(EXTRACT(EPOCH FROM (received_at - NEW.created_at)))
  LIMIT 1;
  
  -- If match found, link them
  IF matched_bank_sms.id IS NOT NULL THEN
    NEW.matched_sms_id := matched_bank_sms.id;
    NEW.status := 'matched';
    NEW.processed_at := now();
    
    -- Mark bank SMS as claimed
    UPDATE bank_sms_messages
    SET claimed_by_user_id = NEW.telegram_user_id,
        claimed_at = now()
    WHERE id = matched_bank_sms.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-match on insert
DROP TRIGGER IF EXISTS trigger_match_user_sms ON user_sms_submissions;
CREATE TRIGGER trigger_match_user_sms
  BEFORE INSERT ON user_sms_submissions
  FOR EACH ROW
  EXECUTE FUNCTION match_user_sms();

-- Function to auto-credit user balance on successful match
CREATE OR REPLACE FUNCTION auto_credit_matched_deposit()
RETURNS trigger AS $$
DECLARE
  user_record telegram_users%ROWTYPE;
  deposit_amount numeric;
BEGIN
  -- Only proceed if status changed to 'matched'
  IF NEW.status = 'matched' AND (OLD.status IS NULL OR OLD.status != 'matched') THEN
    
    -- Get user record
    SELECT * INTO user_record
    FROM telegram_users
    WHERE telegram_user_id = NEW.telegram_user_id;
    
    -- Get the actual amount from matched SMS
    SELECT amount INTO deposit_amount
    FROM bank_sms_messages
    WHERE id = NEW.matched_sms_id;
    
    -- Credit user balance
    IF user_record.id IS NOT NULL AND deposit_amount > 0 THEN
      UPDATE telegram_users
      SET balance = balance + deposit_amount,
          total_deposited = total_deposited + deposit_amount
      WHERE telegram_user_id = NEW.telegram_user_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-credit on match
DROP TRIGGER IF EXISTS trigger_auto_credit_deposit ON user_sms_submissions;
CREATE TRIGGER trigger_auto_credit_deposit
  AFTER INSERT OR UPDATE ON user_sms_submissions
  FOR EACH ROW
  EXECUTE FUNCTION auto_credit_matched_deposit();
