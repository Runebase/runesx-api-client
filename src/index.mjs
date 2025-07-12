import { Worker } from 'worker_threads';

import { BigNumber } from 'bignumber.js';

import { setupSocket } from './socket.mjs';
import { postSwap } from './api.mjs';
import { config } from './config.mjs';
import { getPools, getPool } from './store/poolStore.mjs';
import { getCoins, getCoinByTicker } from './store/coinStore.mjs';
import { getWallets, getWalletByTicker } from './store/walletStore.mjs';
import { getUserShares } from './store/userSharesStore.mjs';
import { waitForStores } from './waitForStores.mjs';

async function startBot() {
  console.log('Starting RunesX API Key Example...');

  // Validate API key
  if (!config.apiKey) {
    console.error('Error: API_KEY is not set in .env file');
    process.exit(1);
  }

  // Setup Socket.IO
  const { socket } = setupSocket();

  // Example: Estimate and execute a swap: 0.1 xRUNES to XLM using a worker
  try {
    console.log('Waiting for initial pool, coin, wallet, and user shares data...');
    const { pools, coins, wallets, userShares } = await waitForStores(socket);

    if (!pools.length) {
      throw new Error('No pools available for swap estimation');
    }
    if (!coins.length) {
      throw new Error('No coins available for swap estimation');
    }
    if (!wallets.length) {
      throw new Error('No wallets available for swap estimation');
    }
    if (!userShares.length) {
      console.warn('No user shares available; proceeding with swap');
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

    // Validate sufficient balance using walletStore
    const wallet = getWalletByTicker(inputCoin.ticker);
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

  // Example: Monitor wallet balances
  const monitorWallets = () => {
    setInterval(() => {
      const wallets = getWallets();
      if (wallets.length > 0) {
        console.log('Monitoring wallets:', wallets.map(wallet => ({
          ticker: wallet.ticker,
          available: wallet.available,
          locked: wallet.locked,
          updatedAt: wallet.updatedAt,
        })));
      } else {
        console.log('No wallets available or not yet initialized');
      }
    }, 10000); // Check every 10 seconds
  };

  // Example: Monitor user shares
  const monitorUserShares = () => {
    setInterval(() => {
      const userShares = getUserShares();
      if (userShares.length > 0) {
        console.log('Monitoring user shares:', userShares.map(share => ({
          poolId: share.poolId,
          shares: share.shares,
          updatedAt: share.updatedAt,
        })));
      } else {
        console.log('No user shares available or not yet initialized');
      }
    }, 10000); // Check every 10 seconds
  };

  // Start monitoring a specific pool, wallets, and user shares
  monitorPool(1); // Using pool ID 1 from previous logs
  monitorWallets();
  monitorUserShares();

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

  // Example: List all wallets when initial data is received
  socket.on('wallets_updated', ({ isInitial }) => {
    if (isInitial) {
      const wallets = getWallets();
      console.log('All wallets:', wallets.map((wallet) => ({
        id: wallet.id,
        ticker: wallet.ticker,
        available: wallet.available,
        locked: wallet.locked,
        updatedAt: wallet.updatedAt,
      })));
    }
  });

  // Example: List all user shares when initial data is received
  socket.on('user_shares_updated', ({ isInitial }) => {
    if (isInitial) {
      const userShares = getUserShares();
      console.log('All user shares:', userShares.map((share) => ({
        poolId: share.poolId,
        shares: share.shares,
        updatedAt: share.updatedAt,
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