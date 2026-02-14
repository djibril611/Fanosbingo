/*
  # Fix create_game_with_server_time Type Mismatch

  ## Summary
  Fixes the type mismatch error in create_game_with_server_time function.
  The called_numbers column is integer[] but the function was inserting jsonb.

  ## Changes
  - Fix called_numbers initialization from '[]'::jsonb to ARRAY[]::integer[]
  - This resolves the error preventing game creation

  ## Impact
  - Games can now be created successfully
  - Users will be able to select numbers and play
*/

-- Fix the create_game_with_server_time function
CREATE OR REPLACE FUNCTION create_game_with_server_time(
  countdown_seconds integer DEFAULT 25,
  stake_amount_param integer DEFAULT 10
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_game_num integer;
  new_game_record record;
  server_time_ms bigint;
  last_finished_game record;
  time_since_finish_seconds numeric;
  adjusted_countdown integer;
BEGIN
  -- Get the next game number
  SELECT COALESCE(MAX(game_number), 0) + 1
  INTO next_game_num
  FROM games;

  -- Get current server time in milliseconds
  server_time_ms := get_server_timestamp_ms();

  -- Check for recently finished games
  SELECT *
  INTO last_finished_game
  FROM games
  WHERE status = 'finished'
    AND finished_at IS NOT NULL
  ORDER BY finished_at DESC
  LIMIT 1;

  -- Calculate adjusted countdown if game finished recently
  adjusted_countdown := countdown_seconds;
  
  IF last_finished_game IS NOT NULL AND last_finished_game.finished_at IS NOT NULL THEN
    -- Calculate time since last game finished in seconds
    time_since_finish_seconds := EXTRACT(EPOCH FROM (now() AT TIME ZONE 'UTC' - last_finished_game.finished_at));
    
    -- If finished within last 12 seconds, extend countdown
    IF time_since_finish_seconds < 12 THEN
      -- Add remaining time from the 12-second winner viewing window
      adjusted_countdown := countdown_seconds + CEIL(12 - time_since_finish_seconds)::integer;
      
      -- Cap maximum countdown at 37 seconds (25 + 12)
      IF adjusted_countdown > 37 THEN
        adjusted_countdown := 37;
      END IF;
    END IF;
  END IF;

  -- Create the new game with adjusted countdown
  -- FIX: Use ARRAY[]::integer[] instead of '[]'::jsonb for called_numbers
  INSERT INTO games (
    status,
    host_id,
    called_numbers,
    game_number,
    starts_at,
    stake_amount
  )
  VALUES (
    'waiting',
    'system',
    ARRAY[]::integer[],
    next_game_num,
    now() AT TIME ZONE 'UTC' + (adjusted_countdown || ' seconds')::interval,
    stake_amount_param
  )
  RETURNING * INTO new_game_record;

  -- Return both the game and server time
  RETURN json_build_object(
    'game', row_to_json(new_game_record),
    'serverTime', server_time_ms
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION create_game_with_server_time(integer, integer) TO anon, authenticated;
