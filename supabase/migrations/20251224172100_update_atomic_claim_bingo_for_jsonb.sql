/*
  # Update atomic_claim_bingo to Use JSONB Directly

  ## Summary
  Removes problematic type casting from atomic_claim_bingo since check_player_win
  now accepts jsonb card_numbers directly.

  ## Changes
  - Remove v_card_numbers and v_called_numbers variables
  - Pass card_numbers and called_numbers directly to check_player_win
  - This eliminates the type conversion error that was causing claim failures

  ## Impact
  - Fixes "failed to process bingo" error
  - Maintains all security and claim window logic
  - Preserves atomic locking behavior
*/

CREATE OR REPLACE FUNCTION atomic_claim_bingo(
  p_player_id uuid,
  p_claim_window_ms integer DEFAULT 1000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player record;
  v_game record;
  v_win_result jsonb;
  v_is_first_claim boolean;
  v_winner_ids text[];
  v_claim_window_start timestamptz;
  v_ms_elapsed integer;
  v_should_finalize boolean;
  v_winner_prize_each integer;
BEGIN
  SELECT id, card_numbers, game_id, is_disqualified
  INTO v_player
  FROM players
  WHERE id = p_player_id;

  IF v_player IS NULL THEN
    RETURN jsonb_build_object('error', 'Player not found', 'success', false);
  END IF;

  IF v_player.is_disqualified THEN
    RETURN jsonb_build_object('error', 'Player is disqualified', 'success', false);
  END IF;

  SELECT id, status, called_numbers, current_number, winner_prize, winner_ids, claim_window_start
  INTO v_game
  FROM games
  WHERE id = v_player.game_id
  FOR UPDATE;

  IF v_game IS NULL THEN
    RETURN jsonb_build_object('error', 'Game not found', 'success', false);
  END IF;

  v_claim_window_start := v_game.claim_window_start;
  v_ms_elapsed := CASE 
    WHEN v_claim_window_start IS NOT NULL 
    THEN EXTRACT(EPOCH FROM (now() - v_claim_window_start)) * 1000
    ELSE 0 
  END;

  IF v_game.status = 'finished' AND (v_claim_window_start IS NULL OR v_ms_elapsed >= p_claim_window_ms) THEN
    RETURN jsonb_build_object('error', 'Game has already finished', 'success', false);
  END IF;

  IF v_game.status != 'playing' AND (v_claim_window_start IS NULL OR v_ms_elapsed >= p_claim_window_ms) THEN
    RETURN jsonb_build_object('error', 'Game is not in playing state', 'success', false);
  END IF;

  v_winner_ids := COALESCE(v_game.winner_ids, ARRAY[]::text[]);

  IF p_player_id::text = ANY(v_winner_ids) THEN
    RETURN jsonb_build_object(
      'success', true,
      'isWinner', true,
      'alreadyClaimed', true,
      'message', 'You have already claimed BINGO'
    );
  END IF;

  -- Call check_player_win with card_numbers as jsonb directly
  SELECT check_player_win(v_player.card_numbers, v_game.called_numbers, v_game.current_number) INTO v_win_result;

  IF v_win_result IS NOT NULL THEN
    v_is_first_claim := v_claim_window_start IS NULL;
    v_winner_ids := array_append(v_winner_ids, p_player_id::text);
    v_winner_prize_each := FLOOR(COALESCE(v_game.winner_prize, 0)::numeric / array_length(v_winner_ids, 1));
    v_should_finalize := NOT v_is_first_claim AND v_ms_elapsed >= p_claim_window_ms;

    UPDATE games SET
      winner_ids = v_winner_ids,
      winner_prize_each = v_winner_prize_each,
      claim_window_start = CASE WHEN v_is_first_claim THEN now() ELSE claim_window_start END,
      status = CASE WHEN v_should_finalize THEN 'finished' ELSE status END,
      finished_at = CASE WHEN v_should_finalize THEN now() ELSE finished_at END
    WHERE id = v_game.id;

    UPDATE players SET
      winning_pattern = jsonb_build_object(
        'type', v_win_result->>'type',
        'description', v_win_result->>'description'
      )
    WHERE id = p_player_id;

    RETURN jsonb_build_object(
      'success', true,
      'isWinner', true,
      'isFirstClaim', v_is_first_claim,
      'winResult', v_win_result,
      'simultaneousWinners', CASE WHEN array_length(v_winner_ids, 1) > 1 THEN array_length(v_winner_ids, 1) ELSE null END
    );
  ELSE
    UPDATE players SET
      is_disqualified = true,
      disqualified_at = now()
    WHERE id = p_player_id;

    RETURN jsonb_build_object(
      'success', true,
      'isWinner', false,
      'disqualified', true
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION atomic_claim_bingo(uuid, integer) TO anon, authenticated;

COMMENT ON FUNCTION atomic_claim_bingo IS 
  'Atomically claims BINGO with row-level locking to prevent race conditions during simultaneous claims';
