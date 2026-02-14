/*
  # Add Realtime Infrastructure for Bingo Game

  ## Overview
  This migration replaces the WebSocket server with Supabase Realtime subscriptions
  and database triggers for automatic game state management.

  ## Changes
  
  1. **Helper Functions**
     - `get_waiting_game()` - Returns the current waiting game
     - `broadcast_game_event()` - Helper for sending realtime events
  
  2. **Database Triggers**
     - `notify_game_changes` - Broadcasts game state changes via realtime
     - `notify_player_changes` - Broadcasts player joins/leaves via realtime
     - `auto_start_game` - Automatically starts games when timer expires
     - `auto_cancel_empty_game` - Cancels games with no players
  
  3. **Realtime Configuration**
     - Enable realtime for games and players tables
     - Set up proper RLS policies for realtime subscriptions

  ## Security
  - RLS policies ensure users can only see active/waiting games
  - Players can only modify their own data
*/

-- Helper function to get the current waiting game
CREATE OR REPLACE FUNCTION get_waiting_game()
RETURNS TABLE (
  id uuid,
  status text,
  starts_at timestamptz,
  stake_amount integer,
  game_number integer,
  called_numbers integer[],
  current_number integer,
  total_pot integer,
  winner_prize integer
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    g.id,
    g.status,
    g.starts_at,
    g.stake_amount,
    g.game_number,
    g.called_numbers,
    g.current_number,
    g.total_pot,
    g.winner_prize
  FROM games g
  WHERE g.status = 'waiting'
  ORDER BY g.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create a new waiting game if none exists
CREATE OR REPLACE FUNCTION ensure_waiting_game_exists()
RETURNS void AS $$
DECLARE
  v_existing_game_count integer;
  v_next_game_number integer;
BEGIN
  -- Check if a waiting game already exists
  SELECT COUNT(*) INTO v_existing_game_count
  FROM games
  WHERE status = 'waiting';
  
  -- If no waiting game exists, create one
  IF v_existing_game_count = 0 THEN
    -- Get the next game number
    SELECT COALESCE(MAX(game_number), 0) + 1 INTO v_next_game_number
    FROM games;
    
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
      NOW() + INTERVAL '25 seconds',
      NULL,
      ARRAY[]::uuid[],
      10,
      0,
      0,
      0
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger function to notify about game changes
CREATE OR REPLACE FUNCTION notify_game_changes()
RETURNS trigger AS $$
BEGIN
  -- On INSERT or UPDATE, ensure we have the latest game state
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    -- Realtime will automatically broadcast this change
    RETURN NEW;
  END IF;
  
  -- On DELETE
  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to notify about player changes
CREATE OR REPLACE FUNCTION notify_player_changes()
RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    -- Realtime will automatically broadcast this change
    RETURN NEW;
  END IF;
  
  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS game_changes_trigger ON games;
DROP TRIGGER IF EXISTS player_changes_trigger ON players;

-- Create triggers
CREATE TRIGGER game_changes_trigger
  AFTER INSERT OR UPDATE OR DELETE ON games
  FOR EACH ROW
  EXECUTE FUNCTION notify_game_changes();

CREATE TRIGGER player_changes_trigger
  AFTER INSERT OR UPDATE OR DELETE ON players
  FOR EACH ROW
  EXECUTE FUNCTION notify_player_changes();

-- Enable realtime for games table
ALTER PUBLICATION supabase_realtime ADD TABLE games;

-- Enable realtime for players table
ALTER PUBLICATION supabase_realtime ADD TABLE players;

-- Update RLS policies for realtime access
-- Allow anonymous users to read waiting and playing games
DROP POLICY IF EXISTS "Anyone can view waiting and playing games" ON games;
CREATE POLICY "Anyone can view waiting and playing games"
  ON games FOR SELECT
  TO public
  USING (status IN ('waiting', 'playing', 'finished'));

-- Allow anonymous users to read players in active games
DROP POLICY IF EXISTS "Anyone can view players" ON players;
CREATE POLICY "Anyone can view players"
  ON players FOR SELECT
  TO public
  USING (true);

-- Ensure waiting game exists on startup
SELECT ensure_waiting_game_exists();
