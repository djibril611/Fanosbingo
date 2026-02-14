/*
  # Add Balance Refund on Player Delete

  1. Changes
    - Add trigger function to refund stake amount when player is deleted
    - This allows players to deselect their number and get their money back

  2. Security
    - Function runs with security definer to have proper access
    - Only refunds if player has paid stake (stake_paid = true)
    - Updates pot amounts when player is removed

  ## How it Works
  When a player is deleted:
  1. If they have paid their stake (stake_paid = true)
  2. Their balance is refunded
  3. Game pot amounts are updated
*/

-- Function to refund stake when player is deleted
CREATE OR REPLACE FUNCTION refund_stake_on_player_delete()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  game_stake_amount integer;
BEGIN
  -- Only process if player has paid stake
  IF OLD.stake_paid = true AND OLD.telegram_user_id IS NOT NULL THEN
    -- Get the stake amount from the game
    SELECT stake_amount INTO game_stake_amount
    FROM games
    WHERE id = OLD.game_id;

    -- Refund the balance
    UPDATE telegram_users
    SET balance = balance + game_stake_amount
    WHERE telegram_user_id = OLD.telegram_user_id;

    -- Update game pot amounts
    UPDATE games
    SET 
      total_pot = GREATEST(0, total_pot - game_stake_amount),
      winner_prize = GREATEST(0, FLOOR((total_pot - game_stake_amount) * prize_percentage / 100)),
      platform_fee = GREATEST(0, FLOOR((total_pot - game_stake_amount) * (1 - prize_percentage / 100.0)))
    WHERE id = OLD.game_id;
  END IF;

  RETURN OLD;
END;
$$;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS refund_stake_on_player_delete ON players;

-- Create trigger to refund stake when player is deleted
CREATE TRIGGER refund_stake_on_player_delete
  BEFORE DELETE ON players
  FOR EACH ROW
  EXECUTE FUNCTION refund_stake_on_player_delete();
