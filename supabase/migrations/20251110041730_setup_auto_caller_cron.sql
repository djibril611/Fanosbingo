/*
  # Setup Automatic Number Calling with pg_cron

  1. Changes
    - Enable pg_cron extension
    - Create a stored procedure to call bingo numbers automatically
    - Schedule the procedure to run every 3 seconds for active games
    
  2. Security
    - Procedure runs with database privileges
    - Only affects games with status 'playing'
*/

CREATE EXTENSION IF NOT EXISTS pg_cron;

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
      remaining_numbers := ARRAY(
        SELECT num FROM generate_series(1, 75) num
        WHERE num != ALL(active_game.called_numbers)
      );
      
      IF array_length(remaining_numbers, 1) = 0 THEN
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

SELECT cron.schedule(
  'call-bingo-numbers',
  '*/3 * * * * *',
  $$SELECT call_next_bingo_number()$$
);