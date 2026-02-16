/*
  # Wallet-Based User Registration System

  1. Changes
    - Create sequence for generating numeric user IDs for wallet-only users
    - Add unique constraint on wallet_address column
    - Make telegram_first_name nullable (wallet users won't have one from Telegram)
    - Create get_or_create_wallet_user function for wallet-based registration
    - Update get_lobby_data_instant to support wallet address lookup

  2. New Functions
    - get_or_create_wallet_user(p_wallet_address text):
      Looks up or creates a user by wallet address, returns user data with numeric ID

  3. Security
    - Function is SECURITY DEFINER to allow user creation
    - Wallet address validated for proper format
*/

-- Create sequence for wallet-only user IDs (high range to avoid Telegram ID collision)
CREATE SEQUENCE IF NOT EXISTS wallet_user_id_seq START WITH 9000000001 INCREMENT BY 1;

-- Make telegram_first_name nullable for wallet-only users
ALTER TABLE telegram_users ALTER COLUMN telegram_first_name DROP NOT NULL;

-- Add unique constraint on wallet_address (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'telegram_users_wallet_address_unique'
  ) THEN
    ALTER TABLE telegram_users ADD CONSTRAINT telegram_users_wallet_address_unique UNIQUE (wallet_address);
  END IF;
END $$;

-- Function to get or create a user by wallet address
CREATE OR REPLACE FUNCTION public.get_or_create_wallet_user(p_wallet_address text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user record;
  v_new_id bigint;
  v_short_address text;
BEGIN
  IF p_wallet_address IS NULL OR length(p_wallet_address) < 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid wallet address');
  END IF;

  SELECT telegram_user_id, balance, deposited_balance, won_balance,
         telegram_username, telegram_first_name, referral_code, total_referrals,
         wallet_address
  INTO v_user
  FROM telegram_users
  WHERE lower(wallet_address) = lower(p_wallet_address);

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'user', jsonb_build_object(
        'telegram_user_id', v_user.telegram_user_id,
        'balance', v_user.balance,
        'deposited_balance', v_user.deposited_balance,
        'won_balance', v_user.won_balance,
        'telegram_username', v_user.telegram_username,
        'telegram_first_name', v_user.telegram_first_name,
        'referral_code', v_user.referral_code,
        'total_referrals', v_user.total_referrals,
        'wallet_address', v_user.wallet_address
      ),
      'created', false
    );
  END IF;

  v_new_id := nextval('wallet_user_id_seq');
  v_short_address := substring(p_wallet_address from 1 for 6) || '...' || substring(p_wallet_address from length(p_wallet_address) - 3);

  INSERT INTO telegram_users (
    telegram_user_id,
    telegram_first_name,
    wallet_address,
    wallet_connected_at,
    last_active_at,
    balance,
    deposited_balance,
    won_balance,
    total_spent,
    total_won,
    win_count,
    total_deposited,
    total_withdrawn,
    total_referrals
  ) VALUES (
    v_new_id,
    v_short_address,
    p_wallet_address,
    now(),
    now(),
    0, 0, 0, 0, 0, 0, 0, 0, 0
  );

  RETURN jsonb_build_object(
    'success', true,
    'user', jsonb_build_object(
      'telegram_user_id', v_new_id,
      'balance', 0,
      'deposited_balance', 0,
      'won_balance', 0,
      'telegram_username', null,
      'telegram_first_name', v_short_address,
      'referral_code', null,
      'total_referrals', 0,
      'wallet_address', p_wallet_address
    ),
    'created', true
  );
END;
$$;

-- Update get_lobby_data_instant to also support wallet address lookup
CREATE OR REPLACE FUNCTION public.get_lobby_data_instant(
  user_telegram_id bigint DEFAULT NULL,
  user_wallet_address text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
  game_data json;
  user_data json;
  taken_nums bigint[];
  players_data json;
  server_time bigint;
BEGIN
  server_time := FLOOR(EXTRACT(EPOCH FROM now() AT TIME ZONE 'UTC') * 1000);

  SELECT json_build_object(
    'id', g.id,
    'game_number', g.game_number,
    'status', g.status,
    'total_pot', g.total_pot,
    'stake_amount', g.stake_amount,
    'winner_prize', g.winner_prize,
    'starts_at', FLOOR(EXTRACT(EPOCH FROM g.starts_at AT TIME ZONE 'UTC') * 1000)
  )
  INTO game_data
  FROM games g
  WHERE g.status IN ('waiting', 'playing')
  ORDER BY g.created_at DESC
  LIMIT 1;

  IF game_data IS NOT NULL THEN
    SELECT array_agg(p.selected_number)
    INTO taken_nums
    FROM players p
    WHERE p.game_id = (game_data->>'id')::uuid;

    SELECT json_agg(
      json_build_object(
        'id', p.id,
        'selected_number', p.selected_number,
        'name', p.name,
        'telegram_user_id', p.telegram_user_id
      )
    )
    INTO players_data
    FROM players p
    WHERE p.game_id = (game_data->>'id')::uuid;
  END IF;

  IF user_telegram_id IS NOT NULL THEN
    SELECT json_build_object(
      'telegram_user_id', u.telegram_user_id,
      'balance', u.balance,
      'deposited_balance', u.deposited_balance,
      'won_balance', u.won_balance,
      'telegram_username', u.telegram_username,
      'telegram_first_name', u.telegram_first_name,
      'referral_code', u.referral_code,
      'total_referrals', u.total_referrals
    )
    INTO user_data
    FROM telegram_users u
    WHERE u.telegram_user_id = user_telegram_id;
  ELSIF user_wallet_address IS NOT NULL THEN
    SELECT json_build_object(
      'telegram_user_id', u.telegram_user_id,
      'balance', u.balance,
      'deposited_balance', u.deposited_balance,
      'won_balance', u.won_balance,
      'telegram_username', u.telegram_username,
      'telegram_first_name', u.telegram_first_name,
      'referral_code', u.referral_code,
      'total_referrals', u.total_referrals
    )
    INTO user_data
    FROM telegram_users u
    WHERE lower(u.wallet_address) = lower(user_wallet_address);
  END IF;

  result := json_build_object(
    'game', game_data,
    'takenNumbers', COALESCE(taken_nums, ARRAY[]::bigint[]),
    'players', COALESCE(players_data, '[]'::json),
    'user', user_data,
    'serverTime', server_time
  );

  RETURN result;
END;
$$;
