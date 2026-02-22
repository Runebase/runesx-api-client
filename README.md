# RunesX API Client

A Node.js client for interacting with the RunesX platform API and WebSocket, enabling developers to build bots or scripts for real-time trading, liquidity management, withdrawals, deposits, and data monitoring.

## Features

- **WebSocket Integration**: Real-time events for pools, coins, chains, wallets, user shares, operations, deposits, withdrawals, candlesticks, volume, and chat
- **Full REST API**: Complete HTTP API coverage for all public and private endpoints
- **Store Management**: Automatic real-time state management for pools, coins, chains, wallets, and user shares with buffering for out-of-order updates
- **Swap Estimation**: Client-side swap estimation using DFS or BFS pathfinding algorithms
- **Liquidity Management**: Estimate, deposit, and withdraw liquidity with RUNES compliance checking
- **Withdrawal Flow**: Full multi-step withdrawal verification (PIN, email, 2FA)
- **Price Utilities**: Calculate token prices in RUNES and USD
- **Event System**: Register callbacks for any WebSocket event

## Installation

```bash
npm install @runesx/api-client
```

## Quick Start

```javascript
import { createRunesXClient } from '@runesx/api-client';

const client = createRunesXClient({
  apiKey: 'your-api-key',
  apiUrl: 'https://www.runesx.xyz/api',
  socketUrl: 'https://www.runesx.xyz/api',
});

async function main() {
  const { pools, coins, chains, wallets, userShares } = await client.initialize();
  console.log(`Connected: ${pools.length} pools, ${coins.length} coins, ${wallets.length} wallets`);

  // Listen for real-time events
  client.on('operationUpdate', (operation) => {
    console.log('New operation:', operation);
  });

  // Get prices
  const prices = await client.getPrices();
  console.log('Prices:', prices);
}

main().catch(console.error);
```

## Configuration

```javascript
const client = createRunesXClient({
  apiKey: 'your-api-key',           // Required. Your RunesX API key
  apiUrl: 'https://www.runesx.xyz/api',  // Optional. Default: http://localhost:3010
  socketUrl: 'https://www.runesx.xyz/api', // Optional. Default: http://localhost:3010
});
```

You can also set these via environment variables:
- `API_KEY` - Your API key
- `API_URL` - API base URL
- `SOCKET_URL` - WebSocket URL

## API Key Scopes

When generating an API key, you can assign specific scopes:

| Scope | Description |
|-------|-------------|
| `read` | Read-only access to user data (wallets, shares, operations, transactions) |
| `swap` | Execute token swaps |
| `liquidity_deposit` | Deposit liquidity to pools |
| `liquidity_withdraw` | Withdraw liquidity from pools |
| `wallet_withdraw` | Withdraw to external addresses |
| `chat` | Access yard/chat features |

---

## Store Data (Real-time via WebSocket)

After `initialize()`, the client maintains real-time stores updated via WebSocket. These are always up-to-date.

### Pools

```javascript
const pools = client.getPools();           // All pools
const pool = client.getPool(poolId);       // Pool by ID
```

Pool object:
```javascript
{
  id, reserveA, reserveB, totalShares, activeLiquidityProviders,
  runesCompliant, lpFeeRate, treasuryFeeRate,
  coinA: { id, ticker, dp, projectName },
  coinB: { id, ticker, dp, projectName },
  liquidityShares: [...],
  updatedAt
}
```

### Coins

```javascript
const coins = client.getCoins();                // All coins
const coin = client.getCoinByTicker('RUNES');    // Coin by ticker
```

### Chains

```javascript
const chains = client.getChains();                   // All chains
const chain = client.getChainByName('RuneBase');     // Chain by name
```

### Wallets

```javascript
const wallets = client.getWallets();                  // All wallets
const wallet = client.getWalletByTicker('RUNES');    // Wallet by ticker
// wallet.available, wallet.locked
```

### User Shares

```javascript
const shares = client.getUserShares();                    // All shares
const share = client.getUserShareByPoolId(poolId);       // Share by pool
// share.shares, share.poolId
```

