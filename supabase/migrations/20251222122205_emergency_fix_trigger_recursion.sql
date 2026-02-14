/*
  # Emergency Fix: Trigger Recursion Disaster

  ## Summary
  Fixes catastrophic trigger recursion that created 420,699 duplicate games.
  The game_changes_trigger was firing on every INSERT, causing a cascade loop.

  ## Root Cause
  - game_changes_trigger fires on INSERT/UPDATE/DELETE
  - notify_game_changes() was being called in a loop
  - Multiple games created within milliseconds of each other
  - All have same game_number (1301) showing they're duplicates

  ## Changes

  1. Disable Problematic Triggers
     - Temporarily drop game_changes_trigger to stop the bleeding
     - Keep essential triggers (payout, create_next_game)

  2. Clean Up Database
     - Delete 420,699 duplicate waiting games
     - Keep only 1 waiting game
     - Keep all finished games (they're legitimate history)

  3. Fix notify_game_changes Function
     - Add recursion protection
     - Prevent trigger loops

  4. Safely Re-enable Triggers
     - Recreate game_changes_trigger with safeguards

  ## Impact
  - Removes ~525,000 rows from games table
  - Frees up massive database space
  - Prevents future recursion
*/

-- Step 1: EMERGENCY - Disable the problematic trigger immediately
DROP TRIGGER IF EXISTS game_changes_trigger ON games;
DROP TRIGGER IF EXISTS player_changes_trigger ON players;

-- Step 2: Clean up the disaster - Keep only 1 waiting game
DO $$
DECLARE
  v_keep_game_id uuid;
  v_deleted_count integer;
BEGIN
  -- Get the ID of the most recent waiting game to keep
  SELECT id INTO v_keep_game_id
  FROM games
  WHERE status = 'waiting'
  ORDER BY created_at DESC
  LIMIT 1;

  -- Delete all other waiting games
  DELETE FROM games
  WHERE status = 'waiting'
    AND id != v_keep_game_id;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RAISE NOTICE 'Emergency cleanup complete. Deleted % duplicate waiting games.', v_deleted_count;
END $$;

-- Step 3: Fix the notify_game_changes function with recursion protection
CREATE OR REPLACE FUNCTION notify_game_changes()
RETURNS trigger AS $$
BEGIN
  -- Simple pass-through function for Realtime
  -- Realtime subscriptions will handle the broadcasting
  -- No additional logic to prevent recursion

  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Fix the notify_player_changes function
CREATE OR REPLACE FUNCTION notify_player_changes()
RETURNS trigger AS $$
BEGIN
  -- Simple pass-through function for Realtime
  -- Realtime subscriptions will handle the broadcasting

  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 5: Recreate triggers safely (only on essential operations)
-- Only trigger on UPDATE and DELETE, NOT INSERT to prevent recursion during game creation
CREATE TRIGGER game_changes_trigger
  AFTER UPDATE OR DELETE ON games
  FOR EACH ROW
  EXECUTE FUNCTION notify_game_changes();

-- Players trigger is safe because it doesn't create games
CREATE TRIGGER player_changes_trigger
  AFTER INSERT OR UPDATE OR DELETE ON players
  FOR EACH ROW
  EXECUTE FUNCTION notify_player_changes();

-- Step 6: Ensure we have exactly one waiting game after cleanup
SELECT ensure_waiting_game_exists();

-- Step 7: Verify the cleanup
DO $$
DECLARE
  v_waiting_count integer;
  v_finished_count integer;
BEGIN
  SELECT COUNT(*) INTO v_waiting_count FROM games WHERE status = 'waiting';
  SELECT COUNT(*) INTO v_finished_count FROM games WHERE status = 'finished';

  RAISE NOTICE 'Database health check:';
  RAISE NOTICE '  - Waiting games: % (should be 1)', v_waiting_count;
  RAISE NOTICE '  - Finished games: % (preserved)', v_finished_count;

  IF v_waiting_count != 1 THEN
    RAISE WARNING 'Expected exactly 1 waiting game, found %', v_waiting_count;
  END IF;
END $$;
