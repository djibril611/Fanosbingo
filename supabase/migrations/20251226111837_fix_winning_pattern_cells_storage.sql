/*
  # Fix Winning Pattern Cells Storage

  ## Summary
  Updates the bingo claim system to properly store winning pattern cell coordinates,
  enabling the frontend to highlight winning cells and identify the decisive winning number.

  ## Issues Fixed
  1. check_player_win function was returning pattern_numbers but not cell coordinates
  2. atomic_claim_bingo was only saving type and description, missing the cells array
  3. Frontend could not highlight winning patterns because cells data was missing

  ## Changes
  1. Update check_player_win to return cells array with [col, row] coordinates
  2. Update atomic_claim_bingo to save the complete winning_pattern including cells

  ## Technical Details
  - Cells are stored as array of [col, row] pairs
  - Pattern types: row, column, diagonal, fourCorners
  - Free space (center) is always included in diagonal patterns
*/

-- Update check_player_win to return cells coordinates
CREATE OR REPLACE FUNCTION check_player_win(
  card_numbers jsonb,
  called_numbers integer[],
  current_number integer
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  pattern_cells integer[];
  pattern_complete boolean;
  is_final_number boolean;
  row_idx integer;
  col_idx integer;
  cell_value integer;
BEGIN
  IF NOT (current_number = ANY(called_numbers)) THEN
    RETURN NULL;
  END IF;

  FOR row_idx IN 0..4 LOOP
    pattern_cells := ARRAY[
      (card_numbers->0->>row_idx)::integer,
      (card_numbers->1->>row_idx)::integer,
      (card_numbers->2->>row_idx)::integer,
      (card_numbers->3->>row_idx)::integer,
      (card_numbers->4->>row_idx)::integer
    ];

    IF current_number = ANY(pattern_cells) THEN
      pattern_complete := true;
      is_final_number := false;

      FOREACH cell_value IN ARRAY pattern_cells LOOP
        IF cell_value = 0 THEN
          CONTINUE;
        END IF;
        IF NOT (cell_value = ANY(called_numbers)) THEN
          pattern_complete := false;
          EXIT;
        END IF;
        IF cell_value = current_number THEN
          is_final_number := true;
        END IF;
      END LOOP;

      IF pattern_complete AND is_final_number THEN
        DECLARE
          temp_called integer[];
          would_be_complete boolean;
        BEGIN
          temp_called := array_remove(called_numbers, current_number);
          would_be_complete := true;

          FOREACH cell_value IN ARRAY pattern_cells LOOP
            IF cell_value = 0 THEN
              CONTINUE;
            END IF;
            IF NOT (cell_value = ANY(temp_called)) THEN
              would_be_complete := false;
              EXIT;
            END IF;
          END LOOP;

          IF NOT would_be_complete THEN
            RETURN jsonb_build_object(
              'type', 'row',
              'description', 'Row ' || (row_idx + 1),
              'pattern_numbers', pattern_cells,
              'cells', jsonb_build_array(
                jsonb_build_array(0, row_idx),
                jsonb_build_array(1, row_idx),
                jsonb_build_array(2, row_idx),
                jsonb_build_array(3, row_idx),
                jsonb_build_array(4, row_idx)
              )
            );
          END IF;
        END;
      END IF;
    END IF;
  END LOOP;

  FOR col_idx IN 0..4 LOOP
    pattern_cells := ARRAY[
      (card_numbers->col_idx->>0)::integer,
      (card_numbers->col_idx->>1)::integer,
      (card_numbers->col_idx->>2)::integer,
      (card_numbers->col_idx->>3)::integer,
      (card_numbers->col_idx->>4)::integer
    ];

    IF current_number = ANY(pattern_cells) THEN
      pattern_complete := true;
      is_final_number := false;

      FOREACH cell_value IN ARRAY pattern_cells LOOP
        IF cell_value = 0 THEN
          CONTINUE;
        END IF;
        IF NOT (cell_value = ANY(called_numbers)) THEN
          pattern_complete := false;
          EXIT;
        END IF;
        IF cell_value = current_number THEN
          is_final_number := true;
        END IF;
      END LOOP;

      IF pattern_complete AND is_final_number THEN
        DECLARE
          temp_called integer[];
          would_be_complete boolean;
          col_letters text[] := ARRAY['B', 'I', 'N', 'G', 'O'];
        BEGIN
          temp_called := array_remove(called_numbers, current_number);
          would_be_complete := true;

          FOREACH cell_value IN ARRAY pattern_cells LOOP
            IF cell_value = 0 THEN
              CONTINUE;
            END IF;
            IF NOT (cell_value = ANY(temp_called)) THEN
              would_be_complete := false;
              EXIT;
            END IF;
          END LOOP;

          IF NOT would_be_complete THEN
            RETURN jsonb_build_object(
              'type', 'column',
              'description', col_letters[col_idx + 1] || ' Column',
              'pattern_numbers', pattern_cells,
              'cells', jsonb_build_array(
                jsonb_build_array(col_idx, 0),
                jsonb_build_array(col_idx, 1),
                jsonb_build_array(col_idx, 2),
                jsonb_build_array(col_idx, 3),
                jsonb_build_array(col_idx, 4)
              )
            );
          END IF;
        END;
      END IF;
    END IF;
  END LOOP;

  pattern_cells := ARRAY[
    (card_numbers->0->>0)::integer,
    (card_numbers->1->>1)::integer,
    (card_numbers->2->>2)::integer,
    (card_numbers->3->>3)::integer,
    (card_numbers->4->>4)::integer
  ];

  IF current_number = ANY(pattern_cells) THEN
    pattern_complete := true;
    is_final_number := false;

    FOREACH cell_value IN ARRAY pattern_cells LOOP
      IF cell_value = 0 THEN
        CONTINUE;
      END IF;
      IF NOT (cell_value = ANY(called_numbers)) THEN
        pattern_complete := false;
        EXIT;
      END IF;
      IF cell_value = current_number THEN
        is_final_number := true;
      END IF;
    END LOOP;

    IF pattern_complete AND is_final_number THEN
      DECLARE
        temp_called integer[];
        would_be_complete boolean;
      BEGIN
        temp_called := array_remove(called_numbers, current_number);
        would_be_complete := true;

        FOREACH cell_value IN ARRAY pattern_cells LOOP
          IF cell_value = 0 THEN
            CONTINUE;
          END IF;
          IF NOT (cell_value = ANY(temp_called)) THEN
            would_be_complete := false;
            EXIT;
          END IF;
        END LOOP;

        IF NOT would_be_complete THEN
          RETURN jsonb_build_object(
            'type', 'diagonal',
            'description', 'Diagonal (Top-Left to Bottom-Right)',
            'pattern_numbers', pattern_cells,
            'cells', jsonb_build_array(
              jsonb_build_array(0, 0),
              jsonb_build_array(1, 1),
              jsonb_build_array(2, 2),
              jsonb_build_array(3, 3),
              jsonb_build_array(4, 4)
            )
          );
        END IF;
      END;
    END IF;
  END IF;

  pattern_cells := ARRAY[
    (card_numbers->4->>0)::integer,
    (card_numbers->3->>1)::integer,
    (card_numbers->2->>2)::integer,
    (card_numbers->1->>3)::integer,
    (card_numbers->0->>4)::integer
  ];

  IF current_number = ANY(pattern_cells) THEN
    pattern_complete := true;
    is_final_number := false;

    FOREACH cell_value IN ARRAY pattern_cells LOOP
      IF cell_value = 0 THEN
        CONTINUE;
      END IF;
      IF NOT (cell_value = ANY(called_numbers)) THEN
        pattern_complete := false;
        EXIT;
      END IF;
      IF cell_value = current_number THEN
        is_final_number := true;
      END IF;
    END LOOP;

    IF pattern_complete AND is_final_number THEN
      DECLARE
        temp_called integer[];
        would_be_complete boolean;
      BEGIN
        temp_called := array_remove(called_numbers, current_number);
        would_be_complete := true;

        FOREACH cell_value IN ARRAY pattern_cells LOOP
          IF cell_value = 0 THEN
            CONTINUE;
          END IF;
          IF NOT (cell_value = ANY(temp_called)) THEN
            would_be_complete := false;
            EXIT;
          END IF;
        END LOOP;

        IF NOT would_be_complete THEN
          RETURN jsonb_build_object(
            'type', 'diagonal',
            'description', 'Diagonal (Top-Right to Bottom-Left)',
            'pattern_numbers', pattern_cells,
            'cells', jsonb_build_array(
              jsonb_build_array(4, 0),
              jsonb_build_array(3, 1),
              jsonb_build_array(2, 2),
              jsonb_build_array(1, 3),
              jsonb_build_array(0, 4)
            )
          );
        END IF;
      END;
    END IF;
  END IF;

  pattern_cells := ARRAY[
    (card_numbers->0->>0)::integer,
    (card_numbers->4->>0)::integer,
    (card_numbers->0->>4)::integer,
    (card_numbers->4->>4)::integer
  ];

  IF current_number = ANY(pattern_cells) THEN
    pattern_complete := true;
    is_final_number := false;

    FOREACH cell_value IN ARRAY pattern_cells LOOP
      IF NOT (cell_value = ANY(called_numbers)) THEN
        pattern_complete := false;
        EXIT;
      END IF;
      IF cell_value = current_number THEN
        is_final_number := true;
      END IF;
    END LOOP;

    IF pattern_complete AND is_final_number THEN
      DECLARE
        temp_called integer[];
        would_be_complete boolean;
      BEGIN
        temp_called := array_remove(called_numbers, current_number);
        would_be_complete := true;

        FOREACH cell_value IN ARRAY pattern_cells LOOP
          IF NOT (cell_value = ANY(temp_called)) THEN
            would_be_complete := false;
            EXIT;
          END IF;
        END LOOP;

        IF NOT would_be_complete THEN
          RETURN jsonb_build_object(
            'type', 'fourCorners',
            'description', 'Four Corners',
            'pattern_numbers', pattern_cells,
            'cells', jsonb_build_array(
              jsonb_build_array(0, 0),
              jsonb_build_array(4, 0),
              jsonb_build_array(0, 4),
              jsonb_build_array(4, 4)
            )
          );
        END IF;
      END;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

-- Update atomic_claim_bingo to save complete winning_pattern including cells
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
        'description', v_win_result->>'description',
        'cells', v_win_result->'cells'
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

COMMENT ON FUNCTION check_player_win IS
  'Validates if a player has a winning BINGO pattern, returns cells coordinates for highlighting';

COMMENT ON FUNCTION atomic_claim_bingo IS 
  'Atomically claims BINGO with row-level locking, stores complete winning_pattern with cells';
