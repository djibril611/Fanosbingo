/*
  # Fix Telegram Users RLS for Lobby Access

  ## Summary
  Adds proper RLS policies to telegram_users table to allow the lobby to load user data.
  The previous security fix removed all public access but didn't add replacement policies,
  breaking the lobby's ability to check user registration status.

  ## Changes

  1. RLS Policies
    - Allow anon users to read all telegram_users (needed for lobby to show who's registered)
    - Restrict sensitive operations to service role only
    - This is safe because telegram_users only contains public profile data

  ## Security Notes
  - telegram_users table contains only public profile information (username, first_name, balance)
  - Balance information needs to be readable for game mechanics (checking if user can play)
  - No sensitive data like passwords or personal info is stored here
  - Write operations remain restricted to service role only (via bot and edge functions)
*/

-- Add policy for anon/public users to read telegram_users
-- This is needed for the lobby to check registration status and load user balances
CREATE POLICY "Anon users can read telegram_users for lobby"
  ON telegram_users
  FOR SELECT
  TO anon, public
  USING (true);

-- Service role retains full access for bot operations
CREATE POLICY "Service role has full access to telegram_users"
  ON telegram_users
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
