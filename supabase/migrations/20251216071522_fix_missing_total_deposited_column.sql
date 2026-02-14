/*
  # Fix Missing total_deposited Column
  
  ## Overview
  The auto_credit_matched_deposit() function tries to update a `total_deposited` column
  that doesn't exist in the telegram_users table, causing SMS submissions to fail.
  
  ## Changes
  - Add `total_deposited` column to telegram_users table
  - This tracks the total amount a user has deposited
  
  ## Security
  - No RLS changes needed (existing policies cover this)
*/

-- Add total_deposited column to telegram_users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'telegram_users' AND column_name = 'total_deposited'
  ) THEN
    ALTER TABLE telegram_users ADD COLUMN total_deposited integer NOT NULL DEFAULT 0;
  END IF;
END $$;
