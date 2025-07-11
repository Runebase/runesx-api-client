import { Worker } from 'worker_threads';

import { BigNumber } from 'bignumber.js';

import { setupSocket } from './socket.mjs';
import { getWallets, postSwap } from './api.mjs';
import { config } from './config.mjs';
import { getPools, getPool, poolStore } from './store/poolStore.mjs';
import { getCoins, getCoinByTicker, coinStore } from './store/coinStore.mjs';

async function startBot() {
  console.log('Starting RunesX API Key Example...');

  // Validate API key
  if (!config.apiKey) {
    console.error('Error: API_KEY is not set in .env file');
    process.exit(1);
  }

  // Setup Socket.IO
  const { socket } = setupSocket();

  // Fetch wallet data
  try {
    const wallets = await getWallets();
    console.log('Wallet data:', wallets);
  } catch (error) {
    console.error('Error fetching wallets:', error.message);
  }

  // Function to wait for poolStore to be populated
  const waitForPools = () => {
    return new Promise((resolve, reject) => {
      if (poolStore.isInitialReceived) {
        const pools = getPools();
        console.log('Initial pool data already received:', pools.length, 'pools', pools);
        resolve(pools);
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for initial pool data'));
      }, 30000); // 30-second timeout

      socket.on('pools_updated', ({ isInitial, pools }) => {
        console.log('Received pools_updated:', { isInitial, pools });
        if (isInitial) {
          const pools = getPools();
          console.log('Initial pool data received:', pools.length, 'pools', pools);
          clearTimeout(timeout);
          resolve(pools);
        }
      });

      socket.on('connect_error', (err) => {
        console.error('Socket connect error:', err.message);
        clearTimeout(timeout);
        reject(new Error('Socket connection failed'));
      });

      socket.on('disconnect', (reason) => {
        console.error('Socket disconnected:', reason);
        clearTimeout(timeout);
        reject(new Error('Socket disconnected before receiving initial pool data'));
      });
    });
  };

  // Function to wait for coinStore to be populated
  const waitForCoins = () => {
    return new Promise((resolve, reject) => {
      if (coinStore.isInitialReceived) {
        const coins = getCoins();
        console.log('Initial coin data already received:', coins.length, 'coins', coins);
        resolve(coins);
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for initial coin data'));
      }, 30000); // 30-second timeout

      socket.on('coins_updated', ({ isInitial, coins }) => {
        console.log('Received coins_updated:', { isInitial, coins });
        if (isInitial) {
          const coins = getCoins();
          console.log('Initial coin data received:', coins.length, 'coins', coins);
          clearTimeout(timeout);
          resolve(coins);
        }
      });

      socket.on('connect_error', (err) => {
        console.error('Socket connect error:', err.message);
        clearTimeout(timeout);
        reject(new Error('Socket connection failed'));
      });

      socket.on('disconnect', (reason) => {
        console.error('Socket disconnected:', reason);
        clearTimeout(timeout);
        reject(new Error('Socket disconnected before receiving initial coin data'));
      });
    });
  };

  // Example: Estimate and execute a swap: 0.1 xRUNES to XLM using a worker
  try {
    console.log('Waiting for initial pool and coin data...');
    const [pools, coins] = await Promise.all([waitForPools(), waitForCoins()]);

    if (!pools.length) {
      throw new Error('No pools available for swap estimation');
    }
    if (!coins.length) {
      throw new Error('No coins available for swap estimation');
    }

    const inputCoin = getCoinByTicker('xRUNES');
    const outputCoin = getCoinByTicker('XLM');
    if (!inputCoin || !outputCoin) {
      throw new Error('Required coins (xRUNES or XLM) not found in coinStore');
    }

    const amountIn = '0.1'; // 0.1 xRUNES
    const maxHops = 6;
    const algorithm = 'dfs'; // Use DFS for exhaustive pathfinding
    const slippageTolerance = '1'; // 1% slippage tolerance

    // Estimate the swap using a worker
    console.log('Estimating swap from xRUNES to XLM using worker...');
    const swapEstimate = await new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./workers/swapWorker.mjs', import.meta.url));

      worker.on('message', (message) => {
        if (message.error) {
          console.error('Worker error message:', message.error);
          reject(new Error(message.error));
        } else {
          console.log('Worker swap estimate:', message.result);
          resolve(message.result);
        }
        worker.terminate();
      });

      worker.on('error', (error) => {
        console.error('Worker error:', error);
        reject(new Error('Worker failed to process swap estimation'));
        worker.terminate();
      });

      worker.on('exit', (code) => {
        if (code !== 0) {
          console.error('Worker exited with code:', code);
          reject(new Error(`Worker exited with code ${code}`));
        }
      });

      // Send data to worker
      worker.postMessage({ inputCoin, outputCoin, amountIn, pools, coins, maxHops, algorithm });
    });

    console.log('Swap estimate:', {
      input: swapEstimate.input,
      output: swapEstimate.output,
      slippage: {
        priceImpact: swapEstimate.slippage.priceImpact.toFixed(2) + '%',
        intermediateAmounts: swapEstimate.slippage.intermediateAmounts,
      },
      path: swapEstimate.path,
      algorithm: swapEstimate.algorithm,
      afterSwapPrices: swapEstimate.afterSwapPrices,
    });

    // Calculate minAmountOut based on slippage tolerance
    const amountOutBN = new BigNumber(swapEstimate.output.amount);
    const toleranceBN = new BigNumber(slippageTolerance).div(100);
    const minAmountOutBN = amountOutBN.times(new BigNumber(1).minus(toleranceBN));
    const minAmountOut = minAmountOutBN.toFixed(outputCoin.dp, BigNumber.ROUND_DOWN);

    const wallets = await getWallets();
    // Validate sufficient balance
    const wallet = wallets.data.find((w) => w.ticker === inputCoin.ticker);
    if (!wallet || new BigNumber(wallet.available).lt(amountIn)) {
      throw new Error(`Insufficient balance for ${inputCoin.ticker}: ${wallet?.available || 0} available`);
    }

    // Execute the swap
    console.log(`Executing swap: ${amountIn} ${inputCoin.ticker} -> ${minAmountOut} ${outputCoin.ticker} (min)`);
    const swap = await postSwap({
      amountIn,
      path: swapEstimate.path,
      minAmountOut,
    });

    console.log('Swap executed successfully:', swap.data);
  } catch (error) {
    console.error('Error estimating or executing swap:', error.message);
  }

  // Example: Monitor pool reserves for a specific pool
  const monitorPool = (poolId) => {
    setInterval(() => {
      const pool = getPool(poolId);
      if (pool) {
        const pair = pool.coinA?.ticker && pool.coinB?.ticker
          ? `${pool.coinA.ticker}/${pool.coinB.ticker}`
          : 'UNKNOWN/UNKNOWN';
        console.log(`Monitoring pool ${poolId} (${pair}):`, {
          reserveA: pool.reserveA.toString(),
          reserveB: pool.reserveB.toString(),
          totalShares: pool.totalShares.toString(),
          activeLiquidityProviders: pool.activeLiquidityProviders,
          runesCompliant: pool.runesCompliant,
          lpFeeRate: pool.lpFeeRate.toString(),
          treasuryFeeRate: pool.treasuryFeeRate.toString(),
          coinA: pool.coinA || 'Missing',
          coinB: pool.coinB || 'Missing',
          liquidityShares: pool.liquidityShares,
          updatedAt: pool.updatedAt,
        });
      } else {
        console.log(`Pool ${poolId} not found or not yet initialized`);
      }
    }, 10000); // Check every 10 seconds
  };

  // Start monitoring a specific pool
  monitorPool(1); // Using pool ID 1 from previous logs

  // Example: List all pools when initial data is received
  socket.on('pools_updated', ({ isInitial }) => {
    if (isInitial) {
      const pools = getPools();
      console.log('All pools:', pools.map((pool) => ({
        id: pool.id,
        pair: pool.coinA?.ticker && pool.coinB?.ticker
          ? `${pool.coinA.ticker}/${pool.coinB.ticker}`
          : 'UNKNOWN/UNKNOWN',
        reserveA: pool.reserveA.toString(),
        reserveB: pool.reserveB.toString(),
        totalShares: pool.totalShares.toString(),
        activeLiquidityProviders: pool.activeLiquidityProviders,
        runesCompliant: pool.runesCompliant,
        lpFeeRate: pool.lpFeeRate.toString(),
        treasuryFeeRate: pool.treasuryFeeRate.toString(),
        coinA: pool.coinA || 'Missing',
        coinB: pool.coinB || 'Missing',
        liquidityShares: pool.liquidityShares,
        updatedAt: pool.updatedAt,
      })));
    }
  });

  // Example: List all coins when initial data is received
  socket.on('coins_updated', ({ isInitial }) => {
    if (isInitial) {
      const coins = getCoins();
      console.log('All coins:', coins.map((coin) => ({
        id: coin.id,
        ticker: coin.ticker,
        dp: coin.dp,
        projectName: coin.projectName,
        status: coin.status,
        runesComplianceRequirement: coin.runesComplianceRequirement,
        CoinChains: coin.CoinChains,
        updatedAt: coin.updatedAt,
      })));
    }
  });

  // Keep the bot running
  process.on('SIGINT', () => {
    console.log('Shutting down bot...');
    socket.disconnect();
    process.exit(0);
  });
}

startBot();