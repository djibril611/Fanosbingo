# Fanos Bingo Smart Contract

## Overview

This Solidity smart contract handles BNB deposits for the Fanos Bingo game. Users send BNB to the contract, and their game balance is credited automatically.

## Contract Details

- **Network**: BSC (Binance Smart Chain)
- **Solidity Version**: ^0.8.20
- **License**: MIT

## Features

- Accept BNB deposits with automatic game credit calculation
- Map wallet addresses to Telegram user IDs
- Owner-controlled withdrawal of collected funds
- Adjustable conversion rate and minimum deposit
- Event emission for easy off-chain tracking

## Deployment Instructions

### Prerequisites

1. Install [Remix IDE](https://remix.ethereum.org/) or use Hardhat/Foundry
2. MetaMask wallet with BNB on BSC
3. Get BNB for gas fees (testnet or mainnet)

### Using Remix IDE (Recommended for beginners)

1. Go to [Remix IDE](https://remix.ethereum.org/)
2. Create a new file: `FanosBingoDeposit.sol`
3. Paste the contract code
4. Compile with Solidity 0.8.20+
5. Deploy with parameters:
   - `_conversionRate`: e.g., `100000000000000000000000` (1 BNB = 100,000 credits)
   - `_minimumDeposit`: e.g., `1000000000000000` (0.001 BNB minimum)

### Network Configuration

**BSC Testnet:**
- RPC: https://data-seed-prebsc-1-s1.binance.org:8545/
- Chain ID: 97
- Explorer: https://testnet.bscscan.com/
- Faucet: https://testnet.bnbchain.org/faucet-smart

**BSC Mainnet:**
- RPC: https://bsc-dataseed.binance.org/
- Chain ID: 56
- Explorer: https://bscscan.com/

## Conversion Rate Examples

The conversion rate is scaled by 1e18. Examples:

- `100000 * 1e18` = 1 BNB gives 100,000 game credits
- `50000 * 1e18` = 1 BNB gives 50,000 game credits
- `1000000 * 1e18` = 1 BNB gives 1,000,000 game credits

## Minimum Deposit Examples

- `0.001 BNB` = `1000000000000000` wei
- `0.01 BNB` = `10000000000000000` wei
- `0.1 BNB` = `100000000000000000` wei

## After Deployment

1. **Verify Contract** on BscScan:
   - Go to BscScan
   - Find your contract
   - Click "Verify and Publish"
   - Enter compiler version and optimization settings

2. **Update Environment Variables**:
   ```env
   VITE_DEPOSIT_CONTRACT_ADDRESS=0x...
   VITE_CONVERSION_RATE=100000
   VITE_MINIMUM_DEPOSIT=0.001
   ```

3. **Setup Backend Monitoring**:
   - Deploy `monitor-deposits` edge function
   - Configure webhook or polling interval

## Contract Methods

### Public Methods

- `deposit(string userId)` - Deposit BNB and credit user account
- `calculateGameCredits(uint256 bnbAmount)` - Preview game credits for BNB amount
- `getUserId(address wallet)` - Get user ID linked to wallet
- `getBalance()` - Get contract's BNB balance
- `conversionRate()` - Current conversion rate
- `minimumDeposit()` - Current minimum deposit

### Owner-Only Methods

- `withdraw(uint256 amount)` - Withdraw specific amount
- `withdrawAll()` - Withdraw all contract balance
- `updateConversionRate(uint256 newRate)` - Update conversion rate
- `updateMinimumDeposit(uint256 newMinimum)` - Update minimum deposit
- `transferOwnership(address newOwner)` - Transfer contract ownership

## Events

- `Deposit(address depositor, uint256 amount, string userId, uint256 gameCredits, uint256 timestamp)`
- `Withdrawal(address owner, uint256 amount, uint256 timestamp)`
- `ConversionRateUpdated(uint256 oldRate, uint256 newRate, uint256 timestamp)`
- `MinimumDepositUpdated(uint256 oldMinimum, uint256 newMinimum, uint256 timestamp)`

## Security Considerations

- Contract owner has withdrawal privileges
- Users should verify contract address before depositing
- All deposits are final and non-refundable from contract
- Monitor events for deposit tracking
- Consider multi-sig wallet for production owner

## Testing

Test on BSC Testnet before mainnet deployment:
1. Deploy contract to testnet
2. Make test deposits
3. Verify events are emitted correctly
4. Test withdrawal functionality
5. Verify backend processes deposits correctly

## Support

For issues or questions, contact the development team.
