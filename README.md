# RunesX API Client

A Node.js client for interacting with the RunesX platform API and WebSocket, enabling developers to build bots or scripts for real-time trading, liquidity management, and data monitoring.

## Features
- **WebSocket Integration**: Connect to the RunesX Socket.IO server to listen for real-time events like `pools_updated`, `coins_updated`, `wallets_updated`, `user_shares_updated`, and chat messages (`yard_message`).
- **API Access**: Perform HTTP requests for wallet data, swaps, and liquidity operations.
- **Store Management**: Manage coin, pool, wallet, and user share data with built-in buffering for WebSocket updates.
- **Swap Estimation**: Estimate swap outcomes using DFS or BFS pathfinding algorithms.
- **Liquidity Management**: Estimate, deposit, and withdraw liquidity for trading pairs.
- **Monitoring**: Periodically monitor pool, wallet, and user share states.

## Installation
```bash
npm install @runesx/api-client
```

## Usage

1. Initialize the Client
Create and initialize the client with your API key and endpoint URLs. This connects to the WebSocket and fetches initial data for pools, coins, wallets, and user shares.

```javascript
import { createRunesXClient } from '@runesx/api-client';

const client = createRunesXClient({
  apiKey: 'your-api-key',
  apiUrl: 'https://www.runesx.xyz/api',
  socketUrl: 'https://www.runesx.xyz/api',
});

async function main() {
  try {
    const { pools, coins, wallets, userShares } = await client.initialize();
    console.log('Initialized with:', {
      poolCount: pools.length,
      coinCount: coins.length,
      walletCount: wallets.length,
      userShareCount: userShares.length,
    });
  } catch (error) {
    console.error('Initialization failed:', error.message);
  }
}

main();
```

2. Accessing Store Data
Retrieve data from the internal stores for pools, coins, wallets, and user shares.

### Get All Pools
```javascript
const pools = client.getPools();
console.log('Available pools:', pools.map(pool => ({
  id: pool.id,
  pair: `${pool.coinA.ticker}/${pool.coinB.ticker}`,
  reserveA: pool.reserveA,
  reserveB: pool.reserveB,
})));
```

### Get a Specific Pool
```javascript
const pool = client.getPool(1);
console.log('Pool 1:', pool ? {
  pair: `${pool.coinA.ticker}/${pool.coinB.ticker}`,
  reserveA: pool.reserveA,
  reserveB: pool.reserveB,
} : 'Pool not found');
```

### Get All Coins
```javascript
const coins = client.getCoins();
console.log('Available coins:', coins.map(coin => ({
  ticker: coin.ticker,
  projectName: coin.projectName,
  status: coin.status,
})));
```

### Get a Coin by Ticker
```javascript
const coin = client.getCoinByTicker('xRUNES');
console.log('xRUNES coin:', coin ? {
  ticker: coin.ticker,
  dp: coin.dp,
  projectName: coin.projectName,
} : 'Coin not found');
```

### Get All Wallets
```javascript
const wallets = client.getWallets();
console.log('Wallets:', wallets.map(wallet => ({
  ticker: wallet.ticker,
  available: wallet.available,
  locked: wallet.locked,
})));
```

### Get a Wallet by Ticker
```javascript
const wallet = client.getWalletByTicker('xRUNES');
console.log('xRUNES wallet:', wallet ? {
  ticker: wallet.ticker,
  available: wallet.available,
} : 'Wallet not found');
```

### Get All User Shares
```javascript
const userShares = client.getUserShares();
console.log('User shares:', userShares.map(share => ({
  poolId: share.poolId,
  shares: share.shares,
})));
```

### Get User Shares by Pool ID
```javascript
const share = client.getUserShareByPoolId(1);
console.log('Shares for pool 1:', share ? {
  poolId: share.poolId,
  shares: share.shares,
} : 'No shares found');
```

3. Estimating and Executing a Swap
Estimate and execute a swap between two tokens, such as 0.1 xRUNES to XLM, with slippage tolerance.

