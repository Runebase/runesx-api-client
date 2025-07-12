# RunesX API Key Example

This repository provides a minimal example for interacting with the RunesX platform using API keys. It demonstrates how to:
- Authenticate with a RunesX API key to connect to the Socket.IO server and listen for real-time events such as chat messages (`yard_message`), pool updates (`pools_updated`), coin updates (`coins_updated`), and wallet updates (`wallets_updated`).
- Manage coin data in `coinStore` using WebSocket `coins_updated` events, with buffering to ensure updates are applied only after initial coin data is received.
- Manage liquidity pool data in `poolStore` using WebSocket `pools_updated` events, with buffering to ensure updates are applied only after initial pool data is received.
- Manage wallet data in `walletStore` using WebSocket `wallets_updated` events, with buffering to ensure updates are applied only after initial wallet data is received.
- Use HTTP requests to fetch wallet data via the `/wallets` endpoint (requires `read` scope).
- Execute a swap via the `/swap` endpoint (requires `swap` scope).
- Monitor pool and wallet states periodically to track reserves and balances.

This is intended as a starting point for developers building bots or automated scripts for the RunesX platform.

## Prerequisites

- Node.js (v18 or higher)
- A RunesX account with an API key (with `read`, `swap`, and optionally `chat` scopes)
- RunesX backend running at `http://localhost:3010` (or your deployed URL)

## Setup

1. **Clone the repository**:
```bash
git clone https://github.com/runebase/runesx-api-key-example.git
cd runesx-api-key-example
```

2. **Install dependencies**:
```bash
npm install
```

3. **Set up environment variables**:
```bash
API_KEY=your_runesx_api_key
BASE_URL=https://www.runesx.xyz/api
SOCKET_URL=https://www.runesx.xyz/api
```

4. **Run the bot**:
```bash
npm start
```