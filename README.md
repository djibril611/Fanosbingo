# Fanos Bingo

A real-time, multiplayer bingo game built as a Telegram Mini App with full on-chain integration on Binance Smart Chain (BSC). Players compete in live bingo rounds where the prize pool is distributed transparently through smart contracts.

---

## Table of Contents

- [Overview](#overview)
- [How It Works](#how-it-works)
- [Game Mechanics](#game-mechanics)
- [Blockchain Integration](#blockchain-integration)
- [Deposits](#deposits)
- [Withdrawals](#withdrawals)
- [Telegram Bot](#telegram-bot)
- [Admin Panel](#admin-panel)
- [Architecture](#architecture)
- [Vision](#vision)

---

## Overview

Fanos Bingo is a skill and speed-based competitive game - not gambling. Every round has deterministic, code-enforced rules. Winners are decided by who completes a valid bingo pattern first on their card. Prize distribution is handled by a BSC smart contract, ensuring full transparency and no custodial risk.

The game runs entirely inside Telegram as a Mini App, making it accessible to millions of users without any app installation.

---

## How It Works

### Player Journey

1. Open the Fanos Bingo Telegram Mini App
2. Connect a crypto wallet (MetaMask, Trust Wallet, or any WalletConnect-compatible wallet)
3. Deposit BNB to receive in-game credits (1 BNB = 100,000 credits by default)
4. Enter the lobby and pick a card number (1-99)
5. Wait for the round to start and play in real-time
6. If you complete a bingo pattern first, claim your win and receive the prize

---

## Game Mechanics

### Cards

Each player gets a standard 5x5 bingo card with numbers distributed across five columns:

| Column | Range  |
|--------|--------|
| B      | 1-15   |
| I      | 16-30  |
| N      | 31-45  |
| G      | 46-60  |
| O      | 61-75  |

The center cell (N column, row 3) is a free space.

### Winning Patterns

A player wins by completing any of the following:

- Any horizontal row (5 cells)
- Any vertical column (5 cells)
- Either diagonal (5 cells)
- Four corners

### Number Calling

Numbers are called automatically every 3.5 seconds by a scheduled backend function. Numbers range from 1 to 75 and are never repeated within the same round.

### Auto-Mark

When a called number matches a number on a player's card, that cell is automatically marked. Players do not need to manually mark cells.

### Claiming a Win

When a player completes a valid winning pattern, a 1-second claim window opens. The first valid claim within that window wins the round. This prevents race conditions and ensures fairness when multiple players complete patterns simultaneously.

### Staking

Each player stakes a fixed amount of credits to enter a round. The total staked amount forms the prize pool.

- Winner receives 75% of the prize pool
- 25% is retained as a platform fee
- If a player leaves before the round starts, their stake is fully refunded

---

## Blockchain Integration

Fanos Bingo uses Binance Smart Chain (BSC) for all financial operations. Two smart contracts power the system:

### Deposit Contract (`FanosBingoDeposit.sol`)

Handles incoming BNB deposits and converts them to in-game credits.

- Accepts BNB and records the depositing wallet and linked Telegram user ID
- Configurable conversion rate (owner-adjustable)
- Minimum deposit enforced on-chain
- Emits events for every deposit, withdrawal, and rate change so the backend can track them off-chain

### Withdrawal Contract

Handles outgoing payments from won balance to player wallets.

- Signature-based authentication ensures only legitimate withdrawals are processed
- Daily and weekly withdrawal limits per user
- Functions: `withdraw()`, `claimAndWithdraw()`, `claimWithSignature()`
- Tracks each user's remaining limits

---

## Deposits

### Crypto (BNB) Deposits

1. Connect wallet inside the app
2. Send BNB to the deposit contract address
3. Submit the transaction hash inside the app
4. The backend monitors BSC for the transaction and waits for 3 confirmations
5. Credits are added to your deposited balance automatically

### Bank Deposits (Optional)

An optional SMS-based deposit flow supports Ethiopian bank transfers:

1. User makes a bank transfer and the bank sends an SMS confirmation
2. The SMS is forwarded to the backend via the `receive-bank-sms` edge function
3. The system extracts the amount and reference number automatically
4. An admin verifies and approves the deposit

---

## Withdrawals

Players can withdraw their won balance back to their crypto wallet at any time.

1. Request a withdrawal from the app
2. The backend generates a signed authorization
3. The player submits the signed transaction to the withdrawal contract on BSC
4. BNB is sent directly to the player's wallet from the contract

Withdrawal limits apply per day and per week to protect the protocol.

---

## Telegram Bot

The Telegram bot handles notifications and commands:

- Notifies players when a game is starting, when they win, and when deposits or withdrawals are processed
- Accepts balance transfer commands (move credits between deposited and won balance)
- Sends formatted messages with inline action buttons

### Referral System

Each user gets a unique referral code. When a new user signs up using your code, both you and the new user receive a bonus. Referrals are capped at 20 per user to prevent abuse.

---

## Admin Panel

The admin panel is protected by multi-step authentication:

1. Access key
2. Time-based one-time password (TOTP / 2FA)

Admin capabilities:

- View all active games and player activity
- Force-finish a game if needed
- Manage bank deposit options
- Approve or reject manual deposit requests
- Manage BNB withdrawal requests
- Configure game settings (stake amount, commission rate, contract addresses, bot token, etc.)
- View financial reports through the accountant dashboard

---

## Architecture

```
Telegram Mini App (React + Vite)
        |
        | Supabase Realtime (live game updates)
        |
Supabase Edge Functions (Deno)
        |
        |--- PostgreSQL Database (game state, balances, users)
        |--- BSC Smart Contracts (deposits, withdrawals)
        |--- Telegram Bot API (notifications, commands)
        |--- Cron Jobs (auto number caller every 3.5s)
```

### Key Technologies

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite, TailwindCSS |
| Wallet | Wagmi v3, Viem v2, Reown (WalletConnect v3) |
| Backend | Supabase Edge Functions (Deno runtime) |
| Database | Supabase PostgreSQL with Row Level Security |
| Realtime | Supabase Realtime channels |
| Blockchain | Binance Smart Chain, Solidity 0.8.20 |
| Messaging | Telegram Bot API, Telegram Mini App SDK |

### Security

- Row Level Security (RLS) enforced on every database table
- Admin 2FA with TOTP
- Wallet address validation before crediting
- Blockchain confirmation threshold before deposits are accepted
- Signature-based authorization for withdrawals
- Referral abuse prevention with per-user caps

---

## Vision

Fanos Bingo is the foundation for a broader ecosystem of on-chain competitive mini-games.

The next major milestone is integrating autonomous AI agents that can participate as players. These agents will learn game patterns, compete against human players, and eventually enable fully agent-vs-agent matches. All outcomes will be recorded on-chain, creating provably fair, transparent competition between humans and AI.



