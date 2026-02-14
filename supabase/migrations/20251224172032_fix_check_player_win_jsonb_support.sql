/*
  # Fix check_player_win to Support JSONB Card Numbers

  ## Summary
  Updates check_player_win function to accept jsonb parameters instead of integer[][].
  This fixes the "failed to process bingo" error caused by type conversion issues.

  ## Issues Fixed
  1. card_numbers stored as jsonb cannot be cast to integer[][] directly
  2. called_numbers array needs proper handling from jsonb/array types

  ## Changes
  - Drop old check_player_win function with integer[][] signature
  - Create new check_player_win that accepts jsonb and integer array
  - Handle jsonb array access using proper PostgreSQL jsonb operators
  - Maintain all existing winning pattern detection logic

  ## Winning Patterns Validated
  - Horizontal rows (5 patterns)
  - Vertical columns (5 patterns)
  - Two diagonals
  - Four corners
*/

-- Drop the old version of the function
DROP FUNCTION IF EXISTS check_player_win(integer[][], integer[], integer);

-- Create the new version with jsonb support
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
  -- Current number must be in called numbers
  IF NOT (current_number = ANY(called_numbers)) THEN
    RETURN NULL;
  END IF;

  -- Check horizontal rows (0-4)
  FOR row_idx IN 0..4 LOOP
    pattern_cells := ARRAY[
      (card_numbers->0->>row_idx)::integer,
      (card_numbers->1->>row_idx)::integer,
      (card_numbers->2->>row_idx)::integer,
      (card_numbers->3->>row_idx)::integer,
      (card_numbers->4->>row_idx)::integer
    ];

    -- Check if current number is in this pattern
    IF current_number = ANY(pattern_cells) THEN
      -- Check if all numbers in pattern are called
      pattern_complete := true;
      is_final_number := false;

      FOREACH cell_value IN ARRAY pattern_cells LOOP
        -- Center cell (FREE space) is always marked
        IF cell_value = 0 THEN
          CONTINUE;
        END IF;

        -- Check if this cell's number has been called
        IF NOT (cell_value = ANY(called_numbers)) THEN
          pattern_complete := false;
          EXIT;
        END IF;

        -- Check if current number is the final piece
        IF cell_value = current_number THEN
          is_final_number := true;
        END IF;
      END LOOP;

      -- If pattern is complete and current number completes it
      IF pattern_complete AND is_final_number THEN
        -- Verify this is the FINAL number by checking if pattern would be incomplete without it
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

          -- Only return win if pattern was NOT complete before current number
          IF NOT would_be_complete THEN
            RETURN jsonb_build_object(
              'type', 'row',
              'description', 'Row ' || (row_idx + 1),
              'pattern_numbers', pattern_cells
            );
          END IF;
        END;
      END IF;
    END IF;
  END LOOP;

  -- Check vertical columns (0-4)
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
            DECLARE
              col_letters text[] := ARRAY['B', 'I', 'N', 'G', 'O'];
            BEGIN
              RETURN jsonb_build_object(
                'type', 'column',
                'description', col_letters[col_idx + 1] || ' Column',
                'pattern_numbers', pattern_cells
              );
            END;
          END IF;
        END;
      END IF;
    END IF;
  END LOOP;

  -- Check diagonal (top-left to bottom-right)
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
            'pattern_numbers', pattern_cells
          );
        END IF;
      END;
    END IF;
  END IF;

  -- Check diagonal (top-right to bottom-left)
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
            'pattern_numbers', pattern_cells
          );
        END IF;
      END;
    END IF;
  END IF;

  -- Check four corners
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
            'pattern_numbers', pattern_cells
          );
        END IF;
      END;
    END IF;
  END IF;

  -- No winning pattern found
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION check_player_win IS
  'Validates if a player has a winning BINGO pattern with proper jsonb card_numbers support';
