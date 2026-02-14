/*
  # Fix BNB Withdrawal Admin Visibility

  1. Security Changes
    - Add public SELECT policy on `bnb_withdrawal_requests` for admin panel access
    - Add public SELECT policy on `bnb_withdrawal_limits_tracking` for admin panel access

  2. Important Notes
    - Matches existing pattern used by `withdrawal_requests` and `telegram_users` tables
    - Admin panel uses anon key (public role) and needs access to view all records
    - Edge functions use service_role key which bypasses RLS
    - Write operations remain restricted to authenticated users and service_role
    - Policy checks that telegram_user_id references a valid user via foreign key
*/

CREATE POLICY "Admin can read all BNB withdrawal requests"
  ON bnb_withdrawal_requests FOR SELECT
  TO public
  USING (
    telegram_user_id IN (
      SELECT telegram_user_id FROM telegram_users
    )
  );

CREATE POLICY "Admin can read all BNB withdrawal limits"
  ON bnb_withdrawal_limits_tracking FOR SELECT
  TO public
  USING (
    telegram_user_id IN (
      SELECT telegram_user_id FROM telegram_users
    )
  );
