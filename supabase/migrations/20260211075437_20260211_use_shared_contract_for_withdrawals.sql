/*
  # Use Shared Contract for BNB Withdrawals

  1. Changes
    - Remove withdrawal-specific contract address settings
    - Use the existing deposit_contract_address for both deposits and withdrawals
    - Use the existing deposit_contract_private_key for withdrawal signing
    - Keep withdrawal-specific settings like limits and conversion rates

  2. Why
    - Simplifies contract management
    - Single contract handles both deposits and withdrawals
    - Reduces configuration complexity
    - Same private key used for both operations

  3. Settings Update
    - Remove: withdrawal_contract_address
    - Remove: withdrawal_contract_private_key
    - Keep: withdrawal_min_bnb, withdrawal_max_daily_bnb, withdrawal_max_weekly_bnb
    - Keep: withdrawal_credits_to_bnb_rate
    - Use: deposit_contract_address (existing)
    - Use: deposit_contract_private_key (existing)
*/

-- Remove withdrawal-specific contract settings (they're redundant)
DELETE FROM settings WHERE id IN ('withdrawal_contract_address', 'withdrawal_contract_private_key');

-- Update the low balance threshold setting description
UPDATE settings 
SET description = 'Alert threshold for low contract balance in BNB (for both deposits and withdrawals)'
WHERE id = 'withdrawal_low_balance_threshold';
