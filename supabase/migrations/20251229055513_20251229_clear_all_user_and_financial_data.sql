/*
  # Clear All User and Financial Data

  1. Data Deletion
    - Clear all game events and snapshots
    - Clear all player sessions
    - Clear all game players
    - Clear all games
    - Clear all financial data (transfers, referral bonuses)
    - Clear all withdrawal requests
    - Clear all SMS data (user submissions first, then bank messages)
    - Clear all user state
    - Clear all telegram users

  2. Notes
    - Schema and tables are preserved
    - Only data is deleted
    - Card layouts are preserved as they are system data
*/

-- Clear related tables first (in order of dependencies)
DELETE FROM game_events;
DELETE FROM game_state_snapshots;
DELETE FROM player_sessions;
DELETE FROM players;
DELETE FROM games;

-- Clear financial data
DELETE FROM balance_transfers;
DELETE FROM referral_bonuses;
DELETE FROM withdrawal_requests;

-- Clear SMS data (user submissions must be deleted before bank messages due to FK)
DELETE FROM user_sms_submissions;
DELETE FROM bank_sms_messages;

-- Clear user state
DELETE FROM user_state;

-- Clear telegram users (this will cascade delete some related data)
DELETE FROM telegram_users;
