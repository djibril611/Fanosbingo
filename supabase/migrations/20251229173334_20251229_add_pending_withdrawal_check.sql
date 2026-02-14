/*
  # Add pending withdrawal amount tracking

  1. New Functions
    - `get_pending_withdrawal_amount(user_id)` - Calculates total pending withdrawal amount for a user
  
  2. Changes
    - Adds a helper function to check pending withdrawal amounts across pending and processing withdrawals
    - Used to prevent game joining when user has active withdrawal requests

  3. Security
    - Function checks both pending and processing withdrawal statuses
*/

CREATE OR REPLACE FUNCTION get_pending_withdrawal_amount(user_id bigint)
RETURNS numeric AS $$
  SELECT COALESCE(SUM(amount), 0)
  FROM withdrawal_requests
  WHERE telegram_user_id = user_id
    AND status IN ('pending', 'processing');
$$ LANGUAGE SQL STABLE;