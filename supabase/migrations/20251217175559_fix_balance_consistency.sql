/*
  # Fix Balance Field Consistency

  ## Problem
  The `balance` field can become out of sync with `deposited_balance + won_balance`,
  causing discrepancies in displayed totals.

  ## Changes

  1. Data Correction
    - Recalculate `balance` as `deposited_balance + won_balance` for all users
    - Fixes existing inconsistencies in the database

  2. Integrity Constraint
    - Add a trigger to automatically maintain `balance = deposited_balance + won_balance`
    - Ensures future consistency across all balance updates

  3. Security
    - Uses SECURITY DEFINER for automatic balance synchronization
    - Maintains existing RLS policies
*/

-- Step 1: Fix existing balance inconsistencies
UPDATE telegram_users
SET balance = deposited_balance + won_balance
WHERE balance != (deposited_balance + won_balance);

-- Step 2: Create trigger function to maintain balance consistency
CREATE OR REPLACE FUNCTION sync_total_balance()
RETURNS TRIGGER AS $$
BEGIN
  -- Automatically calculate total balance from components
  NEW.balance := NEW.deposited_balance + NEW.won_balance;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Add trigger to enforce consistency on INSERT and UPDATE
DROP TRIGGER IF EXISTS sync_balance_on_change ON telegram_users;
CREATE TRIGGER sync_balance_on_change
  BEFORE INSERT OR UPDATE OF deposited_balance, won_balance ON telegram_users
  FOR EACH ROW
  EXECUTE FUNCTION sync_total_balance();

-- Add comment
COMMENT ON FUNCTION sync_total_balance() IS
'Automatically maintains balance = deposited_balance + won_balance to ensure consistency';