---

## REST API Methods

### Public Endpoints (No Auth Required)

#### System Status

```javascript
const status = await client.getStatus();
// { apiVersion, apiStatus, ratatoskrVersion, ratatoskrStatus }
```

#### Coins (via API)

```javascript
const coins = await client.getCoinsApi();      // All coins
const coin = await client.getCoinApi('RUNES'); // Single coin with chain details
```

#### Pools (via API)

```javascript
const pools = await client.getPoolsApi();                      // All pools
const pool = await client.getPoolByPair('RUNES', 'USDC');     // Specific pool
const shares = await client.getPoolLiquidityShares(poolId);   // Pool's liquidity shares
```

#### Prices

```javascript
const prices = await client.getPrices();
// { prices: [{ ticker, projectName, dp, priceInRunes, priceInUSD }], runesPriceUSD, timestamp }

const price = await client.getPrice('RUNES');
// { ticker, projectName, dp, priceInRunes, priceInUSD, runesPriceUSD, timestamp }
```

#### Candlesticks

```javascript
const candles = await client.getCandlesticks(poolId, '1h', fromTimestamp, toTimestamp);
// [{ time, open, high, low, close, volume }]
```

Valid timeframes: `1m`, `5m`, `15m`, `1h`, `4h`, `12h`, `1d`, `1w`, `1M`

#### Volume

```javascript
const total = await client.getVolumeTotal();
const poolVol = await client.getVolumePool(poolId);
```

#### Buckets

```javascript
const buckets = await client.getBucketsPools();
```

#### Operations

```javascript
// Recent operations (public)
const recent = await client.getRecentOperations({ operationType: 'swap', limit: 20 });

// Pool operations
const poolOps = await client.getPoolOperations(poolId, { operationType: 'swap' });
```

Valid operation types: `swap`, `liquidityDeposit`, `liquidityWithdrawal`

#### Yard Messages

```javascript
const messages = await client.getYardMessages({ limit: 50 });
const older = await client.getYardMessages({ before: '2024-01-01T00:00:00Z', limit: 50 });
```

### Private Endpoints (Auth Required)

#### Wallets

```javascript
const wallets = await client.getWalletsApi();  // Scope: read
```

#### Swap (Scope: swap)

```javascript
const result = await client.postSwap({
  amountIn: '1.0',
  path: [{ from: 'RUNES', to: 'USDC' }],
  minAmountOut: '0.009',
  idempotencyKey: 'optional-unique-key',  // Auto-generated if not provided
});
```

#### Liquidity (Scope: liquidity_deposit / liquidity_withdraw)

```javascript
// Deposit
const deposit = await client.depositLiquidity({
  tickerA: 'RUNES',
  tickerB: 'USDC',
  amountA: '100',
  amountB: '1.5',
  minShares: '1000',  // Optional slippage protection
  idempotencyKey: 'optional-key',
});

// Withdraw
const withdraw = await client.withdrawLiquidity({
  tickerA: 'RUNES',
  tickerB: 'USDC',
  shares: '5000',
  minAmountA: '90',   // Optional slippage protection
  minAmountB: '1.3',  // Optional slippage protection
  idempotencyKey: 'optional-key',
});

// Get user's liquidity shares via API
const shares = await client.getLiquidityShares();
```

#### Deposits

```javascript
// Get deposit address for a chain
const { address, memo } = await client.getDepositAddress('RuneBase');

// Get all deposit addresses
const addresses = await client.getAllDepositAddresses();
// [{ chainName, address, memo }]
```

#### Withdrawals (Scope: wallet_withdraw)

The withdrawal process is multi-step:

