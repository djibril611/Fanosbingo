/*
  # Add Automatic Win Detection System
  
  1. New Function: check_player_win
    - Automatically checks if a player has won based on current called number
    - Validates that the current number is the FINAL piece of the winning pattern
    - Returns winning pattern details if player has won
  
  2. Winning Conditions
    - All numbers in the pattern must be in called_numbers
    - The current_number must be part of the winning pattern
    - The current_number must be the last number that completed the pattern
    - Without current_number, the pattern would not be complete
  
  3. Supported Patterns
    - Horizontal rows (5 patterns)
    - Vertical columns (5 patterns)
    - Two diagonals
    - Four corners
  
  4. Security
    - Function runs server-side only
    - Prevents client-side cheating
    - Validates all conditions before declaring a win
*/

-- Function to check if a player has a winning pattern with the current number
CREATE OR REPLACE FUNCTION check_player_win(
  card_numbers integer[][],
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
      card_numbers[1][row_idx + 1],
      card_numbers[2][row_idx + 1],
      card_numbers[3][row_idx + 1],
      card_numbers[4][row_idx + 1],
      card_numbers[5][row_idx + 1]
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
      card_numbers[col_idx + 1][1],
      card_numbers[col_idx + 1][2],
      card_numbers[col_idx + 1][3],
      card_numbers[col_idx + 1][4],
      card_numbers[col_idx + 1][5]
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
    card_numbers[1][1],
    card_numbers[2][2],
    card_numbers[3][3],
    card_numbers[4][4],
    card_numbers[5][5]
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
    card_numbers[5][1],
    card_numbers[4][2],
    card_numbers[3][3],
    card_numbers[2][4],
    card_numbers[1][5]
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
    card_numbers[1][1],
    card_numbers[5][1],
    card_numbers[1][5],
    card_numbers[5][5]
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