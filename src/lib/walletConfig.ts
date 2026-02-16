import { createAppKit } from '@reown/appkit/react'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { bsc } from 'viem/chains'
import { QueryClient } from '@tanstack/react-query'

// 1. Get projectId from environment or use default
const projectId = import.meta.env.VITE_REOWN_PROJECT_ID || 'YOUR_PROJECT_ID'

// 2. Set up Wagmi adapter with BSC chains
export const wagmiAdapter = new WagmiAdapter({
  networks: [bsc],
  projectId,
  ssr: false
})

// 3. Create QueryClient
export const queryClient = new QueryClient()

// 4. Create AppKit instance
export const modal = createAppKit({
  adapters: [wagmiAdapter],
  networks: [bsc],
  projectId,
  features: {
    analytics: false,
  },
  metadata: {
    name: 'Fanos Bingo',
    description: 'Multiplayer Bingo Game with BNB Payments',
    url: import.meta.env.VITE_APP_URL || 'https://fanosbingo.com',
    icons: ['https://fanosbingo.com/icon.png']
  }
})

export const config = wagmiAdapter.wagmiConfig

// Contract ABI for FanosBingoDeposit
export const DEPOSIT_CONTRACT_ABI = [
  {
    "inputs": [{"internalType": "address", "name": "user", "type": "address"}, {"internalType": "uint256", "name": "amount", "type": "uint256"}],
    "name": "addWinCredits",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "amountBNB", "type": "uint256"}],
    "name": "withdraw",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "address", "name": "to", "type": "address"}, {"internalType": "uint256", "name": "amountBNB", "type": "uint256"}],
    "name": "withdrawTo",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "address", "name": "", "type": "address"}],
    "name": "credits",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getContractBalance",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "minWithdraw",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "maxDaily",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "maxWeekly",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  }
] as const