```javascript
// 1. Initiate withdrawal
const initResult = await client.initiateWithdraw({
  ticker: 'RUNES',
  chain: 'RuneBase',
  address: 'RxYz...',
  amount: '100',
  memo: null,  // Optional, for chains that require it
  idempotencyKey: 'optional-key',
});
const { pendingWithdrawalId } = initResult.data;

// 2. Verify PIN (shown as image via socket event 'withdrawal_pin_generated')
await client.verifyWithdrawPin({ pendingWithdrawalId, pinCode: '123456' });

// 3. Send email PIN
await client.sendWithdrawEmailPin({ pendingWithdrawalId });

// 4. Verify email PIN
await client.verifyWithdrawEmailPin({ pendingWithdrawalId, emailPinCode: '654321' });

// 5. Verify 2FA (if enabled)
await client.verifyWithdraw2FA({ pendingWithdrawalId, twoFactorToken: '123456' });

// Check pending withdrawals
const pending = await client.getPendingWithdrawals();

// Cancel a pending withdrawal
await client.cancelWithdrawal({ pendingWithdrawalId });
```

#### Transaction History (Scope: read)

```javascript
const history = await client.getTransactionHistory({
  page: 1,
  limit: 20,
  type: 'deposit',    // Optional: 'deposit' or 'withdrawal'
  status: 'confirmed', // Optional
});
// { success, data: { transactions: [...], total, page, pages } }
```

#### User Operations (Scope: read)

```javascript
const ops = await client.getUserOperations({
  operationType: 'swap',  // Optional
  poolId: '1',            // Optional
  startTime: '2024-01-01T00:00:00Z', // Optional
  endTime: '2024-12-31T23:59:59Z',   // Optional
  page: 1,
  limit: 50,
});
```

#### Yard Moderation (Scope: chat)

```javascript
// Delete a message (via REST API)
await client.deleteYardMessage(messageId);
```

---

## WebSocket Events

### Event Listener System

Use `client.on()` and `client.off()` to register callbacks for any WebSocket event:

```javascript
// Register a callback
const handler = (data) => console.log('Pool update:', data);
client.on('pools_updated', handler);

// Remove a specific callback
client.off('pools_updated', handler);

// Remove all callbacks for an event
client.off('pools_updated');
```

### Available Events

#### Public Events (received after joining public room)

| Event | Data | Description |
|-------|------|-------------|
| `pools_updated` | `{ pools, isInitial }` | Pool data updated |
| `coins_updated` | `{ coins, isInitial }` | Coin data updated |
| `chains_updated` | `{ chains, isInitial }` | Chain data updated |
| `buckets_updated` | `{ type, buckets }` | Pool bucket data |
| `operations_updated` | `[operations]` | Initial recent operations |
| `recent_yard_messages` | `{ messages, lastReadAt }` | Initial chat messages |
| `status_updated` | `{ apiVersion, apiStatus, ratatoskrVersion, ratatoskrStatus }` | System status |
| `volumeUpdate` | `{ type, poolId, timestamp, volume }` | Volume update |
| `operationUpdate` | `operation` | New operation executed |
| `yard_message` | `{ id, text, userId, username, role, timestamp }` | New chat message |
| `message_deleted` | `{ messageId }` | Chat message deleted |
| `candlestick_updated` | `data` | Candlestick update (requires joining candlestick room) |

#### Private Events (received after joining private room)

| Event | Data | Description |
|-------|------|-------------|
| `wallets_updated` | `{ wallets, isInitial }` | Wallet balances updated |
| `user_shares_updated` | `{ userShares, isInitial }` | Liquidity shares updated |
| `deposit_address_generated` | `{ requestId, chainName, address, memo }` | Deposit address ready |
| `deposit_processed` | `{ amount, coin, chain, confirmations, status, credited }` | Deposit confirmation update |
| `withdrawal_initiated` | `data` | Withdrawal process started |
| `withdrawal_pin_generated` | `{ pinImage, ticker, amount, pendingWithdrawalId, expiresAt, dp, fee, memoRequired }` | PIN image ready |
| `withdrawal_updated` | `{ pendingWithdrawalId, expiresAt, stage }` | Withdrawal stage changed |
| `withdrawal_queued` | `{ pendingWithdrawalId, ticker }` | Withdrawal queued for processing |
| `withdrawal_processed` | `{ amount, coin, chain, confirmations, status, credited }` | Withdrawal confirmation update |
| `withdrawal_canceled` | `{ ticker, amount }` | Withdrawal canceled |
| `withdrawal_expired` | `{ pendingWithdrawalId, ticker, amount }` | Withdrawal expired |
| `banned` | `{ reason, bannedUntil }` | User banned from yard chat |
| `yard_read_marked` | `{ lastReadAt }` | Yard marked as read |
| `session_expired` | `{ message }` | Session expired, reconnect needed |

