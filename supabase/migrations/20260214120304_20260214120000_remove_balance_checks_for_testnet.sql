/*
  # Remove Balance Checks for Testnet

  Remove insufficient balance validation to allow users to play with 0 balance.
  The smart contract will provide testnet funds.

  1. Changes
    - Remove balance check from `select_card_atomic` function
    - Allow players to join games regardless of balance
*/

-- Drop and recreate select_card_atomic without balance check
CREATE OR REPLACE FUNCTION select_card_atomic(
  p_game_id uuid,
  p_card_number integer,
  p_telegram_user_id bigint,
  p_player_name text,
  p_card integer[][],
  p_card_numbers integer[][],
  p_marked_cells boolean[][],
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
  -- Get current server time
  v_current_time := now();

  -- Lock and get game details
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

  -- Check if game is in waiting status
  IF v_game.status != 'waiting' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Game is no longer accepting players',
      'error_code', 'GAME_NOT_WAITING'
    );
  END IF;

  -- Check if selection window is still open (with grace period if enabled)
  IF v_game.allow_late_joins THEN
    -- Grace period: allow selections up to 2 seconds after selection_closed_at
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
    -- No grace period: strict cutoff
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

  -- Check if card number is already taken (with lock)
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

  -- Get user details (but don't check balance for testnet)
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

  -- REMOVED: Balance check for testnet compatibility
  -- Users can play with 0 balance; smart contract provides funds

  -- Insert the player (balance deduction happens via trigger)
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

  -- Return success with player details
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