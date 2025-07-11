# RunesX API Key Example

This repository provides a minimal example for interacting with RunesX API endpoints and Socket.IO using API keys. It demonstrates how to:
- Authenticate with a RunesX API key to connect to the Socket.IO server and listen for events like chat messages (`yard_message`) and pool updates (`pools_updated`).
- Track the state of liquidity pools using WebSocket `pools_updated` events, with buffering to make sure updates are applied only after initial pool data is received.
- Use HTTP requests to fetch wallet data via the `/wallets` endpoint (requires `read` scope).
- Execute a swap via the `/swap` endpoint (requires `swap` scope).

This is intended as a starting point for developers building bots or automated scripts for the RunesX platform.

## Prerequisites

- Node.js (v18 or higher)
- A RunesX account with an API key (with `read`, `swap`, and optionally `chat` scopes)
- RunesX backend running at `http://localhost:3010` (or your deployed URL)

## Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/yourusername/runesx-api-key-example.git
   cd runesx-api-key-example