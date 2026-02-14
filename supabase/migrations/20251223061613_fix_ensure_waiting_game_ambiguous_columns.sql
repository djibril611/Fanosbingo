/*
  # Fix Ambiguous Column References in ensure_waiting_game_exists
  
  ## Summary
  Fixes the "column reference game_number is ambiguous" error by properly qualifying
  all column references and avoiding variable name conflicts.
  
  ## Changes
  - Qualify all column references with table aliases
  - Ensure variable names don't conflict with column names
  
  ## Security
  - Uses existing SECURITY DEFINER setting
  - Maintains same permissions as before
*/

-- Drop and recreate with fixed column references
DROP FUNCTION IF EXISTS ensure_waiting_game_exists();

CREATE OR REPLACE FUNCTION ensure_waiting_game_exists()
RETURNS TABLE (
  game_created boolean,
  game_id uuid,
  game_number integer,
  message text
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing_game_count integer;
  v_next_game_number integer;
  v_new_game_id uuid;
  v_new_game_number integer;
BEGIN
  -- Check if a waiting game already exists
  SELECT COUNT(*) INTO v_existing_game_count
  FROM games g
  WHERE g.status = 'waiting';
  
  -- If a waiting game exists, return its info
  IF v_existing_game_count > 0 THEN
    RETURN QUERY
    SELECT 
      false as game_created,
      g.id as game_id, 
      g.game_number,
      'Waiting game already exists'::text as message
    FROM games g
    WHERE g.status = 'waiting'
    ORDER BY g.created_at DESC
    LIMIT 1;
    
    RETURN;
  END IF;
  
  -- No waiting game exists, create one
  -- Get the next game number (qualify with table alias)
  SELECT COALESCE(MAX(g.game_number), 0) + 1 INTO v_next_game_number
  FROM games g;
  
  -- Create new waiting game
  INSERT INTO games (
    status,
    host_id,
    called_numbers,
    game_number,
    starts_at,
    current_number,
    winner_ids,
    stake_amount,
    total_pot,
    winner_prize,
    winner_prize_each
  ) VALUES (
    'waiting',
    'system',
    ARRAY[]::integer[],
    v_next_game_number,
    NOW() AT TIME ZONE 'UTC' + INTERVAL '25 seconds',
    NULL,
    ARRAY[]::uuid[],
    10,
    0,
    0,
    0
  )
  RETURNING id, games.game_number INTO v_new_game_id, v_new_game_number;
  
  -- Return info about the created game
  RETURN QUERY SELECT 
    true as game_created,
    v_new_game_id as game_id,
    v_new_game_number as game_number,
    'New waiting game created successfully'::text as message;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION ensure_waiting_game_exists() TO anon, authenticated;

-- Now force finish the stuck game
UPDATE games 
SET 
  status = 'finished',
  finished_at = NOW() AT TIME ZONE 'UTC'
WHERE id = '6b7bcb33-acf8-480e-b094-8922649b32c9'
AND status = 'playing';

-- Ensure a new waiting game exists
SELECT * FROM ensure_waiting_game_exists();
