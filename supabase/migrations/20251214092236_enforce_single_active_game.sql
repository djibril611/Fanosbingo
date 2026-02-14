/*
  # Enforce Single Active Game Rule
  
  1. Purpose
    - Ensure only one active Bingo game runs at a time
    - Prevent countdown/waiting games from starting during active play
    - Automatically create next game only after current game finishes
  
  2. New Function
    - `create_next_game_after_finish`: Creates a new waiting game after game finishes
    - Checks that no other waiting/playing game exists before creating
    - Automatically sets up the next game with 25-second countdown
  
  3. New Trigger
    - Fires when a game status changes to 'finished'
    - Automatically creates the next waiting game
    - Ensures seamless transition between games
  
  4. Game Flow
    - Game 1 is 'playing' → No waiting game exists
    - Game 1 finishes → Trigger creates Game 2 with 'waiting' status
    - Game 2 countdown starts → Players can join
    - Game 2 starts 'playing' → Game 2 becomes active
    - Repeat cycle
  
  5. Benefits
    - No overlap between games
    - Clear separation of active and waiting periods
    - Spectators automatically see active games without confusion
*/

-- Function to create the next game after current game finishes
CREATE OR REPLACE FUNCTION create_next_game_after_finish()
RETURNS TRIGGER AS $$
DECLARE
  next_game_number integer;
  existing_active_game uuid;
BEGIN
  -- Only proceed if game just finished
  IF NEW.status = 'finished' AND OLD.status != 'finished' THEN
    
    -- Check if there's already a waiting or playing game
    SELECT id INTO existing_active_game
    FROM games
    WHERE status IN ('waiting', 'playing')
    LIMIT 1;
    
    -- Only create new game if no active/waiting game exists
    IF existing_active_game IS NULL THEN
      -- Get the next game number
      SELECT COALESCE(MAX(game_number), 0) + 1 INTO next_game_number
      FROM games;
      
      -- Create the next game
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
        next_game_number,
        now() + interval '25 seconds',
        NULL,
        ARRAY[]::uuid[],
        10,
        0,
        0,
        0
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-create next game when current finishes
DROP TRIGGER IF EXISTS create_next_game_on_finish ON games;
CREATE TRIGGER create_next_game_on_finish
  AFTER UPDATE ON games
  FOR EACH ROW
  WHEN (NEW.status = 'finished' AND OLD.status != 'finished')
  EXECUTE FUNCTION create_next_game_after_finish();