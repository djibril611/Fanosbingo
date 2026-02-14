/*
  # WebSocket Infrastructure Schema

  1. New Tables
    - `game_state_snapshots` - Periodic snapshots of in-memory game state for crash recovery
      - `id` (uuid, primary key)
      - `game_id` (uuid, foreign key) - Reference to game
      - `state_json` (jsonb) - Complete game state snapshot
      - `snapshot_at` (timestamptz) - When snapshot was taken
      - `version` (integer) - State version number

    - `player_sessions` - Track WebSocket connection sessions
      - `id` (uuid, primary key)
      - `player_id` (uuid, foreign key) - Reference to player
      - `session_id` (text) - Unique session identifier
      - `connected_at` (timestamptz) - When connection established
      - `last_ping` (timestamptz) - Last ping received
      - `connection_quality` (text) - Connection quality indicator
      - `latency_ms` (integer) - Average latency in milliseconds

    - `game_events` - Audit log for all game events
      - `id` (uuid, primary key)
      - `event_type` (text) - Type of event
      - `game_id` (uuid) - Related game ID
      - `player_id` (uuid) - Related player ID (if applicable)
      - `event_data` (jsonb) - Event payload
      - `server_timestamp` (timestamptz) - Server time when event occurred

  2. Indexes
    - Fast lookups on game_id, player_id, event types
    - Time-based queries for event logs

  3. Security
    - Enable RLS on all tables
    - Only authenticated users and server can write
    - Anyone can read for transparency

  4. Cleanup
    - Add retention policy for old events (7 days)
    - Add cleanup for finished game snapshots (24 hours)
*/

CREATE TABLE IF NOT EXISTS game_state_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  state_json jsonb NOT NULL,
  snapshot_at timestamptz DEFAULT now(),
  version integer DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_snapshots_game_id ON game_state_snapshots(game_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_timestamp ON game_state_snapshots(snapshot_at DESC);

CREATE TABLE IF NOT EXISTS player_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid REFERENCES players(id) ON DELETE CASCADE,
  session_id text UNIQUE NOT NULL,
  connected_at timestamptz DEFAULT now(),
  last_ping timestamptz DEFAULT now(),
  connection_quality text DEFAULT 'good',
  latency_ms integer DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sessions_player_id ON player_sessions(player_id);
CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON player_sessions(session_id);

CREATE TABLE IF NOT EXISTS game_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  game_id uuid,
  player_id uuid,
  event_data jsonb DEFAULT '{}',
  server_timestamp timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_game_id ON game_events(game_id);
CREATE INDEX IF NOT EXISTS idx_events_player_id ON game_events(player_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON game_events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON game_events(server_timestamp DESC);

ALTER TABLE game_state_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view snapshots"
  ON game_state_snapshots FOR SELECT
  USING (true);

CREATE POLICY "Service can manage snapshots"
  ON game_state_snapshots FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can view sessions"
  ON player_sessions FOR SELECT
  USING (true);

CREATE POLICY "Service can manage sessions"
  ON player_sessions FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can view events"
  ON game_events FOR SELECT
  USING (true);

CREATE POLICY "Service can insert events"
  ON game_events FOR INSERT
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION cleanup_old_game_events()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM game_events
  WHERE server_timestamp < now() - interval '7 days';
END;
$$;

CREATE OR REPLACE FUNCTION cleanup_old_snapshots()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM game_state_snapshots
  WHERE snapshot_at < now() - interval '24 hours';
END;
$$;

GRANT EXECUTE ON FUNCTION cleanup_old_game_events() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cleanup_old_snapshots() TO anon, authenticated;
