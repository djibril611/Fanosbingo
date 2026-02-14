/*
  # Clear All Users

  This migration removes all user data from the system to start fresh.
  
  1. Deletes all user-related data
    - user_sms_submissions (SMS submissions by users)
    - withdrawal_requests (withdrawal requests)
    - user_state (user session state)
    - telegram_users (main user table)
*/

DELETE FROM user_sms_submissions;
DELETE FROM withdrawal_requests;
DELETE FROM user_state;
DELETE FROM telegram_users;

-- Reset sequences if any
ALTER SEQUENCE IF EXISTS user_sms_submissions_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS withdrawal_requests_id_seq RESTART WITH 1;