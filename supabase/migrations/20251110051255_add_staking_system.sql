/*
  # Add Staking System

  1. Changes to Games Table
    - Add `stake_amount` column (default 10 ETB per player)
    - Add `total_pot` column to track accumulated stakes
    - Add `winner_prize` column to track 75% payout amount

  2. Changes to Players Table
    - Add `stake_paid` column to track if player has paid their stake

  3. Notes
    - Each player stakes 10 ETB when joining
    - Winner receives 75% of total pot
    - Remaining 25% could be used for platform fees/next game
*/

-- Add staking columns to games table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'games' AND column_name = 'stake_amount'
  ) THEN
    ALTER TABLE games ADD COLUMN stake_amount integer DEFAULT 10;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'games' AND column_name = 'total_pot'
  ) THEN
    ALTER TABLE games ADD COLUMN total_pot integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'games' AND column_name = 'winner_prize'
  ) THEN
    ALTER TABLE games ADD COLUMN winner_prize integer DEFAULT 0;
  END IF;
END $$;

-- Add stake_paid column to players table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'players' AND column_name = 'stake_paid'
  ) THEN
    ALTER TABLE players ADD COLUMN stake_paid boolean DEFAULT false;
  END IF;
END $$;

-- Create function to update pot when player joins
CREATE OR REPLACE FUNCTION update_game_pot()
RETURNS TRIGGER AS $$
BEGIN
  -- Update total pot and winner prize when a player joins
  UPDATE games
  SET 
    total_pot = total_pot + stake_amount,
    winner_prize = FLOOR((total_pot + stake_amount) * 0.75)
  WHERE id = NEW.game_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update pot
DROP TRIGGER IF EXISTS update_pot_on_player_join ON players;
CREATE TRIGGER update_pot_on_player_join
  AFTER INSERT ON players
  FOR EACH ROW
  EXECUTE FUNCTION update_game_pot();
