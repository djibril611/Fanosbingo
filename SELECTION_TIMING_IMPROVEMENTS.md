# Selection Timing and Race Condition Improvements

## Problem Summary

Previously, users could select a card in the last few seconds before game start, and due to network latency, their selection would fail after the game had already started. This created a poor user experience where legitimate selections were rejected.

## Root Causes

1. **No Selection Cutoff** - Cards could be selected right up until the game started
2. **Race Conditions** - Multiple checks (game status, card availability, balance) were not atomic
3. **Network Latency** - A selection at countdown=2 might arrive at server after game started
4. **Time Drift** - Client countdown might not match server time exactly
5. **No Visual Warning** - Users weren't warned when it was too risky to select

## Solutions Implemented

### 1. Database Layer - Selection Cutoff Window

**Migration: `add_selection_cutoff_system`**

- Added `selection_closed_at` column to games table (automatically set 5 seconds before `starts_at`)
- Added `allow_late_joins` boolean for grace period management
- Created automatic trigger that sets `selection_closed_at = starts_at - 5 seconds`

```sql
-- Trigger automatically calculates selection_closed_at
CREATE TRIGGER set_selection_closed_at_trigger
  BEFORE INSERT OR UPDATE OF starts_at ON games
  FOR EACH ROW
  EXECUTE FUNCTION set_selection_closed_at();
```

### 2. Atomic Card Selection Function

**Function: `select_card_atomic()`**

This stored procedure eliminates race conditions by:
- Using `FOR UPDATE` locks to prevent concurrent modifications
- Checking selection window with grace period (2 second buffer)
- Validating game status, card availability, and user balance atomically
- Returning detailed error codes for better error handling

**Key Features:**
- Grace period allows selections up to 2 seconds after visual cutoff
- `FOR UPDATE SKIP LOCKED` prevents deadlocks on card selection
- All validations happen in a single transaction
- Returns structured JSON with success status and error codes

**Error Codes:**
- `GAME_NOT_FOUND` - Game doesn't exist
- `GAME_NOT_WAITING` - Game already started
- `SELECTION_CLOSED` - Selection window has closed
- `CARD_TAKEN` - Another player already selected this card
- `INSUFFICIENT_BALANCE` - User doesn't have enough balance
- `USER_NOT_FOUND` - User not registered
- `INTERNAL_ERROR` - Database or system error

### 3. Updated Edge Function

**File: `supabase/functions/select-card/index.ts`**

- Now uses `select_card_atomic()` function instead of manual checks
- Returns appropriate HTTP status codes based on error types:
  - 423 (Locked) - Selection window closed
  - 409 (Conflict) - Card already taken
  - 402 (Payment Required) - Insufficient balance
  - 500 (Internal Error) - System error
- Includes timing information in responses

### 4. Client-Side Protection

**File: `src/components/Lobby.tsx`**

#### A. Countdown-Based Card Disabling
- Cards are disabled when countdown < 5 seconds
- Prevents users from even attempting late selections
- Exception: Users who already selected can deselect

```typescript
const isSelectionClosing = countdown < 5 && countdown > 0;
const isDisabled = /* other conditions */ || isSelectionClosing;
```

#### B. Visual Warning System
- Countdown timer changes color based on urgency:
  - Green (>10s) - Normal state
  - Orange (10-5s) - Warning state
  - Red (<5s) - Critical state with pulse animation
- Large warning banner appears when countdown ≤ 5s:
  ```
  ⚠️ Selection closing in X seconds!
  Choose your card now or you may miss this game
  ```
- Timer label changes from "START" to "CLOSING" when under 5 seconds

#### C. Automatic Retry Logic
- If selection fails due to network timeout, automatically retries once
- Shows "Connection slow, retrying..." message
- Gives user feedback about what's happening
- Only retries once to avoid loops

```typescript
if (errorMessage.includes('timeout') || errorMessage.includes('network')) {
  if (!isRetry) {
    addToast('Connection slow, retrying...', 'info');
    setTimeout(() => handleNumberClick(num, true), 500);
  }
}
```

#### D. Enhanced Error Messages
- `SELECTION_CLOSED` → "Selection window has closed. Game is starting!"
- `CARD_TAKEN` → "That card was just taken! Please choose another."
- `INSUFFICIENT_BALANCE` → "Insufficient balance to join this game."
- Network issues → Automatic retry with feedback

### 5. Performance Optimizations

**Indexes Added:**
```sql
-- Fast lookups for open selection windows
CREATE INDEX idx_games_selection_closed_at
ON games(selection_closed_at) WHERE status = 'waiting';

-- Composite index for game timing queries
CREATE INDEX idx_games_status_times
ON games(status, selection_closed_at, starts_at);
```

