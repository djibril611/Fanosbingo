/*
  # Add Telegram Bot Username Setting

  1. Changes
    - Insert default telegram_bot_username setting into settings table
  
  2. Notes
    - This allows admin to configure the bot username through the admin panel
    - The bot username is used in referral and invitation links
*/

INSERT INTO settings (id, value, description, updated_by)
VALUES (
  'telegram_bot_username',
  'Habeshabingo91bot',
  'Telegram Bot Username (without @) for generating invitation links',
  'system'
)
ON CONFLICT (id) DO UPDATE
SET description = EXCLUDED.description;