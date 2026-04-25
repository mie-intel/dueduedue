# Smart Contracts

Solidity contracts for DuelPic. Built with Foundry.

## Contracts

- **MockIDRX** — Testnet ERC-20, public mint
- **QuestionPool** — Question registry, AI-verified, daily limits
- **CasualPool** — Paid casual entry fee + royalty distribution
- **GameSession** — PvP wager escrow, commit-reveal, timeout resolution

## Setup

```bash
forge install
forge build
forge test
```

## Deploy

```bash
forge script script/Deploy.s.sol --rpc-url https://testnet-rpc.monad.xyz --broadcast
```
