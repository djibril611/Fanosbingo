/*
  # Update Auto-Caller Interval to 4 Seconds

  1. Changes
    - Remove existing cron job that runs every 10 seconds
    - Create new cron job that runs every 4 seconds
    - This makes numbers get called every 4 seconds during active games
    
  2. Notes
    - The edge function still has a 3-second minimum safety check
    - Since 4 seconds > 3 seconds, all calls will go through
    - Players will experience faster-paced games
*/

-- Remove existing cron job
SELECT cron.unschedule('call-bingo-numbers');

-- Schedule to run every 4 seconds
SELECT cron.schedule_in_database(
  'call-bingo-numbers',
  '4 seconds',
  $$SELECT call_next_bingo_number()$$,
  'postgres'
);