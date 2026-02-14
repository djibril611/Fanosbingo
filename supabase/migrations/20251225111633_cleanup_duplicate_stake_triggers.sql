/*
  # Cleanup Duplicate Stake Deduction Triggers

  ## Problem
  There are two INSERT triggers on players table that both deduct stakes:
  - `deduct_stake_on_join` -> deduct_stake_on_join()
  - `deduct_stake_on_player_insert` -> deduct_stake_from_balance()

  This could cause double-deduction of stakes.

  ## Solution
  Keep only `deduct_stake_from_balance()` which is the newer, more correct implementation
  that handles both deposited_balance and won_balance properly.
*/

-- Drop the older trigger that uses the legacy function
DROP TRIGGER IF EXISTS deduct_stake_on_join ON players;

-- Drop the older function
DROP FUNCTION IF EXISTS deduct_stake_on_join() CASCADE;

-- Ensure only one deduction trigger exists
-- deduct_stake_on_player_insert with deduct_stake_from_balance() is kept