## How It Works - User Flow

### Scenario 1: Normal Selection (countdown > 5s)
1. User clicks card #42 when countdown is at 15 seconds
2. Client checks basic validation (logged in, sufficient balance)
3. Client sends request to select-card edge function
4. Edge function calls `select_card_atomic()` with all card data
5. Database function:
   - Locks game row
   - Validates selection window (still open, 10s remaining)
   - Validates card not taken
   - Validates user balance
   - Inserts player record (triggers balance deduction)
   - Returns success
6. User sees "Card 42 secured!" message

### Scenario 2: Selection at 4 Seconds (Protected)
1. User tries to click card #42 when countdown is at 4 seconds
2. Client prevents click - button is disabled
3. User sees warning banner: "Selection closing in 4 seconds!"
4. No network request is made - saves bandwidth

### Scenario 3: Selection at 6 Seconds with Network Delay
1. User clicks card #42 when countdown is at 6 seconds
2. Client sends request to server
3. Network delay of 2 seconds occurs
4. Request arrives at server when countdown is at 4 seconds (selection_closed_at still 1 second away)
5. Grace period of 2 seconds means selection window technically closes at 3 seconds before game start
6. Database validates: current_time (4s before start) < selection_closed_at + 2s grace = success!
7. Card is successfully selected despite network delay

### Scenario 4: Too Late Selection
1. User clicks card at 2 seconds (somehow bypassed client protection)
2. Request arrives at server after selection_closed_at + grace period
3. `select_card_atomic()` returns:
   ```json
   {
     "success": false,
     "error": "Selection window has closed",
     "error_code": "SELECTION_CLOSED",
     "closed_at": "2024-12-25T10:00:20Z",
     "current_time": "2024-12-25T10:00:24Z"
   }
   ```
4. Client shows: "Selection window has closed. Game is starting!"
5. User understands why their selection wasn't accepted

## Benefits

1. **Fair Play** - Network latency no longer causes legitimate selections to fail
2. **Clear Feedback** - Users know exactly when to select and why selections fail
3. **No Race Conditions** - Atomic database operations prevent duplicate selections
4. **Better UX** - Visual warnings and countdown color changes guide users
5. **Automatic Recovery** - Retry logic handles temporary network issues
6. **Performance** - New indexes speed up validation queries
7. **Scalability** - Atomic operations work under high concurrent load

## Testing Recommendations

### Manual Testing
1. Join game with 25 second countdown
2. Wait until countdown reaches 6 seconds
3. Select a card - should work
4. Wait until countdown reaches 4 seconds
5. Try to select another card - should be disabled with warning
6. Try to deselect your card - should still work

### Network Latency Testing
1. Open browser DevTools → Network tab
2. Set throttling to "Slow 3G"
3. Select card at 8-10 seconds remaining
4. Should succeed despite 2-3 second delay
5. Select card at 3-4 seconds remaining
6. Should fail with "Selection window has closed" message

### Race Condition Testing
1. Open two browser windows with different users
2. Both try to select same card simultaneously
3. One should succeed, other should get "Card already taken"
4. Try selecting different cards simultaneously
5. Both should succeed

### Grace Period Testing
1. Select card exactly at 5 second mark
2. With grace period, should succeed if request arrives within 2 seconds
3. Can verify by checking timestamps in error response

## Configuration

### Adjusting Selection Cutoff Window
To change from 5 seconds to a different value:

```sql
-- Update the trigger function
CREATE OR REPLACE FUNCTION set_selection_closed_at()
RETURNS TRIGGER AS $$
BEGIN
  -- Change '5 seconds' to desired cutoff
  NEW.selection_closed_at := NEW.starts_at - interval '7 seconds';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

And update client check in `Lobby.tsx`:
```typescript
// Change from 5 to your desired cutoff
if (countdown < 7 && !isRetry) {
  addToast('Selection window is closing!', 'error');
  return;
}
```

### Adjusting Grace Period
In `select_card_atomic()` function:
```sql
-- Change from 2 seconds to desired grace period
IF v_current_time > v_game.selection_closed_at + interval '3 seconds' THEN
```

### Disabling Grace Period
Set `allow_late_joins = false` on a game to enforce strict cutoff without grace period.

## Summary

The selection timing improvements ensure that users have a fair and predictable experience when selecting cards. The 5-second cutoff with 2-second grace period balances user experience with game timing requirements, while visual warnings and automatic retry logic handle network issues gracefully.
