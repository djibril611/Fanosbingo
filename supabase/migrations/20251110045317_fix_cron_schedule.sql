/*
  # Fix Cron Schedule for Number Calling

  1. Changes
    - Remove the existing cron job with invalid schedule
    - Create new cron job that runs every 10 seconds (minimum reliable interval)
    - The function itself handles the 3-second delay between calls
    
  2. Notes
    - pg_cron doesn't reliably support seconds in all environments
    - Using standard 5-field cron format is more reliable
    - Function logic ensures 3-second minimum between calls
*/

-- Remove existing cron job
SELECT cron.unschedule('call-bingo-numbers');

-- Schedule to run every 10 seconds using standard format
-- This uses the special cron.schedule_in_database function that supports seconds
SELECT cron.schedule_in_database(
  'call-bingo-numbers',
  '10 seconds',
  $$SELECT call_next_bingo_number()$$,
  'postgres'
);