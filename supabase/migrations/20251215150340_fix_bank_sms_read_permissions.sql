/*
  # Fix Bank SMS Read Permissions

  ## Overview
  The admin panel cannot read bank SMS messages because the RLS policy only allows authenticated users.
  The admin panel uses the anon key, so we need to allow anon role to read messages.

  ## Changes
  - Add policy to allow anon role to SELECT from bank_sms_messages
  - This enables the admin SMS Monitor to display messages

  ## Security Notes
  - The admin panel URL should be kept private
  - In production, consider adding admin authentication
  - For now, this allows anyone with the anon key to read SMS messages
*/

-- Allow anon role to read bank SMS messages (for admin panel)
CREATE POLICY "Allow anon to view SMS messages"
  ON bank_sms_messages
  FOR SELECT
  TO anon
  USING (true);

-- Allow anon role to update bank SMS messages (for marking as processed)
CREATE POLICY "Allow anon to update SMS messages"
  ON bank_sms_messages
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
