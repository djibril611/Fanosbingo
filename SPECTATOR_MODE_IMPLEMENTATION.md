# Spectator Mode Implementation

## Overview
Implemented a unified spectator experience where all users (players, disqualified players, and late arrivals) watch ongoing games together and return to the lobby as a group when the game finishes.

## Key Changes

### 1. Single Active Game Architecture
- The database already enforces only one active game at a time (waiting or playing status)
- When a game finishes, a new waiting game is automatically created with a 25-second countdown
- This ensures a clean separation between games with no overlapping sessions

### 2. Disqualification Behavior
**Before:** Disqualified players were kicked back to the lobby after 5 seconds

**After:** Disqualified players remain in the game room as spectators until the game ends

**Changes Made:**
- Removed automatic redirect logic from `App.tsx` when a player is disqualified
- Removed the disqualification timeout from `GameRoom.tsx`
- Changed the disqualification UI from a blocking modal to an informational banner
- Disqualified players' cards disappear and they see a spectator view instead

### 3. Unified Return to Lobby
**All users return to the lobby together 5 seconds after the game finishes, including:**
- Active players who played until the end
- Disqualified players who became spectators
- Users who joined late and watched as spectators

**Implementation:**
- Single game finish event triggers for all users viewing the game
- Consistent 5-second delay before returning to lobby
- Synchronized state clearing across all users

### 4. Spectator Experience

#### Three Types of Spectators:
1. **Late Arrivals:** Users who enter while a game is already playing
2. **Disqualified Players:** Players who made a false BINGO claim
3. **Non-Players:** Users watching without joining

#### Spectator View Shows:
- Complete game board with all 75 numbers (1-75)
- Current number being called
- Recent call history
- Game statistics (pot, players, stake, call count)
- Clear messaging about returning to lobby when game ends

#### Spectator View Does NOT Show:
- Their own bingo card (if disqualified)
- BINGO button
- Cell marking controls
- Join game controls

### 5. UI Updates

#### Disqualification Banner (Replaces Modal):
- Appears at the top of the game view
- Shows "Disqualified - False BINGO" message
- Explains they're now watching as a spectator
- Informs them to wait for game to finish

#### Spectator Panel:
- Eye icon to indicate spectator mode
- Different messaging for disqualified vs. regular spectators
- Clear indication that everyone returns to lobby together
- Removed individual card view for spectators

#### Lobby During Active Game:
- Shows "Game In Progress" banner
- "Watch Game" button to spectate
- Number selection disabled until current game finishes
- Clear messaging about waiting for the next round

## User Flow Examples

### Scenario 1: Player Gets Disqualified
1. Player joins game and selects a number
2. Game starts, player marks cells
3. Player claims BINGO incorrectly
4. Player's card disappears, replaced with spectator view
5. Red banner shows "You are now watching as a spectator"
6. Player watches the rest of the game
7. Game finishes, player returns to lobby with everyone else
8. Player can join the next game from the lobby

### Scenario 2: Late Arrival Spectator
1. User opens app while game is already playing
2. Sees "Game In Progress" banner in lobby
3. Clicks "Watch Game" button
4. Enters spectator view with no card
5. Watches game with full board visibility
6. Game finishes, returns to lobby with everyone
7. Joins the next game when countdown starts

### Scenario 3: Normal Game Completion
1. Multiple players join and game starts
2. Players mark cells and play normally
3. One or more players win
4. All players (including winners) see results screen
5. After 5 seconds, everyone returns to lobby together
6. New game countdown starts automatically

## Technical Details

### State Management
- `gameId` and `playerId` stored in localStorage for session persistence
- Game status polling every 2 seconds as backup to real-time subscriptions
- Synchronized cleanup of game state when returning to lobby

### Real-time Updates
- Supabase subscriptions monitor game status changes
- All users subscribed to the same game receive finish event
- Consistent timeout triggers for all users

### Database Constraints
- Only one game with status 'waiting' or 'playing' can exist at once
- Automatic next game creation via database trigger
- Clean game lifecycle management

## Benefits

1. **No Confusion:** Everyone knows the game is in progress and where to go
2. **Community Experience:** All participants share the same game timeline
3. **Fair Play:** Disqualified players can't immediately join a new game
4. **Simplified Logic:** Single return point eliminates timing edge cases
5. **Better UX:** Clear messaging at every stage of the game lifecycle