#### Connection Events

| Event | Data | Description |
|-------|------|-------------|
| `connect` | `null` | Connected to server |
| `disconnect` | `reason` | Disconnected from server |
| `connect_error` | `error` | Connection error |
| `reconnect_attempt` | `attempt` | Reconnection attempt number |
| `reconnect` | `null` | Successfully reconnected |
| `error` | `error` | Socket error |

### Socket Convenience Methods

#### Candlestick Subscriptions

```javascript
// Subscribe to candlestick updates for a pool
client.joinCandlesticks(poolId, '1h');

client.on('candlestick_updated', (data) => {
  console.log('Candlestick:', data);
});

// Unsubscribe
client.leaveCandlesticks(poolId, '1h');
```

#### Chat (The Yard)

```javascript
// Send a message (Scope: chat)
client.sendYardMessage('Hello from my bot!');

// Listen for messages
client.on('yard_message', (msg) => {
  console.log(`[${msg.username}]: ${msg.text}`);
});

// Delete a message (moderator/admin only)
client.deleteMessage(messageId);

// Mark yard as read
client.markYardRead();
```

### Raw Socket Access

For advanced use cases, access the underlying Socket.IO instance:

```javascript
const socket = client.getSocket();
socket.emit('custom_event', data);
```

---

## Client-Side Utilities

### Swap Estimation

Estimate swap outcomes locally without making API calls:

```javascript
const inputCoin = client.getCoinByTicker('RUNES');
const outputCoin = client.getCoinByTicker('USDC');

const estimate = await client.estimateSwap(inputCoin, outputCoin, '100', 6, 'dfs');
console.log({
  outputAmount: estimate.output.amount,
  priceImpact: `${estimate.slippage.priceImpact.toFixed(2)}%`,
  path: estimate.path,
  inputPriceUSD: estimate.input.priceUSD,
  outputPriceUSD: estimate.output.priceUSD,
});
```

### Liquidity Estimation

```javascript
const coinA = client.getCoinByTicker('RUNES');
const coinB = client.getCoinByTicker('USDC');

// Estimate how much coinB is needed for a given coinA amount
const estimate = client.estimateLiquidityFrontend({
  coinA, coinB,
  amountA: '100',
  amountB: null,
  pools: client.getPools(),
  coins: client.getCoins(),
});
console.log(`Need ${estimate.amountB} ${estimate.coinB.ticker} for ${estimate.amountA} ${estimate.coinA.ticker}`);
```

### Deposit Share Estimation

```javascript
const pool = client.getPool(poolId);
const shareEstimate = client.estimateDepositShares({
  pool,
  amountA: '100',
  amountB: '1.5',
  slippagePercent: 2,
});
console.log(`Estimated shares: ${shareEstimate.estimatedShares}, min: ${shareEstimate.minShares}`);
```

### RUNES Compliance Check

```javascript
const { isCompliant, warnings } = client.checkRunesLiquidityFrontend(coinA, coinB);
if (!isCompliant) {
  console.warn('Pool not RUNES-compliant:', warnings);
}
```

### Share Amount Calculation

```javascript
const shareAmounts = client.calculateShareAmounts();
shareAmounts.forEach(share => {
  console.log(`${share.pair}: ${share.amountA} / ${share.amountB} (${share.shares} shares)`);
});
```

### Price Utilities

