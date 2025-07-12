// src/index.mjs
import { Worker } from 'worker_threads';

import { BigNumber } from 'bignumber.js';

import { setupSocket } from './socket.mjs';
import { postSwap, depositLiquidity, withdrawLiquidity } from './api.mjs';
import { config } from './config.mjs';
import { getPools, getPool } from './store/poolStore.mjs';
import { getCoins, getCoinByTicker } from './store/coinStore.mjs';
import { getWallets, getWalletByTicker } from './store/walletStore.mjs';
import { getUserShares } from './store/userSharesStore.mjs';
import { waitForStores } from './waitForStores.mjs';
import { estimateLiquidityFrontend, checkRunesLiquidityFrontend, calculateShareAmounts } from './utils/liquidityUtils.mjs';

async function startBot() {
  console.log('Starting RunesX API Key Example...');

  // Validate API key
  if (!config.apiKey) {
    console.error('Error: API_KEY is not set in .env file');
    process.exit(1);
  }

  // Setup Socket.IO
  const { socket } = setupSocket();

  console.log('Waiting for initial pool, coin, wallet, and user shares data...');
  const { pools, coins, wallets, userShares } = await waitForStores(socket);

  // Example: Estimate and execute a swap: 0.1 xRUNES to XLM using a worker
  try {
    if (!pools.length) {
      throw new Error('No pools available');
    }
    if (!coins.length) {
      throw new Error('No coins available');
    }
    if (!wallets.length) {
      throw new Error('No wallets available');
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

  try {
    // Example: Deposit and Withdraw Liquidity
    console.log('Starting liquidity example...');
    const coinA = getCoinByTicker('RUNES');
    const coinB = getCoinByTicker('XLM');
    if (!coinA || !coinB) {
      throw new Error('Required coins (RUNES or XLM) not found in coinStore');
    }

    // Step 1: Check RUNES compliance
    const { isCompliant, warnings } = checkRunesLiquidityFrontend(coinA, coinB, pools, coins);
    if (!isCompliant) {
      console.error('Cannot deposit liquidity due to RUNES compliance issues:', warnings);
      return;
    }

    // Step 2: Estimate liquidity amounts
    const amountA = '1'; // 1 RUNES
    let depositParams;
    try {
      const estimate = estimateLiquidityFrontend({
        coinA,
        coinB,
        amountA,
        amountB: null,
        pools,
        coins,
      });
      console.log('Liquidity estimate:', {
        amountA: estimate.amountA,
        amountB: estimate.amountB,
        coinA: estimate.coinA.ticker,
        coinB: estimate.coinB.ticker,
        isPoolEmpty: estimate.isPoolEmpty,
        flipped: estimate.flipped,
      });

      // Adjust for flipped pairs
      depositParams = {
        coinA: { ticker: estimate.coinA.ticker },
        coinB: { ticker: estimate.coinB.ticker },
        amountA: estimate.amountA,
        amountB: estimate.amountB,
      };
    } catch (error) {
      console.error('Error estimating liquidity:', error.message);
      return;
    }

    // Step 3: Validate wallet balances
    const walletA = getWalletByTicker(coinA.ticker);
    const walletB = getWalletByTicker(coinB.ticker);
    if (!walletA || new BigNumber(walletA.available).lt(depositParams.amountA)) {
      console.error(`Insufficient balance for ${coinA.ticker}: ${walletA?.available || 0} available`);
      return;
    }
    if (!walletB || new BigNumber(walletB.available).lt(depositParams.amountB)) {
      console.error(`Insufficient balance for ${coinB.ticker}: ${walletB?.available || 0} available`);
      return;
    }

    // Step 4: Deposit liquidity
    console.log(`Depositing liquidity: ${depositParams.amountA} ${depositParams.coinA.ticker} and ${depositParams.amountB} ${depositParams.coinB.ticker}`);
    try {
      const depositResult = await depositLiquidity(depositParams);
      console.log('Liquidity deposited successfully:', {
        coinA: depositResult.coinA.ticker,
        coinB: depositResult.coinB.ticker,
        amountA: depositResult.amountA,
        amountB: depositResult.amountB,
        shares: depositResult.shares,
        uid: depositResult.uid,
      });
    } catch (error) {
      console.error('Error depositing liquidity:', error.message);
      return;
    }

    // Step 5: Wait for user shares update (simulated delay for WebSocket update)
    console.log('Waiting 5 seconds for user shares to update...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Step 6: Calculate share amounts and withdraw
    const updatedUserShares = getUserShares();
    const calculatedShares = calculateShareAmounts({ userShares: updatedUserShares, pools });
    const share = calculatedShares.find(
      s => s.coinA.ticker === depositParams.coinA.ticker && s.coinB.ticker === depositParams.coinB.ticker
    );

    if (!share) {
      console.error('No shares found for the deposited pool');
      return;
    }

    const sharesToWithdraw = new BigNumber(share.shares).div(2).integerValue(BigNumber.ROUND_DOWN).toString(); // Withdraw 50%
    console.log(`Withdrawing 50% of shares (${sharesToWithdraw}) from pool ${share.poolId}`);

    try {
      const withdrawResult = await withdrawLiquidity({
        coinA: { ticker: share.coinA.ticker },
        coinB: { ticker: share.coinB.ticker },
        shares: sharesToWithdraw,
      });
      console.log('Liquidity withdrawn successfully:', {
        coinA: withdrawResult.coinA.ticker,
        coinB: withdrawResult.coinB.ticker,
        amountA: withdrawResult.amountA,
        amountB: withdrawResult.amountB,
        shares: withdrawResult.shares,
        uid: withdrawResult.uid,
      });
    } catch (error) {
      console.error('Error withdrawing liquidity:', error.message);
      return;
    }
  } catch (error) {
    console.error('Error in bot execution:', error.message);
  }

  // Existing monitoring functions
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
    }, 10000);
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
    }, 10000);
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
    }, 10000);
  };

  // Start monitoring a specific pool, wallets, and user shares
  monitorPool(1); // Using pool with ID 1
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