```javascript
import { BigNumber } from 'bignumber.js';

async function executeSwap() {
  try {
    const inputCoin = client.getCoinByTicker('xRUNES');
    const outputCoin = client.getCoinByTicker('XLM');
    if (!inputCoin || !outputCoin) {
      throw new Error('Required coins not found');
    }

    const amountIn = '0.1'; // 0.1 xRUNES
    const maxHops = 6;
    const algorithm = 'dfs';
    const slippageTolerance = '1'; // 1%

    // Estimate swap
    const swapEstimate = await client.estimateSwap(inputCoin, outputCoin, amountIn, maxHops, algorithm);
    console.log('Swap estimate:', {
      input: swapEstimate.input,
      output: swapEstimate.output,
      priceImpact: `${(swapEstimate.slippage.priceImpact * 100).toFixed(2)}%`,
      path: swapEstimate.path,
    });

    // Calculate minimum output with slippage
    const amountOutBN = new BigNumber(swapEstimate.output.amount);
    const minAmountOut = amountOutBN
      .times(new BigNumber(1).minus(new BigNumber(slippageTolerance).div(100)))
      .toFixed(outputCoin.dp, BigNumber.ROUND_DOWN);

    // Check wallet balance
    const wallet = client.getWalletByTicker(inputCoin.ticker);
    if (!wallet || new BigNumber(wallet.available).lt(amountIn)) {
      throw new Error(`Insufficient balance for ${inputCoin.ticker}: ${wallet?.available || 0}`);
    }

    // Execute swap
    const swap = await client.postSwap({
      amountIn,
      path: swapEstimate.path,
      minAmountOut,
    });
    console.log('Swap executed:', swap.data);
  } catch (error) {
    console.error('Swap failed:', error.message);
  }
}

executeSwap();
```

4. Managing Liquidity
Deposit and withdraw liquidity for a trading pair, such as RUNES/XLM.


```javascript
import { BigNumber } from 'bignumber.js';

async function manageLiquidity() {
  try {
    const coinA = client.getCoinByTicker('RUNES');
    const coinB = client.getCoinByTicker('XLM');
    if (!coinA || !coinB) {
      throw new Error('Required coins not found');
    }

    // Check RUNES compliance
    const { isCompliant, warnings } = client.checkRunesLiquidityFrontend(coinA, coinB);
    if (!isCompliant) {
      console.error('Cannot deposit liquidity:', warnings);
      return;
    }

    // Estimate liquidity amounts
    const amountA = '1'; // 1 RUNES
    const estimate = await client.estimateLiquidityFrontend({
      coinA,
      coinB,
      amountA,
      amountB: null,
      pools: client.getPools(),
      coins: client.getCoins(),
    });
    console.log('Liquidity estimate:', {
      amountA: estimate.amountA,
      amountB: estimate.amountB,
      pair: `${estimate.coinA.ticker}/${estimate.coinB.ticker}`,
      isPoolEmpty: estimate.isPoolEmpty,
      flipped: estimate.flipped,
    });

    // Validate wallet balances
    const walletA = client.getWalletByTicker(coinA.ticker);
    const walletB = client.getWalletByTicker(coinB.ticker);
    if (!walletA || new BigNumber(walletA.available).lt(estimate.amountA)) {
      throw new Error(`Insufficient balance for ${coinA.ticker}: ${walletA?.available || 0}`);
    }
    if (!walletB || new BigNumber(walletB.available).lt(estimate.amountB)) {
      throw new Error(`Insufficient balance for ${coinB.ticker}: ${walletB?.available || 0}`);
    }

    // Deposit liquidity
    const depositParams = {
      coinA: { ticker: estimate.coinA.ticker },
      coinB: { ticker: estimate.coinB.ticker },
      amountA: estimate.amountA,
      amountB: estimate.amountB,
    };
    const depositResult = await client.depositLiquidity(depositParams);
    console.log('Liquidity deposited:', {
      pair: `${depositResult.coinA.ticker}/${depositResult.coinB.ticker}`,
      amountA: depositResult.amountA,
      amountB: depositResult.amountB,
      shares: depositResult.shares,
      uid: depositResult.uid,
    });

    // Wait for user shares update
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Calculate and withdraw shares
    const updatedUserShares = client.getUserShares();
    const calculatedShares = client.calculateShareAmounts();
    const share = calculatedShares.find(
      s => s.coinA.ticker === depositParams.coinA.ticker && s.coinB.ticker === depositParams.coinB.ticker
    );

    if (!share) {
      throw new Error('No shares found for the deposited pool');
    }

    const sharesToWithdraw = new BigNumber(share.shares).div(2).integerValue(BigNumber.ROUND_DOWN).toString();
    const withdrawResult = await client.withdrawLiquidity({
      coinA: { ticker: share.coinA.ticker },
      coinB: { ticker: share.coinB.ticker },
      shares: sharesToWithdraw,
    });
    console.log('Liquidity withdrawn:', {
      pair: `${withdrawResult.coinA.ticker}/${withdrawResult.coinB.ticker}`,
      amountA: withdrawResult.amountA,
      amountB: withdrawResult.amountB,
      shares: withdrawResult.shares,
      uid: withdrawResult.uid,
    });
  } catch (error) {
    console.error('Liquidity operation failed:', error.message);
  }
}

manageLiquidity();
```

