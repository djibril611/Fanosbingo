/*
  # Add Server Time Synchronization Function

  1. New Functions
    - `get_server_timestamp()` - Returns the current server timestamp in milliseconds
      - Used by clients to synchronize their local clocks with the server
      - Ensures all players see consistent countdown timers

  2. Security
    - Function is accessible to all users (no auth required)
    - Only returns current timestamp, no sensitive data

  3. Notes
    - Returns timestamp in milliseconds for JavaScript compatibility
    - This solves the issue where different players see different countdown times
      due to their device clocks being out of sync
*/

-- Create function to get server timestamp in milliseconds
CREATE OR REPLACE FUNCTION get_server_timestamp()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (EXTRACT(EPOCH FROM now()) * 1000)::bigint;
END;
$$;

-- Grant execute permission to all users
GRANT EXECUTE ON FUNCTION get_server_timestamp() TO anon, authenticated;
