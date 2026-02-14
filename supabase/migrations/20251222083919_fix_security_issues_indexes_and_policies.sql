/*
  # Fix Security Issues - Part 1: Indexes and RLS Policies

  ## Summary
  This migration addresses critical security and performance issues identified in the database audit:
  - Removes unused indexes that slow down write operations
  - Consolidates duplicate RLS policies to eliminate security confusion
  - Improves overall database performance and security posture

  ## Changes

  ### 1. Drop Unused Indexes
  Removes 15 unused indexes that were created but never utilized:
  - game_state_snapshots: idx_snapshots_game_id, idx_snapshots_timestamp
  - games: idx_games_starts_at
  - player_sessions: idx_sessions_player_id, idx_sessions_session_id
  - game_events: idx_events_game_id, idx_events_player_id, idx_events_type, idx_events_timestamp
  - bank_sms_messages: idx_sms_telegram_user, idx_sms_sender, idx_sms_transaction_number, idx_sms_is_processed, idx_bank_sms_claimed
  - user_sms_submissions: idx_user_sms_matched_sms_id

  ### 2. Consolidate Duplicate RLS Policies
  Removes redundant permissive policies that create security confusion:
  - bank_options: Keeps most restrictive policy
  - game_state_snapshots: Consolidates to single public read policy
  - games: Consolidates to single public read policy
  - player_sessions: Consolidates to single public read policy

  ## Security Impact
  - Reduces attack surface by removing redundant policies
  - Improves write performance by removing unused indexes
  - Makes security model clearer and easier to audit

  ## Performance Impact
  - Faster INSERT/UPDATE/DELETE operations (no unused index maintenance)
  - Reduced storage footprint
  - Clearer query execution plans
*/

-- ============================================================================
-- SECTION 1: Drop Unused Indexes
-- ============================================================================

-- Drop unused indexes on game_state_snapshots
DROP INDEX IF EXISTS idx_snapshots_game_id;
DROP INDEX IF EXISTS idx_snapshots_timestamp;

-- Drop unused index on games
DROP INDEX IF EXISTS idx_games_starts_at;

-- Drop unused indexes on player_sessions
DROP INDEX IF EXISTS idx_sessions_player_id;
DROP INDEX IF EXISTS idx_sessions_session_id;

-- Drop unused indexes on game_events
DROP INDEX IF EXISTS idx_events_game_id;
DROP INDEX IF EXISTS idx_events_player_id;
DROP INDEX IF EXISTS idx_events_type;
DROP INDEX IF EXISTS idx_events_timestamp;

-- Drop unused indexes on bank_sms_messages
DROP INDEX IF EXISTS idx_sms_telegram_user;
DROP INDEX IF EXISTS idx_sms_sender;
DROP INDEX IF EXISTS idx_sms_transaction_number;
DROP INDEX IF EXISTS idx_sms_is_processed;
DROP INDEX IF EXISTS idx_bank_sms_claimed;

-- Drop unused index on user_sms_submissions
DROP INDEX IF EXISTS idx_user_sms_matched_sms_id;

-- ============================================================================
-- SECTION 2: Consolidate Duplicate RLS Policies
-- ============================================================================

-- Fix bank_options: Remove duplicate SELECT policies for authenticated users
DROP POLICY IF EXISTS "Anyone can view active banks" ON bank_options;
-- Keep: "Authenticated users can view all banks"

-- Fix game_state_snapshots: Consolidate to single public read policy
DROP POLICY IF EXISTS "Service can manage snapshots" ON game_state_snapshots;
-- Keep: "Anyone can view snapshots"

-- Fix games: Remove redundant policy
DROP POLICY IF EXISTS "Anyone can view waiting and playing games" ON games;
-- Keep: "Anyone can view games"

-- Fix player_sessions: Consolidate to single policy
DROP POLICY IF EXISTS "Service can manage sessions" ON player_sessions;
-- Keep: "Anyone can view sessions"

-- ============================================================================
-- NOTES
-- ============================================================================

/*
  Auth DB Connection Strategy:
  The Auth server connection pool should be changed from fixed (10) to percentage-based.
  This cannot be changed via SQL and must be configured in the Supabase Dashboard:
  Settings > Database > Connection Pooling > Auth Pooler > Change to "Percentage" mode
*/