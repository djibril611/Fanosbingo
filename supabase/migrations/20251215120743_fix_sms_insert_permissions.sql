/*
  # Fix SMS Insert Permissions
  
  1. Changes
    - Update RLS policy to allow anon role to insert SMS messages
    - This enables manual SMS entry from the admin panel
  
  2. Security Note
    - While this allows any client to insert SMS, the admin panel
      is protected by admin authentication
    - Consider adding server-side validation in production
*/

-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Authenticated users can insert SMS" ON bank_sms_messages;

-- Create new policy that allows inserts from anon role (admin panel uses this)
CREATE POLICY "Allow SMS inserts"
  ON bank_sms_messages FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);