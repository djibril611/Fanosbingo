/*
  # Smart Contract Deposit System

  1. New Tables
    - `deposit_transactions`
      - `id` (uuid, primary key)
      - `transaction_hash` (text, unique) - Blockchain transaction hash
      - `wallet_address` (text) - Depositor's wallet address
      - `telegram_user_id` (bigint) - User's Telegram ID
      - `amount_bnb` (numeric) - Amount deposited in BNB
      - `amount_credits` (numeric) - Game credits calculated
      - `status` (text) - pending, confirmed, failed, processed
      - `block_number` (bigint) - Block number of transaction
      - `confirmations` (integer) - Number of confirmations
      - `processed_at` (timestamptz) - When balance was credited
      - `created_at` (timestamptz) - When transaction was detected
      - `updated_at` (timestamptz) - Last update timestamp

  2. Settings Updates
    - Add deposit contract address setting
    - Add conversion rate setting
    - Add minimum deposit setting
    - Add required confirmations setting

  3. Security
    - Enable RLS on deposit_transactions table
    - Public can view all transactions (for transparency)
    - Only service role can insert/update transactions

  4. Indexes
    - Index on transaction_hash for fast lookups
    - Index on wallet_address for user queries
    - Index on telegram_user_id for balance updates
    - Index on status for processing queries
    - Index on created_at for chronological queries
*/

-- Create deposit_transactions table
CREATE TABLE IF NOT EXISTS deposit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_hash text UNIQUE NOT NULL,
  wallet_address text NOT NULL,
  telegram_user_id bigint,
  amount_bnb numeric(20, 8) NOT NULL,
  amount_credits numeric(20, 2) NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  block_number bigint,
  confirmations integer DEFAULT 0,
  processed_at timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_status CHECK (status IN ('pending', 'confirmed', 'failed', 'processed'))
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_deposit_transactions_hash ON deposit_transactions(transaction_hash);
CREATE INDEX IF NOT EXISTS idx_deposit_transactions_wallet ON deposit_transactions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_deposit_transactions_user_id ON deposit_transactions(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_deposit_transactions_status ON deposit_transactions(status);
CREATE INDEX IF NOT EXISTS idx_deposit_transactions_created_at ON deposit_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deposit_transactions_block ON deposit_transactions(block_number);

-- Enable RLS
ALTER TABLE deposit_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Anyone can view transactions (transparency)
CREATE POLICY "Anyone can view deposit transactions"
  ON deposit_transactions
  FOR SELECT
  TO public
  USING (true);

-- Add deposit settings to settings table
INSERT INTO settings (id, value, description, updated_at)
VALUES 
  ('deposit_contract_address', '', 'Smart contract address for BNB deposits', now()),
  ('deposit_conversion_rate', '100000', 'Conversion rate: 1 BNB = X credits', now()),
  ('deposit_minimum_bnb', '0.001', 'Minimum deposit amount in BNB', now()),
  ('deposit_required_confirmations', '3', 'Required blockchain confirmations', now()),
  ('deposit_contract_chain_id', '56', 'BSC Chain ID (56 mainnet, 97 testnet)', now()),
  ('deposit_bsc_rpc_url', 'https://bsc-dataseed.binance.org/', 'BSC RPC endpoint', now())
ON CONFLICT (id) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_at = now();

-- Function to process confirmed deposits
CREATE OR REPLACE FUNCTION process_confirmed_deposit()
RETURNS TRIGGER AS $$
DECLARE
  user_id bigint;
BEGIN
  -- Only process when status changes to 'confirmed' and not yet processed
  IF NEW.status = 'confirmed' AND OLD.status != 'confirmed' AND NEW.processed_at IS NULL THEN
    
    -- Get or verify user ID
    IF NEW.telegram_user_id IS NULL THEN
      RAISE EXCEPTION 'Cannot process deposit: telegram_user_id is NULL';
    END IF;
    
    user_id := NEW.telegram_user_id;
    
    -- Credit the user's deposited_balance
    UPDATE telegram_users
    SET 
      deposited_balance = deposited_balance + NEW.amount_credits,
      total_deposited = COALESCE(total_deposited, 0) + NEW.amount_credits,
      updated_at = now()
    WHERE telegram_user_id = user_id;
    
    -- Check if user was found and updated
    IF NOT FOUND THEN
      RAISE EXCEPTION 'User not found: %', user_id;
    END IF;
    
    -- Mark transaction as processed
    NEW.processed_at := now();
    NEW.status := 'processed';
    NEW.updated_at := now();
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-process confirmed deposits
DROP TRIGGER IF EXISTS trigger_process_confirmed_deposit ON deposit_transactions;
CREATE TRIGGER trigger_process_confirmed_deposit
  BEFORE UPDATE ON deposit_transactions
  FOR EACH ROW
  EXECUTE FUNCTION process_confirmed_deposit();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_deposit_transaction_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update timestamp
DROP TRIGGER IF EXISTS trigger_update_deposit_transaction_timestamp ON deposit_transactions;
CREATE TRIGGER trigger_update_deposit_transaction_timestamp
  BEFORE UPDATE ON deposit_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_deposit_transaction_timestamp();