```javascript
const runesPrice = client.utils.getRunesPriceUSD();
const tokenPrice = client.utils.getTokenPriceUSD('USDC');
const priceInRunes = client.utils.getTokenPriceInRunes('USDC');
const usdValue = client.utils.calculateUSDValue('100', 'RUNES', 2);

// Get prices for multiple tokens
const prices = client.utils.getPrices(['RUNES', 'USDC', 'XLM']);
```

---

## Complete Example: Trading Bot

```javascript
import { createRunesXClient } from '@runesx/api-client';
import { BigNumber } from 'bignumber.js';

const client = createRunesXClient({
  apiKey: process.env.API_KEY,
  apiUrl: 'https://www.runesx.xyz/api',
  socketUrl: 'https://www.runesx.xyz/api',
});

async function main() {
  await client.initialize();
  console.log('Bot started');

  // Monitor for new operations
  client.on('operationUpdate', (op) => {
    if (op.operationType === 'swap') {
      console.log(`Swap: ${op.amountIn} ${op.inputCoin?.ticker} -> ${op.amountOut} ${op.outputCoin?.ticker}`);
    }
  });

  // Monitor wallet changes
  client.on('wallets_updated', ({ isInitial }) => {
    if (!isInitial) {
      const wallets = client.getWallets();
      wallets.forEach(w => {
        console.log(`${w.ticker}: ${w.available} available, ${w.locked} locked`);
      });
    }
  });

  // Monitor deposit confirmations
  client.on('deposit_processed', (data) => {
    if (data.status === 'confirmed' && data.credited) {
      console.log(`Deposit confirmed: ${data.amount} ${data.coin.ticker}`);
    }
  });

  // Example: execute a swap when price is favorable
  const checkAndSwap = async () => {
    const inputCoin = client.getCoinByTicker('RUNES');
    const outputCoin = client.getCoinByTicker('USDC');
    if (!inputCoin || !outputCoin) { return; }

    const estimate = await client.estimateSwap(inputCoin, outputCoin, '10');
    const priceImpact = estimate.slippage.priceImpact;

    if (priceImpact < 1) { // Less than 1% price impact
      const minOut = new BigNumber(estimate.output.amount)
        .times(0.99)
        .toFixed(outputCoin.dp, BigNumber.ROUND_DOWN);

      const result = await client.postSwap({
        amountIn: '10',
        path: estimate.path,
        minAmountOut: minOut,
      });
      console.log('Swap result:', result);
    }
  };

  setInterval(checkAndSwap, 60000);
}

main().catch(console.error);

process.on('SIGINT', () => {
  client.disconnect();
  process.exit(0);
});
```

---

## API Reference

### Client Creation & Lifecycle

| Method | Description |
|--------|-------------|
| `createRunesXClient(options)` | Create a client instance |
| `initialize()` | Connect WebSocket, wait for initial data. Returns `{ pools, coins, chains, wallets, userShares }` |
| `disconnect()` | Disconnect WebSocket |
| `getSocket()` | Get raw Socket.IO instance |

### Store Accessors (Real-time Data)

| Method | Returns |
|--------|---------|
| `getPools()` | All pools array |
| `getPool(poolId)` | Pool by ID |
| `getCoins()` | All coins array |
| `getCoinByTicker(ticker)` | Coin by ticker |
| `getChains()` | All chains array |
| `getChainByName(name)` | Chain by name |
| `getWallets()` | All wallets array |
| `getWalletByTicker(ticker)` | Wallet by ticker |
| `getUserShares()` | All user shares array |
| `getUserShareByPoolId(poolId)` | User share by pool ID |

### Event System

| Method | Description |
|--------|-------------|
| `on(event, callback)` | Register event callback |
| `off(event, callback?)` | Remove callback (or all for event) |

### Socket Emit Methods

| Method | Description |
|--------|-------------|
| `joinCandlesticks(poolId, timeframe)` | Subscribe to candlestick updates |
| `leaveCandlesticks(poolId, timeframe)` | Unsubscribe from candlestick updates |
| `sendYardMessage(text)` | Send a chat message (scope: chat) |
| `deleteMessage(messageId)` | Delete a chat message (mod/admin) |
| `markYardRead()` | Mark yard as read |

