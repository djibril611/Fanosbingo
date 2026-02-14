/*
  # SMS Forwarding System
  
  1. Purpose
    - Store SMS messages forwarded from creator's phone
    - Parse transaction details from Telebirr SMS
    - Track deposit confirmations automatically
    - Provide audit trail of all deposits
  
  2. New Table: `bank_sms_messages`
    - `id` (uuid, primary key) - Unique identifier
    - `sender` (text) - SMS sender number (should be "127" for Telebirr)
    - `message_text` (text) - Full SMS message content
    - `received_at` (timestamptz) - When SMS was forwarded to server
    - `transaction_number` (text, nullable) - Extracted transaction ID
    - `amount` (numeric, nullable) - Extracted amount in Birr
    - `sender_name` (text, nullable) - Name of person who sent money
    - `sender_phone` (text, nullable) - Phone number of sender
    - `is_processed` (boolean) - Whether this SMS has been matched to a user
    - `processed_at` (timestamptz, nullable) - When it was processed
    - `telegram_user_id` (bigint, nullable) - Telegram ID of user who made deposit
    - `notes` (text, nullable) - Admin notes or processing info
    - `created_at` (timestamptz) - Record creation time
  
  3. Security
    - Enable RLS on bank_sms_messages
    - Only authenticated users (admins) can view/manage SMS messages
    - No public access to SMS data (contains sensitive information)
  
  4. Indexes
    - Index on sender for filtering Telebirr messages
    - Index on transaction_number for duplicate detection
    - Index on is_processed for showing pending SMS
    - Index on received_at for sorting
*/

-- Create bank_sms_messages table
CREATE TABLE IF NOT EXISTS bank_sms_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender text NOT NULL,
  message_text text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  transaction_number text,
  amount numeric(10, 2),
  sender_name text,
  sender_phone text,
  is_processed boolean DEFAULT false,
  processed_at timestamptz,
  telegram_user_id bigint,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE bank_sms_messages ENABLE ROW LEVEL SECURITY;

-- Policy: Only authenticated users (admins) can view SMS messages
CREATE POLICY "Authenticated users can view all SMS"
  ON bank_sms_messages FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Only authenticated users can insert SMS (from edge function)
CREATE POLICY "Authenticated users can insert SMS"
  ON bank_sms_messages FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy: Only authenticated users can update SMS
CREATE POLICY "Authenticated users can update SMS"
  ON bank_sms_messages FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_sms_sender ON bank_sms_messages(sender);
CREATE INDEX IF NOT EXISTS idx_sms_transaction_number ON bank_sms_messages(transaction_number) WHERE transaction_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sms_is_processed ON bank_sms_messages(is_processed);
CREATE INDEX IF NOT EXISTS idx_sms_received_at ON bank_sms_messages(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_telegram_user ON bank_sms_messages(telegram_user_id) WHERE telegram_user_id IS NOT NULL;

-- Add unique constraint on transaction_number to prevent duplicate processing
CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_unique_transaction 
  ON bank_sms_messages(transaction_number) 
  WHERE transaction_number IS NOT NULL;

-- Create function to auto-parse SMS text and extract transaction details
CREATE OR REPLACE FUNCTION parse_telebirr_sms()
RETURNS TRIGGER AS $$
DECLARE
  msg text;
BEGIN
  msg := NEW.message_text;
  
  -- Only parse if sender is 127 (Telebirr)
  IF NEW.sender = '127' THEN
    -- Try to extract transaction number (format: TBR followed by numbers)
    NEW.transaction_number := (regexp_match(msg, 'TBR[0-9]+'))[1];
    
    -- Try to extract amount (look for "ETB" or "Birr" followed by number)
    NEW.amount := (regexp_match(msg, 'ETB\s*([0-9]+\.?[0-9]*)'))[1]::numeric;
    IF NEW.amount IS NULL THEN
      NEW.amount := (regexp_match(msg, 'Birr\s*([0-9]+\.?[0-9]*)'))[1]::numeric;
    END IF;
    IF NEW.amount IS NULL THEN
      -- Try to find "transferred " followed by amount
      NEW.amount := (regexp_match(msg, 'transferred\s+([0-9]+\.?[0-9]*)'))[1]::numeric;
    END IF;
    
    -- Try to extract sender phone (09 followed by 8 digits)
    NEW.sender_phone := (regexp_match(msg, '(09[0-9]{8})'))[1];
    
    -- Try to extract sender name (usually after "Dear" and before "You")
    NEW.sender_name := trim((regexp_match(msg, 'from\s+([A-Za-z\s]+)\s+'))[1]);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-parse SMS on insert
CREATE TRIGGER parse_sms_on_insert
  BEFORE INSERT ON bank_sms_messages
  FOR EACH ROW
  EXECUTE FUNCTION parse_telebirr_sms();

-- Add API key to settings for SMS forwarding authentication
INSERT INTO settings (id, value, description) 
VALUES (
  'sms_api_key',
  encode(gen_random_bytes(32), 'hex'),
  'API key for authenticating SMS forwarding from phone app'
)
ON CONFLICT (id) DO NOTHING;