5. Monitoring Pools, Wallets, and User Shares
Set up periodic monitoring for pools, wallets, and user shares, and listen for WebSocket updates.

### Monitor a Specific Pool
```javascript
client.monitorPool(1, 10000); // Monitor pool ID 1 every 10 seconds
```

### Monitor Wallets
```javascript
function monitorWallets(interval = 10000) {
  setInterval(() => {
    const wallets = client.getWallets();
    console.log('Wallets:', wallets.length > 0
      ? wallets.map(wallet => ({
          ticker: wallet.ticker,
          available: wallet.available,
          locked: wallet.locked,
          updatedAt: wallet.updatedAt,
        }))
      : 'No wallets available');
  }, interval);
}

monitorWallets();
```

### Monitor User Shares
```javascript
function monitorUserShares(interval = 10000) {
  setInterval(() => {
    const userShares = client.getUserShares();
    console.log('User shares:', userShares.length > 0
      ? userShares.map(share => ({
          poolId: share.poolId,
          shares: share.shares,
          updatedAt: share.updatedAt,
        }))
      : 'No user shares available');
  }, interval);
}

monitorUserShares();
```

### Listen for WebSocket Updates
```javascript
const socket = client.getSocket();

socket.on('pools_updated', ({ isInitial }) => {
  if (isInitial) {
    const pools = client.getPools();
    console.log('Initial pools:', pools.map(pool => ({
      id: pool.id,
      pair: `${pool.coinA.ticker}/${pool.coinB.ticker}`,
      reserveA: pool.reserveA,
      reserveB: pool.reserveB,
      totalShares: pool.totalShares,
    })));
  }
});

socket.on('coins_updated', ({ isInitial }) => {
  if (isInitial) {
    const coins = client.getCoins();
    console.log('Initial coins:', coins.map(coin => ({
      ticker: coin.ticker,
      projectName: coin.projectName,
      status: coin.status,
    })));
  }
});

socket.on('wallets_updated', ({ isInitial }) => {
  if (isInitial) {
    const wallets = client.getWallets();
    console.log('Initial wallets:', wallets.map(wallet => ({
      ticker: wallet.ticker,
      available: wallet.available,
      locked: wallet.locked,
    })));
  }
});

socket.on('user_shares_updated', ({ isInitial }) => {
  if (isInitial) {
    const userShares = client.getUserShares();
    console.log('Initial user shares:', userShares.map(share => ({
      poolId: share.poolId,
      shares: share.shares,
    })));
  }
});
```

6. Cleaning Up
Disconnect the WebSocket when done to free resources.

```javascript
client.disconnect();
```

7. Handling Process Termination
Gracefully handle process termination to ensure cleanup.

```javascript
process.on('SIGINT', () => {
  console.log('Shutting down...');
  client.disconnect();
  process.exit(0);
});
```


## API Reference

### `createRunesXClient(options)`
Creates a client instance.
- **Parameters**:
  - `options.apiKey` (string): RunesX API key.
  - `options.apiUrl` (string, optional): API endpoint (default: `http://localhost:3010`).
  - `options.socketUrl` (string, optional): WebSocket endpoint (default: `http://localhost:3010`).
- **Returns**: Object with client methods.

