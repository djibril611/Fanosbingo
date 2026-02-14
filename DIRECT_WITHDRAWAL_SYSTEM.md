# Direct Withdrawal System Implementation

## Overview

The BNB withdrawal system has been redesigned to use a **direct user-controlled withdrawal** model, where users manage their own withdrawals from the smart contract using their connected wallets.

## New Contract Architecture

### Contract: `FanosBingoDeposit`

**Key Features:**
- Users have individual on-chain credit balances tracked in `credits[address]`
- Contract enforces withdrawal limits (min: 0.1 BNB, daily: 5 BNB, weekly: 10 BNB)
- Users can withdraw directly using `withdrawTo(address, amount)` function
- Owner can add win credits to user addresses via `addWinCredits(address, amount)`

## How It Works

### Two-Step Withdrawal Process

#### Step 1: Claim Winnings to Contract (Backend)
When users win games:
1. Database credits `won_balance` in `telegram_users` table
2. User clicks "Claim to Contract" button in withdrawal modal
3. Edge function `claim-winnings-to-contract` is called:
   - Deducts from user's `won_balance` in database
   - Calls contract's `addWinCredits(userWallet, amount)` as owner
   - Adds credits to user's on-chain balance
   - **Gas paid by the system (owner wallet)**

#### Step 2: Withdraw from Contract (User)
After credits are on-chain:
1. User sees their on-chain credits in the withdrawal modal
2. User enters withdrawal amount
3. User's wallet calls `contract.withdrawTo(address, amountWei)`
4. Contract enforces limits and sends BNB to specified address
5. **Gas paid by the user**

## Implementation Details

### Edge Functions

#### 1. `claim-winnings-to-contract`
- **Purpose**: Transfer user winnings from database to on-chain credits
- **Authorization**: No JWT verification (uses service role key)
- **Process**:
  - Validates user has sufficient `won_balance`
  - Deducts amount from database
  - Calls contract's `addWinCredits()` as owner
  - Refunds database balance if blockchain transaction fails

#### 2. `credit-win-to-contract` (Alternative)
- **Purpose**: Direct crediting for specific use cases
- **Usage**: Can be called with exact telegram user ID and amount
- **Same flow as above but with explicit parameters**

### Frontend Components

#### `BnbWithdrawalModal.tsx`
Updated to support the two-step process:

**New Features:**
- Displays both database balance and on-chain credits
- "Claim to Contract" button to transfer winnings
- Uses `useWriteContract` hook for direct user withdrawals
- Real-time on-chain credit reading via `useReadContract`
- Transaction confirmation tracking with `useWaitForTransactionReceipt`

**Key Changes:**
- Removed old backend withdrawal API call
- Added direct contract interaction using wagmi hooks
- Shows clear separation between claimable and withdrawable balance

### Smart Contract ABI

Added to `src/lib/walletConfig.ts`:
```typescript
export const DEPOSIT_CONTRACT_ABI = [
  // Owner only
  { name: "addWinCredits", ... },

  // User callable
  { name: "withdraw", ... },
  { name: "withdrawTo", ... },

  // View functions
  { name: "credits", ... },
  { name: "getContractBalance", ... },
  { name: "minWithdraw", ... },
  { name: "maxDaily", ... },
  { name: "maxWeekly", ... }
]
```

## User Flow

1. **User Wins Game**
   - System credits `won_balance` in database
   - User sees winnings in "Winnings in Database" section

2. **User Opens Withdrawal Modal**
   - Sees database balance (in BNB equivalent)
   - Sees on-chain credits (ready to withdraw)
   - Connects wallet if not already connected

3. **User Claims to Contract**
   - Clicks "Claim to Contract" button
   - Backend pays gas to add credits on-chain
   - Credits appear in "On-Chain Credits" section

4. **User Withdraws**
   - Enters amount to withdraw (or clicks MAX)
   - Clicks "Withdraw from Contract"
   - Signs transaction with their wallet (pays gas)
   - BNB sent directly to their wallet address

## Security Features

### Database Level
- `won_balance` deducted atomically before blockchain transaction
- Automatic refund if blockchain transaction fails
- RLS policies ensure users can only access their own data

### Smart Contract Level
- Per-user credit tracking
- Built-in withdrawal limits enforced on-chain:
  - Minimum: 0.1 BNB
  - Daily: 5 BNB per user
  - Weekly: 10 BNB per user
- Reentrancy protection
- Only owner can add credits

### Frontend Level
- Wallet signature required for all withdrawals
- Real-time balance validation
- Clear separation of claimable vs withdrawable funds

## Configuration

### Required Settings in Database

```sql
INSERT INTO settings (id, value, description) VALUES
('deposit_contract_address', '0x...', 'Smart contract address'),
('deposit_contract_private_key', '0x...', 'Owner private key'),
('deposit_bsc_rpc_url', 'https://...', 'BSC RPC endpoint'),
('withdrawal_credits_to_bnb_rate', '1000', 'Conversion rate');
```

### Contract Deployment

1. Deploy `FanosBingoDeposit.sol` to BSC
2. Set minimum deposit in constructor
3. Fund contract with BNB for withdrawals
4. Update settings with contract address and owner private key

## Advantages of This Approach

1. **User Control**: Users manage their own withdrawals
2. **Cost Efficient**: System only pays gas for crediting, users pay for withdrawal
3. **Transparent**: All credits visible on-chain
4. **Secure**: Contract enforces limits, no backend manipulation
5. **Decentralized**: Follows web3 best practices
6. **Gas Optimized**: Users can batch multiple claims before withdrawing

## Monitoring

### Admin Dashboard
- Track total contract balance
- Monitor pending claims
- View withdrawal statistics
- Alert if contract balance is low

### User Experience
- See exact on-chain balance in real-time
- Transaction hash for all operations
- Clear error messages for limit violations
- BSCscan links for verification

## Troubleshooting

### "Insufficient on-chain credits"
- User needs to claim winnings to contract first
- Check database `won_balance` is sufficient
- Verify claim transaction succeeded

### "Contract balance too low"
- Owner needs to deposit more BNB to contract
- Check `getContractBalance()` view function

### "Daily/Weekly limit exceeded"
- Contract enforces these limits automatically
- Limits reset after 24 hours / 7 days
- User must wait for reset

## Migration Notes

### Old System → New System

**Before:**
- Backend controlled all withdrawals
- Edge function called `withdrawTo()` as owner
- Limits tracked in database only

**After:**
- Users control withdrawals from their wallet
- Backend only credits winnings to contract
- Limits enforced by smart contract

### Deployment Steps

1. Deploy new contract
2. Update settings with contract details
3. Deploy new edge functions
4. Update frontend with new modal
5. Test claim → withdraw flow
6. Monitor contract balance
