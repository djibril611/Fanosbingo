/*
  # Fix Critical RLS Security Vulnerabilities

  ## Summary
  Removes `USING (true)` policies that allow unauthorized access to sensitive data.
  
  ## Changes
  
  1. bank_sms_messages - CRITICAL: Remove all public access
  2. telegram_users - Remove public balance visibility  
  3. withdrawal_requests - Restrict to user's own requests
  4. settings - Remove public policies
  5. user_sms_submissions - Restrict to own submissions
*/

-- CRITICAL: Remove public access to bank SMS messages
DROP POLICY IF EXISTS "Anyone can read bank_sms_messages" ON bank_sms_messages;
DROP POLICY IF EXISTS "Any authenticated user can insert bank_sms_messages" ON bank_sms_messages;
DROP POLICY IF EXISTS "Any authenticated user can update bank_sms_messages" ON bank_sms_messages;
DROP POLICY IF EXISTS "Any authenticated user can delete bank_sms_messages" ON bank_sms_messages;

-- Remove public access to telegram_users 
DROP POLICY IF EXISTS "Anyone can read telegram_users" ON telegram_users;
DROP POLICY IF EXISTS "Any authenticated user can update own profile" ON telegram_users;
DROP POLICY IF EXISTS "For all users" ON telegram_users;

-- Fix withdrawal_requests - restrict to own withdrawals
DROP POLICY IF EXISTS "For all users" ON withdrawal_requests;

CREATE POLICY "Users can view own withdrawal requests"
  ON withdrawal_requests FOR SELECT
  USING (telegram_user_id IN (
    SELECT telegram_user_id FROM telegram_users 
    WHERE auth.uid()::text = id::text
  ));

-- Fix settings - remove public read
DROP POLICY IF EXISTS "For all users" ON settings;

-- Fix user_sms_submissions 
DROP POLICY IF EXISTS "For all users" ON user_sms_submissions;

CREATE POLICY "Users can view own SMS submissions"
  ON user_sms_submissions FOR SELECT
  USING (telegram_user_id IN (
    SELECT telegram_user_id FROM telegram_users 
    WHERE auth.uid()::text = id::text
  ));

-- Fix balance_transfers policies
DROP POLICY IF EXISTS "Anyone can read balance_transfers" ON balance_transfers;
DROP POLICY IF EXISTS "Any authenticated user can insert balance_transfers" ON balance_transfers;

-- Fix referral_bonuses policies
DROP POLICY IF EXISTS "Anyone can read referral_bonuses" ON referral_bonuses;
DROP POLICY IF EXISTS "Any authenticated user can insert referral_bonuses" ON referral_bonuses;

-- Fix game_state_snapshots
DROP POLICY IF EXISTS "For all users" ON game_state_snapshots;

-- Fix player_sessions
DROP POLICY IF EXISTS "For all users" ON player_sessions;
