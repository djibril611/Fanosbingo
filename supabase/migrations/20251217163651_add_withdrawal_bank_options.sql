/*
  # Add Withdrawal Bank Options Table

  1. New Tables
    - `withdrawal_bank_options`
      - `id` (uuid, primary key)
      - `bank_name` (text) - Name of the bank (e.g., "Telebirr")
      - `is_active` (boolean) - Whether this option is available
      - `display_order` (integer) - Order to display in list
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `withdrawal_bank_options` table
    - Add policy for users to read active options
    - Add policy for authenticated users to manage options (admin only in practice)

  3. Initial Data
    - Add Telebirr as the default withdrawal option
*/

-- Create withdrawal bank options table
CREATE TABLE IF NOT EXISTS withdrawal_bank_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name text NOT NULL,
  is_active boolean DEFAULT true,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE withdrawal_bank_options ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read active withdrawal bank options
CREATE POLICY "Anyone can read active withdrawal banks"
  ON withdrawal_bank_options
  FOR SELECT
  USING (is_active = true);

-- Allow service role to manage withdrawal bank options
CREATE POLICY "Service role can manage withdrawal banks"
  ON withdrawal_bank_options
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Insert Telebirr as default option
INSERT INTO withdrawal_bank_options (bank_name, is_active, display_order)
VALUES ('Telebirr', true, 1)
ON CONFLICT DO NOTHING;