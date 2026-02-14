/*
  # Add Bank Deposit Options System
  
  1. Purpose
    - Store bank account details for deposits
    - Allow admin to manage bank options
    - Display to users during /deposit command
  
  2. New Table: `bank_options`
    - `id` (uuid, primary key) - Unique identifier
    - `bank_name` (text) - Display name (e.g., "BOA (Abyssinia)", "CBE Birr")
    - `account_number` (text) - Bank account number or phone number
    - `account_name` (text) - Account holder name
    - `instructions` (text) - Step-by-step instructions for deposit
    - `is_active` (boolean) - Whether this option is currently available
    - `display_order` (integer) - Order to display banks in list
    - `created_at` (timestamptz) - When this bank was added
    - `updated_at` (timestamptz) - Last update time
  
  3. Security
    - Enable RLS on bank_options table
    - Anyone can view active bank options (for deposit)
    - Only authenticated users can see all banks
    - No insert/update/delete for regular users (admin only via edge functions)
  
  4. Initial Data
    - Add sample banks based on the screenshot provided
*/

-- Create bank_options table
CREATE TABLE IF NOT EXISTS bank_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name text NOT NULL,
  account_number text NOT NULL,
  account_name text,
  instructions text NOT NULL,
  is_active boolean DEFAULT true,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE bank_options ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view active bank options
CREATE POLICY "Anyone can view active banks"
  ON bank_options FOR SELECT
  USING (is_active = true);

-- Policy: Authenticated users can view all banks
CREATE POLICY "Authenticated users can view all banks"
  ON bank_options FOR SELECT
  TO authenticated
  USING (true);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_bank_options_active ON bank_options(is_active, display_order);

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_bank_options_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bank_options_updated_at
  BEFORE UPDATE ON bank_options
  FOR EACH ROW
  EXECUTE FUNCTION update_bank_options_updated_at();

-- Insert sample bank options based on screenshot
INSERT INTO bank_options (bank_name, account_number, account_name, instructions, display_order, is_active) VALUES
  (
    'Telebirr',
    '0972779234',
    'Mamaru',
    E'መመሪያ\n\n1. ከላይ ባለው የ Telebirr አካውንት ገንዘብን ያስገቡ\n2. ብራን ስትልከ የስፋልቶበትን መረጃ ይዝነ አጭር የጽሁፍ መልእክት(sms) ከ Telebirr ይደርሰሃል\n3. የደረሰህን አጭር የጽሁፍ መልእክት(sms) መሎውን ክፉ(copy) ስማራ ካታስ ባለው የቁፅርም የጽሁፍ ማስገብለው ላይ ኮስት(paste) ስማራ ይልቱ',
    1,
    true
  ),
  (
    'BOA (Abyssinia)',
    'TBD',
    'TBD',
    'Please contact support for BOA deposit instructions.',
    2,
    false
  ),
  (
    'CBE Birr',
    'TBD',
    'TBD',
    'Please contact support for CBE Birr deposit instructions.',
    3,
    false
  )
ON CONFLICT DO NOTHING;