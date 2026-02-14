/*
  # Server-Synchronized Countdown System

  1. Functions
    - `get_server_timestamp_ms()` - Returns server timestamp in milliseconds (UTC)
    - `create_game_with_server_time()` - Creates a new game with server-side timestamp
    - `get_active_game_with_server_time()` - Returns active game and current server time

  2. Security
    - All functions are accessible to authenticated and anonymous users
    - Functions use existing RLS policies on the games table

  3. Purpose
    - Ensure all clients see identical countdown by using server time as single source of truth
    - Eliminate client-side time calculation for game creation
    - Provide atomic operations for fetching game state and server time together
*/

-- Function to get server timestamp in milliseconds
CREATE OR REPLACE FUNCTION get_server_timestamp_ms()
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
  SELECT (EXTRACT(EPOCH FROM now() AT TIME ZONE 'UTC') * 1000)::bigint;
$$;

-- Function to create a new game with server-calculated start time
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
BEGIN
  -- Get the next game number
  SELECT COALESCE(MAX(game_number), 0) + 1
  INTO next_game_num
  FROM games;

  -- Get current server time in milliseconds
  server_time_ms := get_server_timestamp_ms();

  -- Create the new game with server-calculated start time
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
    '[]'::jsonb,
    next_game_num,
    now() AT TIME ZONE 'UTC' + (countdown_seconds || ' seconds')::interval,
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

-- Function to get active game with server time
CREATE OR REPLACE FUNCTION get_active_game_with_server_time()
RETURNS json
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  active_game_record record;
  server_time_ms bigint;
BEGIN
  -- Get current server time in milliseconds
  server_time_ms := get_server_timestamp_ms();

  -- Get the active waiting game
  SELECT *
  INTO active_game_record
  FROM games
  WHERE status = 'waiting'
  ORDER BY created_at DESC
  LIMIT 1;

  -- Return both the game and server time
  RETURN json_build_object(
    'game', row_to_json(active_game_record),
    'serverTime', server_time_ms
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_server_timestamp_ms() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION create_game_with_server_time(integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_active_game_with_server_time() TO anon, authenticated;
