/*
  # Fix Card Selection - Remove Ambiguous Function Overloads

  1. Problem
    - Two overloaded versions of `select_card_atomic` exist (JSONB and array-based)
    - PostgreSQL cannot determine which to call, causing "function is not unique" errors
    - Users see "Unable to select this card" when trying to join games
    - The `deduct_stake_from_balance` trigger still enforces balance checks
      even though the testnet version of select_card_atomic removed them

  2. Solution
    - Drop both overloaded versions
    - Recreate a single clean JSONB version (compatible with Supabase JS / PostgREST)
    - Update deduct_stake_from_balance to skip deduction when balance is 0
      (testnet compatibility - smart contract provides funds)

  3. Changes
    - Single `select_card_atomic` function with JSONB parameters
    - Updated `deduct_stake_from_balance` to handle zero-balance testnet users
*/

-- Drop both overloaded versions
DROP FUNCTION IF EXISTS select_card_atomic(uuid, integer, bigint, text, text, text, text, jsonb, jsonb, jsonb);
DROP FUNCTION IF EXISTS select_card_atomic(uuid, integer, bigint, text, integer[], integer[], boolean[], text, text, text);

-- Recreate single clean version with JSONB params
CREATE OR REPLACE FUNCTION select_card_atomic(
  p_game_id uuid,
  p_card_number integer,
  p_telegram_user_id bigint,
  p_player_name text,
  p_card jsonb DEFAULT NULL,
  p_card_numbers jsonb DEFAULT NULL,
  p_marked_cells jsonb DEFAULT NULL,
  p_telegram_username text DEFAULT NULL,
  p_telegram_first_name text DEFAULT NULL,
  p_telegram_last_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game RECORD;
  v_user RECORD;
  v_existing_player uuid;
  v_current_time timestamptz;
  v_player_id uuid;
BEGIN
  v_current_time := now();

  SELECT id, status, stake_amount, selection_closed_at, starts_at, allow_late_joins
  INTO v_game
  FROM games
  WHERE id = p_game_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Game not found',
      'error_code', 'GAME_NOT_FOUND'
    );
  END IF;

  IF v_game.status != 'waiting' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Game is no longer accepting players',
      'error_code', 'GAME_NOT_WAITING'
    );
  END IF;

  IF v_game.allow_late_joins THEN
    IF v_current_time > v_game.selection_closed_at + interval '2 seconds' THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Selection window has closed',
        'error_code', 'SELECTION_CLOSED',
        'closed_at', v_game.selection_closed_at,
        'current_time', v_current_time
      );
    END IF;
  ELSE
    IF v_current_time > v_game.selection_closed_at THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Selection window has closed',
        'error_code', 'SELECTION_CLOSED',
        'closed_at', v_game.selection_closed_at,
        'current_time', v_current_time
      );
    END IF;
  END IF;

  SELECT id INTO v_existing_player
  FROM players
  WHERE game_id = p_game_id
  AND selected_number = p_card_number
  FOR UPDATE SKIP LOCKED;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Card number already taken',
      'error_code', 'CARD_TAKEN'
    );
  END IF;

  SELECT deposited_balance, won_balance
  INTO v_user
  FROM telegram_users
  WHERE telegram_user_id = p_telegram_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User not found',
      'error_code', 'USER_NOT_FOUND'
    );
  END IF;

  INSERT INTO players (
    game_id,
    name,
    card,
    card_numbers,
    marked_cells,
    selected_number,
    telegram_user_id,
    telegram_username,
    telegram_first_name,
    telegram_last_name
  ) VALUES (
    p_game_id,
    p_player_name,
    p_card,
    p_card_numbers,
    p_marked_cells,
    p_card_number,
    p_telegram_user_id,
    p_telegram_username,
    p_telegram_first_name,
    p_telegram_last_name
  )
  RETURNING id INTO v_player_id;

  RETURN jsonb_build_object(
    'success', true,
    'player_id', v_player_id,
    'card_number', p_card_number,
    'selection_closed_at', v_game.selection_closed_at,
    'starts_at', v_game.starts_at
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'error_code', 'INTERNAL_ERROR'
  );
END;
$$;

-- Update deduct_stake_from_balance to handle testnet zero-balance users
CREATE OR REPLACE FUNCTION deduct_stake_from_balance()
RETURNS TRIGGER AS $$
DECLARE
  stake_amount_val integer;
  user_deposited integer;
  user_won integer;
  total_available integer;
  deduct_from_deposited integer;
  deduct_from_won integer;
BEGIN
  SELECT stake_amount INTO stake_amount_val
  FROM games
  WHERE id = NEW.game_id;

  IF stake_amount_val IS NULL THEN
    RAISE EXCEPTION 'Game not found';
  END IF;

  SELECT deposited_balance, won_balance INTO user_deposited, user_won
  FROM telegram_users
  WHERE telegram_user_id = NEW.telegram_user_id;

  total_available := user_deposited + user_won;

  IF total_available < stake_amount_val THEN
    RETURN NEW;
  END IF;

  IF user_deposited >= stake_amount_val THEN
    deduct_from_deposited := stake_amount_val;
    deduct_from_won := 0;
  ELSE
    deduct_from_deposited := user_deposited;
    deduct_from_won := stake_amount_val - user_deposited;
  END IF;

  UPDATE telegram_users
  SET
    deposited_balance = deposited_balance - deduct_from_deposited,
    won_balance = won_balance - deduct_from_won,
    balance = balance - stake_amount_val,
    total_spent = total_spent + stake_amount_val
  WHERE telegram_user_id = NEW.telegram_user_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
