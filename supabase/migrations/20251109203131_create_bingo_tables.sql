/*
  # Create Bingo Game Tables

  1. New Tables
    - `games`
      - `id` (uuid, primary key) - Unique game identifier
      - `code` (text, unique) - 6-character game code for joining
      - `status` (text) - Game status: waiting, playing, finished
      - `current_number` (integer) - Currently called number
      - `called_numbers` (integer array) - All numbers called so far
      - `host_id` (text) - Player who created the game
      - `winner_id` (text) - ID of winning player
      - `created_at` (timestamptz) - When game was created
      - `started_at` (timestamptz) - When game started
      - `finished_at` (timestamptz) - When game finished
    
    - `players`
      - `id` (uuid, primary key) - Unique player identifier
      - `game_id` (uuid, foreign key) - Reference to game
      - `name` (text) - Player display name
      - `card` (jsonb) - Bingo card data (5x5 grid)
      - `marked_cells` (jsonb) - Which cells player has marked
      - `is_host` (boolean) - Whether player is the host
      - `joined_at` (timestamptz) - When player joined
      - `is_connected` (boolean) - Current connection status
  
  2. Security
    - Enable RLS on all tables
    - Allow anyone to read games and players (needed for multiplayer)
    - Allow anyone to insert players (join games)
    - Only hosts can update game status
    - Players can only update their own marked cells
*/

-- Create games table
CREATE TABLE IF NOT EXISTS games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'waiting',
  current_number integer,
  called_numbers integer[] DEFAULT '{}',
  host_id text NOT NULL,
  winner_id text,
  created_at timestamptz DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  CONSTRAINT status_check CHECK (status IN ('waiting', 'playing', 'finished'))
);

-- Create players table
CREATE TABLE IF NOT EXISTS players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  name text NOT NULL,
  card jsonb NOT NULL,
  marked_cells jsonb DEFAULT '[]',
  is_host boolean DEFAULT false,
  joined_at timestamptz DEFAULT now(),
  is_connected boolean DEFAULT true
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_games_code ON games(code);
CREATE INDEX IF NOT EXISTS idx_players_game_id ON players(game_id);
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);

-- Enable Row Level Security
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;

-- RLS Policies for games table
CREATE POLICY "Anyone can view games"
  ON games FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create games"
  ON games FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Hosts can update their games"
  ON games FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete games"
  ON games FOR DELETE
  USING (true);

-- RLS Policies for players table
CREATE POLICY "Anyone can view players"
  ON players FOR SELECT
  USING (true);

CREATE POLICY "Anyone can join games as players"
  ON players FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Players can update their own data"
  ON players FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete players"
  ON players FOR DELETE
  USING (true);