### `initialize()`
Initializes the client, connecting to the WebSocket and fetching initial data.
- **Returns**: Promise resolving to `{ pools, coins, wallets, userShares }`.

### `getSocket()`
Returns the Socket.IO instance.
- **Returns**: Socket.IO client instance.

### `getPools()`
Returns all liquidity pools.
- **Returns**: Array of pool objects.

### `getPool(poolId)`
Returns a specific pool by ID.
- **Parameters**:
  - `poolId` (number): Pool ID.
- **Returns**: Pool object or undefined.

### `getCoins()`
Returns all coins.
- **Returns**: Array of coin objects.

### `getCoinByTicker(ticker)`
Returns a coin by its ticker.
- **Parameters**:
  - `ticker` (string): Coin ticker (e.g., `xRUNES`).
- **Returns**: Coin object or undefined.

### `getWallets()`
Returns all wallets.
- **Returns**: Array of wallet objects.

### `getWalletByTicker(ticker)`
Returns a wallet by coin ticker.
- **Parameters**:
  - `ticker` (string): Coin ticker.
- **Returns**: Wallet object or undefined.

### `getUserShares()`
Returns all user shares.
- **Returns**: Array of user share objects.

### `getUserShareByPoolId(poolId)`
Returns user shares for a specific pool.
- **Parameters**:
  - `poolId` (number): Pool ID.
- **Returns**: User share object or undefined.

### `postSwap(params)`
Executes a swap.
- **Parameters**:
  - `params.amountIn` (string): Input amount.
  - `params.path` (array): Array of `{ from, to }` objects defining the swap path.
  - `params.minAmountOut` (string): Minimum output amount.
- **Returns**: Promise resolving to swap response.

### `depositLiquidity(params)`
Deposits liquidity to a pool.
- **Parameters**:
  - `params.coinA` (object): `{ ticker }` of first coin.
  - `params.coinB` (object): `{ ticker }` of second coin.
  - `params.amountA` (string): Amount of first coin.
  - `params.amountB` (string): Amount of second coin.
- **Returns**: Promise resolving to deposit response.

### `withdrawLiquidity(params)`
Withdraws liquidity from a pool.
- **Parameters**:
  - `params.coinA` (object): `{ ticker }` of first coin.
  - `params.coinB` (object): `{ ticker }` of second coin.
  - `params.shares` (string): Number of shares to withdraw.
- **Returns**: Promise resolving to withdrawal response.

### `getWalletsApi()`
Fetches wallet data via the API.
- **Returns**: Promise resolving to wallet data.

### `estimateSwap(inputCoin, outputCoin, amountIn, maxHops, algorithm)`
Estimates a swap outcome.
- **Parameters**:
  - `inputCoin` (object): Input coin object.
  - `outputCoin` (object): Output coin object.
  - `amountIn` (string): Input amount.
  - `maxHops` (number, optional): Maximum hops (default: 6).
  - `algorithm` (string, optional): Pathfinding algorithm (`dfs` or `bfs`, default: `dfs`).
- **Returns**: Promise resolving to swap estimate.

### `estimateLiquidityFrontend(params)`
Estimates liquidity amounts for a pool.
- **Parameters**:
  - `params.coinA` (object): First coin.
  - `params.coinB` (object): Second coin.
  - `params.amountA` (string, optional): Amount of first coin.
  - `params.amountB` (string, optional): Amount of second coin.
  - `params.pools` (array): Array of pools.
  - `params.coins` (array): Array of coins.
- **Returns**: Liquidity estimate object.

### `checkRunesLiquidityFrontend(coinA, coinB)`
Checks RUNES compliance for a trading pair.
- **Parameters**:
  - `coinA` (object): First coin.
  - `coinB` (object): Second coin.
- **Returns**: `{ isCompliant, warnings }`.

### `calculateShareAmounts()`
Calculates amounts for user shares.
- **Returns**: Array of share objects with calculated amounts.

### `monitorPool(poolId, interval)`
Monitors a pool periodically.
- **Parameters**:
  - `poolId` (number): Pool ID.
  - `interval` (number, optional): Interval in milliseconds (default: 10000).

### `disconnect()`
Disconnects the WebSocket.