### Public REST API

| Method | Description |
|--------|-------------|
| `getStatus()` | System status |
| `getCoinsApi()` | All coins via API |
| `getCoinApi(ticker)` | Single coin via API |
| `getPoolsApi()` | All pools via API |
| `getPoolByPair(tickerA, tickerB)` | Pool by ticker pair |
| `getPoolLiquidityShares(poolId)` | Pool liquidity shares |
| `getPrices()` | All token prices |
| `getPrice(ticker)` | Single token price |
| `getCandlesticks(poolId, timeframe, from, to)` | OHLCV candlestick data |
| `getVolumeTotal()` | Total platform volume |
| `getVolumePool(poolId)` | Pool volume |
| `getBucketsPools()` | Pool bucket data |
| `getRecentOperations({ operationType?, limit? })` | Recent operations |
| `getPoolOperations(poolId, { operationType?, limit? })` | Pool operations |
| `getYardMessages({ before?, limit? })` | Chat messages |

### Private REST API

| Method | Scope | Description |
|--------|-------|-------------|
| `getWalletsApi()` | read | Wallet balances |
| `getLiquidityShares()` | read | User's liquidity shares |
| `postSwap({ amountIn, path, minAmountOut, idempotencyKey? })` | swap | Execute swap |
| `depositLiquidity({ tickerA, tickerB, amountA, amountB, minShares?, idempotencyKey? })` | liquidity_deposit | Deposit liquidity |
| `withdrawLiquidity({ tickerA, tickerB, shares, minAmountA?, minAmountB?, idempotencyKey? })` | liquidity_withdraw | Withdraw liquidity |
| `getDepositAddress(chainName)` | read | Get deposit address |
| `getAllDepositAddresses()` | read | Get all deposit addresses |
| `initiateWithdraw({ ticker, chain, address, amount, memo?, idempotencyKey? })` | wallet_withdraw | Start withdrawal |
| `verifyWithdrawPin({ pendingWithdrawalId, pinCode })` | wallet_withdraw | Verify PIN |
| `sendWithdrawEmailPin({ pendingWithdrawalId })` | wallet_withdraw | Send email PIN |
| `verifyWithdrawEmailPin({ pendingWithdrawalId, emailPinCode })` | wallet_withdraw | Verify email PIN |
| `verifyWithdraw2FA({ pendingWithdrawalId, twoFactorToken })` | wallet_withdraw | Verify 2FA |
| `getPendingWithdrawals()` | wallet_withdraw | Get pending withdrawals |
| `cancelWithdrawal({ pendingWithdrawalId })` | wallet_withdraw | Cancel withdrawal |
| `getTransactionHistory({ page?, limit?, type?, status? })` | read | Transaction history |
| `getUserOperations({ operationType?, poolId?, startTime?, endTime?, page?, limit? })` | read | User operations |
| `deleteYardMessage(messageId)` | chat | Delete chat message |

### Client-Side Utilities

| Method | Description |
|--------|-------------|
| `estimateSwap(inputCoin, outputCoin, amountIn, maxHops?, algorithm?)` | Estimate swap output locally |
| `estimateLiquidityFrontend({ coinA, coinB, amountA, amountB, pools, coins })` | Estimate liquidity amounts |
| `estimateDepositShares({ pool, amountA, amountB, slippagePercent? })` | Estimate deposit shares |
| `checkRunesLiquidityFrontend(coinA, coinB)` | Check RUNES compliance |
| `calculateShareAmounts()` | Calculate share token amounts |
| `monitorPool(poolId, interval?)` | Log pool state periodically |
| `utils.getRunesPriceUSD()` | RUNES price in USD |
| `utils.getTokenPriceInRunes(ticker)` | Token price in RUNES |
| `utils.getTokenPriceUSD(ticker)` | Token price in USD |
| `utils.getPrices(tickers)` | Multiple token prices |
| `utils.calculateUSDValue(amount, ticker, decimals?)` | USD value of token amount |

## License

MIT
