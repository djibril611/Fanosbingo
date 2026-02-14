/*
  # Fix 75 Call Limit in Auto Caller

  1. Changes
    - Update call_next_bingo_number() function to explicitly check if 75 numbers have been called
    - Game must stop exactly at 75 calls (no 76th call)
    - Added check BEFORE attempting to call a new number
  
  2. Logic
    - If called_numbers array has 75 items, finish the game immediately
    - If no remaining numbers, finish the game
    - Otherwise, call the next number
*/

CREATE OR REPLACE FUNCTION call_next_bingo_number()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  active_game RECORD;
  new_number INT;
  remaining_numbers INT[];
  time_since_last_call INTERVAL;
BEGIN
  FOR active_game IN 
    SELECT * FROM games WHERE status = 'playing'
  LOOP
    time_since_last_call := now() - active_game.last_number_called_at;
    
    IF active_game.last_number_called_at IS NULL OR time_since_last_call >= INTERVAL '3 seconds' THEN
      -- Check if 75 numbers have already been called
      IF array_length(active_game.called_numbers, 1) >= 75 THEN
        UPDATE games
        SET status = 'finished'
        WHERE id = active_game.id;
        CONTINUE;
      END IF;
      
      remaining_numbers := ARRAY(
        SELECT num FROM generate_series(1, 75) num
        WHERE num != ALL(active_game.called_numbers)
      );
      
      IF array_length(remaining_numbers, 1) = 0 OR array_length(remaining_numbers, 1) IS NULL THEN
        UPDATE games
        SET status = 'finished'
        WHERE id = active_game.id;
      ELSE
        new_number := remaining_numbers[1 + floor(random() * array_length(remaining_numbers, 1))::int];
        
        UPDATE games
        SET 
          current_number = new_number,
          called_numbers = array_append(called_numbers, new_number),
          last_number_called_at = now()
        WHERE id = active_game.id;
      END IF;
    END IF;
  END LOOP;
END;
$$;