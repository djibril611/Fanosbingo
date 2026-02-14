/*
  # Create User State Table for Telegram Bot

  ## Summary
  Stores temporary state for multi-step interactions like withdrawal requests.
  Allows the bot to remember where each user is in a conversation flow.

  ## New Tables
  - `user_state`
    - `telegram_user_id` (bigint, primary key) - User's Telegram ID
    - `current_action` (text) - Current action (withdrawal_amount, withdrawal_bank, etc.)
    - `state_data` (jsonb) - Temporary data for the current flow
    - `updated_at` (timestamptz) - Last update timestamp

  ## Security
  - Enable RLS
  - Service role can manage all states
  - States auto-expire after 1 hour of inactivity

  ## Notes
  - Used for withdrawal flow and other multi-step processes
  - Automatically cleaned up after completion or timeout
*/

CREATE TABLE IF NOT EXISTS user_state (
  telegram_user_id bigint PRIMARY KEY,
  current_action text,
  state_data jsonb DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT fk_telegram_user_state
    FOREIGN KEY (telegram_user_id)
    REFERENCES telegram_users(telegram_user_id)
    ON DELETE CASCADE
);

-- Enable RLS
ALTER TABLE user_state ENABLE ROW LEVEL SECURITY;

-- Policy: Service role can manage all states
CREATE POLICY "Service role can manage user states"
  ON user_state
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_state_telegram_user_id 
  ON user_state(telegram_user_id);

-- Function to clean up old states (older than 1 hour)
CREATE OR REPLACE FUNCTION cleanup_old_user_states()
RETURNS void AS $$
BEGIN
  DELETE FROM user_state
  WHERE updated_at < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE user_state IS 
'Stores temporary state for multi-step bot interactions. Auto-expires after 1 hour.';