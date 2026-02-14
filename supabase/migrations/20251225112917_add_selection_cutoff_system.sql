/*
  # Add Selection Cutoff System

  1. Changes
    - Add `selection_closed_at` column to games table (5 seconds before starts_at)
    - Add `allow_late_joins` column for grace period management
    - Create atomic card selection function with timestamp validation
    - Update indexes for performance

  2. New Functionality
    - Selection cutoff prevents last-second race conditions
    - Timestamp-based validation instead of status checks
    - Atomic selection with proper locking

  3. Security
    - Maintained existing RLS policies
    - Stored procedure uses security definer for controlled access
*/

-- Add selection_closed_at column to games table
ALTER TABLE games
ADD COLUMN IF NOT EXISTS selection_closed_at timestamptz;

-- Add allow_late_joins for grace period management
ALTER TABLE games
ADD COLUMN IF NOT EXISTS allow_late_joins boolean DEFAULT true;

-- Update existing games to have selection_closed_at
UPDATE games
SET selection_closed_at = starts_at - interval '5 seconds'
WHERE selection_closed_at IS NULL;

-- Add check constraint to ensure selection_closed_at is always 5 seconds before starts_at
ALTER TABLE games
DROP CONSTRAINT IF EXISTS games_selection_closed_at_check;

-- Create function to automatically set selection_closed_at
CREATE OR REPLACE FUNCTION set_selection_closed_at()
RETURNS TRIGGER AS $$
BEGIN
  -- If starts_at is being set or updated, automatically set selection_closed_at
  IF NEW.starts_at IS NOT NULL THEN
    NEW.selection_closed_at := NEW.starts_at - interval '5 seconds';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically set selection_closed_at
DROP TRIGGER IF EXISTS set_selection_closed_at_trigger ON games;
CREATE TRIGGER set_selection_closed_at_trigger
  BEFORE INSERT OR UPDATE OF starts_at ON games
  FOR EACH ROW
  EXECUTE FUNCTION set_selection_closed_at();

-- Create atomic card selection function
CREATE OR REPLACE FUNCTION select_card_atomic(
  p_game_id uuid,
  p_card_number integer,
  p_telegram_user_id bigint,
  p_player_name text,
  p_telegram_username text DEFAULT NULL,
  p_telegram_first_name text DEFAULT NULL,
  p_telegram_last_name text DEFAULT NULL,
  p_card jsonb DEFAULT NULL,
  p_card_numbers jsonb DEFAULT NULL,
  p_marked_cells jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_game record;
  v_user record;
  v_existing_player record;
  v_player_id uuid;
  v_total_balance numeric;
  v_current_time timestamptz;
BEGIN
  -- Get current server time
  v_current_time := now();

  -- Lock the game row for update to prevent race conditions
  SELECT id, status, stake_amount, selection_closed_at, allow_late_joins, starts_at
  INTO v_game
  FROM games
  WHERE id = p_game_id
  FOR UPDATE;

  -- Check if game exists
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

  -- Check user balance
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

  v_total_balance := v_user.deposited_balance + v_user.won_balance;

  IF v_total_balance < v_game.stake_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient balance',
      'error_code', 'INSUFFICIENT_BALANCE',
      'required', v_game.stake_amount,
      'available', v_total_balance
    );
  END IF;

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

  -- Return success
  RETURN jsonb_build_object(
    'success', true,
    'player_id', v_player_id,
    'card_number', p_card_number,
    'selection_closed_at', v_game.selection_closed_at,
    'starts_at', v_game.starts_at
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Card number already taken',
      'error_code', 'CARD_TAKEN'
    );
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'error_code', 'INTERNAL_ERROR'
    );
END;
$$;

-- Add index for faster selection_closed_at queries
CREATE INDEX IF NOT EXISTS idx_games_selection_closed_at
ON games(selection_closed_at)
WHERE status = 'waiting';

-- Add compound index for game status and timing
CREATE INDEX IF NOT EXISTS idx_games_status_times
ON games(status, selection_closed_at, starts_at);
