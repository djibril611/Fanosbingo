/*
  # Create Telegram Users Table

  1. New Tables
    - `telegram_users`
      - `id` (uuid, primary key)
      - `telegram_user_id` (bigint, unique) - Telegram user ID
      - `telegram_username` (text) - Telegram username
      - `telegram_first_name` (text) - First name
      - `telegram_last_name` (text) - Last name
      - `balance` (integer) - User ETB balance
      - `created_at` (timestamptz) - Registration timestamp
      - `last_active_at` (timestamptz) - Last activity timestamp
  
  2. Security
    - Enable RLS on `telegram_users` table
    - Add policy for public read access (needed for game operations)
    - Service role can manage all records
  
  3. Indexes
    - Unique index on telegram_user_id for fast lookups
    
  4. Notes
    - Default balance is 10 ETB for new users
    - Balance can be updated by game operations
*/

CREATE TABLE IF NOT EXISTS telegram_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id bigint UNIQUE NOT NULL,
  telegram_username text,
  telegram_first_name text NOT NULL,
  telegram_last_name text,
  balance integer DEFAULT 10 NOT NULL,
  created_at timestamptz DEFAULT now(),
  last_active_at timestamptz DEFAULT now()
);

ALTER TABLE telegram_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read telegram users"
  ON telegram_users
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Service role can manage telegram users"
  ON telegram_users
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_telegram_users_telegram_user_id ON telegram_users(telegram_user_id);