# Balance Transfer System Update

## Summary of Changes

This update enables users to transfer both deposited and won balance, and fixes the hardcoded external bot URL issue.

## Features Implemented

### 1. Deposited Balance Transfer Support

Previously, users could only transfer their won balance. Now users can transfer from either:
- **Won Balance** (withdrawable earnings from games)
- **Deposited Balance** (money from deposits, normally play-only)

**Important Notes:**
- Transfers from either balance type are added to the recipient's **deposited balance**
- Minimum transfer amount remains 10 ETB
- Cannot transfer to yourself

### 2. Updated Transfer Flow

#### Web App (ReferralAndTransfer Component)
- Shows both balance types with clear visual distinction
- Balance type selector with colored buttons:
  - Blue button for Won Balance
  - Orange button for Deposited Balance
- Real-time validation based on selected balance type
- Clear labels explaining each balance type

#### Telegram Bot
- Enhanced `/transfer` command with interactive flow
- Users select balance type via inline keyboard buttons
- Shows available balance for each type
- Step-by-step guided transfer process:
  1. Select balance type (Won or Deposited)
  2. Enter recipient username
  3. Enter transfer amount
  4. Confirmation with updated balance details

### 3. Fixed Hardcoded Bot URL

The "Play Bingo" button now uses a configurable URL instead of hardcoded `https://multiplayer-bingo-we-w1f2.bolt.host/`

**Environment Variables Added:**
- `VITE_APP_URL` - Your current app URL (frontend)
- `APP_URL` - Used by edge functions (fallback to VITE_APP_URL)

**How to Update:**
1. Update `VITE_APP_URL` in your `.env` file to your current deployed app URL
2. The Telegram bot will automatically use this URL for the Play button

## Database Changes

### New Migration: `enable_deposited_balance_transfer`

**New Column:**
- `balance_transfers.balance_type` - Tracks whether transfer was from 'deposited' or 'won' balance

**Updated Function:**
- `transfer_balance()` now accepts `balance_type_param` parameter
- Validates balance type and sufficient funds
- Deducts from appropriate balance (won or deposited)
- Always credits recipient's deposited balance
- Maintains transaction atomicity

## New Edge Function

### `transfer-balance`
- Handles balance transfers from web app
- Validates recipient username
- Calls database `transfer_balance()` function with balance type
- Returns detailed success/error responses
- Deployed at: `{SUPABASE_URL}/functions/v1/transfer-balance`

## Testing Recommendations

1. **Test Deposited Balance Transfer:**
   - User with deposited balance transfers to another user
   - Verify amount is deducted from sender's deposited balance
   - Verify amount is added to recipient's deposited balance

2. **Test Won Balance Transfer:**
   - User with won balance transfers to another user
   - Verify amount is deducted from sender's won balance
   - Verify amount is added to recipient's deposited balance

3. **Test Telegram Bot Flow:**
   - Send `/transfer` command
   - Select balance type
   - Complete transfer flow
   - Verify notifications sent to both users

4. **Test Web App:**
   - Select balance type in transfer modal
   - Verify balance validation works correctly
   - Complete transfer and verify success message

5. **Test Play Button URL:**
   - Register or start bot with `/start`
   - Verify "Play Bingo" button uses correct URL (not the old bolt.host URL)
   - Test `/play` command as well

## Configuration Required

Update your `.env` file with:
```env
VITE_APP_URL=https://your-actual-app-url.com
TELEGRAM_BOT_USERNAME=your_bot_username
```

Replace the example values with your actual URLs and bot username.

## Breaking Changes

None. All existing transfer functionality remains compatible. The system defaults to 'won' balance if no balance type is specified (backward compatible).
