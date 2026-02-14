# Fanos Bingo - Crypto Wallet Integration

## Overview
Your bingo game has been successfully transformed into **Fanos Bingo** with BNB cryptocurrency payment support using Reown wallet connector.

## What Changed

### 1. Branding
- App name changed from "Bingo" to "Fanos Bingo"
- Title updated in index.html and across the application

### 2. Crypto Wallet Integration
- Integrated Reown (formerly WalletConnect) for BNB wallet connections
- Added support for Binance Smart Chain (BSC) mainnet and testnet
- Users must connect their crypto wallet before selecting cards

### 3. Database Updates
- Added `wallet_address` field to store connected wallet addresses
- Added `wallet_connected_at` timestamp to track first connection
- Added `bnb_balance` field to track user's BNB balance
- All wallet data is securely stored and linked to Telegram users

### 4. User Flow
1. User opens app via Telegram
2. User registers with the bot
3. **NEW:** User must connect BNB wallet before playing
4. User selects card number
5. User plays the game

## Setup Required

### Get Reown Project ID

To enable wallet connection, you need a Reown (WalletConnect) Project ID:

1. Go to [Reown Cloud](https://cloud.reown.com/)
2. Sign up or log in
3. Create a new project
4. Copy your Project ID
5. Add it to your `.env` file:

```env
VITE_REOWN_PROJECT_ID=your_project_id_here
```

### Current Configuration

The app is configured to support:
- **Mainnet:** Binance Smart Chain (BSC)
- **Testnet:** BSC Testnet

You can modify supported networks in `src/lib/walletConfig.ts`

## Features Implemented

### WalletConnect Component
- Located at `src/components/WalletConnect.tsx`
- Displays wallet connection button
- Shows connected wallet address
- Saves wallet data to Supabase database
- Allows disconnection

### Wallet Requirement Enforcement
- Card selection is disabled until wallet is connected
- Clear warning message prompts users to connect wallet
- Toast notifications for connection status
- Optimistic UI updates for smooth experience

### Security
- Wallet addresses stored securely in database
- Each user can only have one wallet connected
- Wallet data linked to Telegram user ID
- Row Level Security (RLS) maintained

## Testing

### On Testnet
1. Connect a BSC testnet wallet (MetaMask, Trust Wallet, etc.)
2. Get testnet BNB from a faucet
3. Test the connection and card selection

### On Mainnet
1. Connect real BSC wallet with BNB
2. Ensure users understand they're using real funds
3. Test all flows thoroughly before launch

## Payment Flow (Next Steps)

Currently, the wallet connection is complete. Next steps for payment integration:

1. **Set Game Entry Fee in BNB**
   - Update game creation to specify BNB amount
   - Replace ETB balance system with BNB checks

2. **Smart Contract Integration**
   - Deploy a game contract on BSC
   - Handle stake deposits
   - Distribute winnings automatically

3. **BNB Balance Checking**
   - Check user's BNB balance before allowing entry
   - Verify sufficient funds in wallet

4. **Transaction Signing**
   - Request user signature for game entry
   - Process BNB transfer to game contract

## Files Modified

- `src/App.tsx` - Added Wagmi provider
- `src/components/Lobby.tsx` - Added wallet connection requirement
- `src/components/WalletConnect.tsx` - New component for wallet UI
- `src/lib/walletConfig.ts` - Reown configuration
- `index.html` - Updated title to Fanos Bingo
- Database schema - Added wallet fields

## Environment Variables

Add to your `.env` file:

```env
VITE_REOWN_PROJECT_ID=your_project_id_here
```

## Support

For issues or questions:
- Check Reown documentation: https://docs.reown.com/
- Verify BSC network status: https://bscscan.com/
- Test on testnet first before mainnet deployment
