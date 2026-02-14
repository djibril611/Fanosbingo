/*
  # Add Game URL Setting

  1. New Settings
    - `game_url` - The URL of the web app that opens when users click the Play button in Telegram
      - Default: https://multiplayer-bingo-we-5btk.bolt.host/
      - Can be changed by admin to point to production domain or different environment

  2. Purpose
    - Allows admin to configure which web app URL the Telegram bot uses
    - Makes it easy to switch between development, staging, and production environments
    - No code changes needed when domain changes
*/

-- Add game URL setting
INSERT INTO settings (id, value, description)
VALUES (
  'game_url',
  'https://multiplayer-bingo-we-5btk.bolt.host/',
  'The URL of the web app that opens when users click the Play button in Telegram'
)
ON CONFLICT (id) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description;
