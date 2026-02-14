# Smart Contract Deposit System Setup Guide

## Overview

The Fanos Bingo game now supports cryptocurrency deposits via a Binance Smart Chain (BSC) smart contract. Users deposit BNB to the contract, and their account is automatically credited with game credits.

## Features

- BNB deposits on BSC (mainnet or testnet)
- Automatic balance crediting after confirmation
- Transaction tracking and history
- Admin management interface
- No wallet connection required for gameplay after deposit
- Transparent on-chain verification

## Quick Start

### 1. Deploy Smart Contract

1. Navigate to `/contracts/FanosBingoDeposit.sol`
2. Use [Remix IDE](https://remix.ethereum.org/) to deploy
3. Deploy with these constructor parameters:
   - `_conversionRate`: `100000000000000000000000` (1 BNB = 100,000 credits)
   - `_minimumDeposit`: `1000000000000000` (0.001 BNB minimum)
4. Save the deployed contract address

### 2. Configure Settings

1. Access the admin panel at `/admin`
2. Navigate to "Crypto Deposits" tab
3. Enter the following settings:
   - **Contract Address**: Your deployed contract address
   - **Chain ID**: `56` for BSC Mainnet, `97` for BSC Testnet
   - **Conversion Rate**: `100000` (1 BNB = 100,000 credits)
   - **Minimum Deposit**: `0.001` (in BNB)
4. Click "Save Settings"

### 3. Verify Contract on BscScan

1. Go to [BscScan](https://bscscan.com/) (or testnet version)
2. Find your contract using the address
3. Click "Contract" → "Verify and Publish"
4. Enter:
   - Compiler version: `0.8.20`
   - Optimization: Enabled
   - Paste contract source code
5. Verify

### 4. Test Deposit Flow

1. Send a test deposit (at least 0.001 BNB) to contract
2. In transaction, call `deposit("YOUR_TELEGRAM_USER_ID")`
3. Wait for confirmations (3 blocks)
4. Admin clicks "Check for New Deposits" in admin panel
5. User's balance should be automatically credited

## Architecture

### Smart Contract (`FanosBingoDeposit.sol`)

**Key Functions:**
- `deposit(string userId)` - Accept BNB and emit deposit event
- `withdraw(uint256 amount)` - Owner withdraws collected funds
- `updateConversionRate(uint256 newRate)` - Update conversion rate
- `calculateGameCredits(uint256 bnbAmount)` - Preview conversion

**Events:**
- `Deposit` - Emitted on each deposit with all details
- `Withdrawal` - Emitted when owner withdraws funds

### Database Schema

**Table: `deposit_transactions`**
- `transaction_hash` - Unique blockchain transaction ID
- `wallet_address` - Depositor's wallet
- `telegram_user_id` - User's Telegram ID
- `amount_bnb` - BNB deposited
- `amount_credits` - Game credits calculated
- `status` - pending → confirmed → processed
- `confirmations` - Number of block confirmations
- `block_number` - Block where transaction occurred

### Edge Functions

**`monitor-deposits`**
- Polls blockchain for deposit events
- Updates transaction statuses
- Tracks confirmations
- Can be called manually or via cron

**`submit-deposit`**
- Allows users to submit their transaction hash
- Verifies transaction on blockchain
- Validates user ID matches
- Credits account after confirmations

### User Flow

1. User attempts to join game without sufficient balance
2. Insufficient balance modal appears
3. User clicks deposit button, sees deposit modal
4. Modal shows contract address and instructions
5. User sends BNB to contract with their Telegram user ID
6. User can optionally submit transaction hash for tracking
7. After 3 confirmations, balance is automatically credited
8. User can now play without wallet connection

### Admin Flow

1. Admin accesses "Crypto Deposits" tab
2. Views deposit statistics and recent transactions
3. Can manually trigger blockchain monitoring
4. Monitors pending deposits awaiting confirmations
5. Can withdraw collected funds from contract

## Configuration Settings

### Conversion Rate

The conversion rate determines how many game credits users receive per BNB.

**Format:** Stored as integer (e.g., 100000 means 1 BNB = 100,000 credits)

**Examples:**
- `100000` → 1 BNB = 100,000 credits
- `50000` → 1 BNB = 50,000 credits
- `1000000` → 1 BNB = 1,000,000 credits

**In Smart Contract:** Rate is scaled by 1e18 for precision
- Set to `100000 * 1e18` in constructor

### Minimum Deposit

Prevents spam and gas-inefficient small deposits.

**Format:** In BNB (e.g., 0.001)

**Smart Contract Format:** In wei
- `0.001 BNB` = `1000000000000000` wei
- `0.01 BNB` = `10000000000000000` wei

### Required Confirmations

Number of block confirmations before crediting balance.

**Default:** 3 confirmations

**Considerations:**
- More confirmations = more security
- Fewer confirmations = faster credits
- BSC has ~3 second block time

## Monitoring and Maintenance

### Automatic Monitoring

Set up a cron job to regularly check for deposits:

```bash
# Every 5 minutes
*/5 * * * * curl -X POST "YOUR_SUPABASE_URL/functions/v1/monitor-deposits" -H "Authorization: Bearer YOUR_ANON_KEY"
```

### Manual Monitoring

Admin can click "Check for New Deposits" button anytime.

### Transaction States

1. **Pending** - Transaction seen but awaiting confirmations
2. **Confirmed** - Has required confirmations, ready to process
3. **Processed** - Balance credited to user
4. **Failed** - Transaction failed or invalid

### Troubleshooting

**Transaction not detected:**
- Ensure user sent to correct contract address
- Verify user included their Telegram user ID
- Check transaction succeeded on blockchain
- Click "Check for New Deposits" in admin panel

**Balance not credited:**
- Check transaction has 3+ confirmations
- Verify status is "processed" in admin panel
- Check telegram_user_id matches in transaction

**Incorrect amount credited:**
- Verify conversion rate setting
- Check amount_credits in deposit_transactions table
- Conversion happens at deposit time, not processing time

## Security Considerations

### Smart Contract

- Owner has withdrawal privileges
- Only owner can update rates
- Users should verify contract address
- Contract is immutable once deployed

### Backend

- Edge functions use service role for database writes
- RLS policies prevent unauthorized access
- Transaction hashes are verified on blockchain
- Duplicate transactions are rejected

### Best Practices

1. Start on testnet before mainnet
2. Verify contract code on BscScan
3. Test full deposit flow with small amounts
4. Monitor deposits regularly
5. Keep contract owner key secure
6. Consider multi-sig for production

## Network Configuration

### BSC Mainnet

- **Chain ID:** 56
- **RPC:** https://bsc-dataseed.binance.org/
- **Explorer:** https://bscscan.com/
- **Currency:** BNB

### BSC Testnet

- **Chain ID:** 97
- **RPC:** https://data-seed-prebsc-1-s1.binance.org:8545/
- **Explorer:** https://testnet.bscscan.com/
- **Faucet:** https://testnet.bnbchain.org/faucet-smart

## User Instructions

Users should be provided with:

1. Contract address (verified on BscScan)
2. Their Telegram user ID
3. Minimum deposit amount
4. Current conversion rate
5. Expected confirmation time (~9 seconds for 3 blocks)

## Support

### Common Issues

**Q: How long until balance is credited?**
A: Approximately 9-15 seconds after transaction (3 block confirmations).

**Q: Can I deposit from exchange?**
A: Yes, but ensure you can include the userId parameter in the transaction.

**Q: What if I sent BNB without user ID?**
A: Contact admin with transaction hash for manual processing.

**Q: Can I get a refund?**
A: Deposits are final. Credits remain in your account until used.

## Future Enhancements

Possible improvements:

1. Support for other tokens (USDT, BUSD)
2. Multi-chain support (Ethereum, Polygon)
3. Automatic monitoring via webhook
4. Referral bonuses for crypto deposits
5. Volume-based conversion rates
6. Deposit milestones and rewards

## Environment Variables

The following environment variables are configured automatically:

- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Service role for backend

No additional configuration needed for deposit system.

## Contract ABI

The contract ABI is available at deployment time. Key methods:

```json
[
  "function deposit(string userId) payable",
  "function withdraw(uint256 amount)",
  "function withdrawAll()",
  "function updateConversionRate(uint256 newRate)",
  "function updateMinimumDeposit(uint256 newMinimum)",
  "function calculateGameCredits(uint256 bnbAmount) view returns (uint256)",
  "function getBalance() view returns (uint256)",
  "event Deposit(address indexed depositor, uint256 amount, string userId, uint256 gameCredits, uint256 timestamp)"
]
```

## Testing Checklist

Before going live:

- [ ] Deploy contract to testnet
- [ ] Verify contract on testnet explorer
- [ ] Configure settings in admin panel
- [ ] Test deposit with small amount
- [ ] Verify transaction appears in admin panel
- [ ] Confirm balance is credited after confirmations
- [ ] Test user can play game with credited balance
- [ ] Test admin can withdraw funds
- [ ] Test conversion rate updates
- [ ] Deploy to mainnet
- [ ] Repeat verification on mainnet

## Conclusion

The smart contract deposit system provides a secure, transparent way for users to fund their Fanos Bingo accounts using cryptocurrency. With automatic balance crediting and comprehensive admin tools, it streamlines the deposit process while maintaining security and auditability.
