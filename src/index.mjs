// src/index.mjs
import { setupSocket } from './socket.mjs';
import { createApi } from './api.mjs';
import { createConfig } from './config.mjs';
import { getPools, getPool } from './store/poolStore.mjs';
import { getCoins, getCoinByTicker } from './store/coinStore.mjs';
import { getWallets as getWalletsStore, getWalletByTicker } from './store/walletStore.mjs';
import { getUserShares, getUserShareByPoolId } from './store/userSharesStore.mjs';
import { waitForStores } from './waitForStores.mjs';
import { estimateLiquidityFrontend, checkRunesLiquidityFrontend, calculateShareAmounts } from './utils/liquidityUtils.mjs';
import { estimateSwap } from './utils/swapUtils.mjs';
import { createPriceUtils } from './utils/priceUtils.mjs';

export function createRunesXClient(options = {}) {
  const config = createConfig(options);
  let socket = null;
  let initialized = false;
  const api = createApi(config);

  async function initialize() {
    if (!config.apiKey) {
      throw new Error('API_KEY is required');
    }
    socket = setupSocket(config).socket;
    const { pools, coins, wallets, userShares } = await waitForStores(socket);
    initialized = true;
    return { pools, coins, wallets, userShares };
  }

  function ensureInitialized() {
    if (!initialized) {
      throw new Error('Client not initialized. Call initialize() first.');
    }
  }

  return {
    initialize,
    getSocket: () => {
      ensureInitialized();
      return socket;
    },
    getPools,
    getPool,
    getCoins,
    getCoinByTicker,
    getWallets: getWalletsStore,
    getWalletByTicker,
    getUserShares,
    getUserShareByPoolId,
    postSwap: api.postSwap,
    depositLiquidity: api.depositLiquidity,
    withdrawLiquidity: api.withdrawLiquidity,
    getWalletsApi: api.getWallets,
    estimateSwap: (inputCoin, outputCoin, amountIn, maxHops = 6, algorithm = 'dfs') =>
      estimateSwap(inputCoin, outputCoin, amountIn, getPools(), getCoins(), maxHops, algorithm),
    estimateLiquidityFrontend,
    checkRunesLiquidityFrontend: (coinA, coinB) =>
      checkRunesLiquidityFrontend(coinA, coinB, getPools(), getCoins()),
    calculateShareAmounts: () => calculateShareAmounts({ userShares: getUserShares(), pools: getPools() }),
    monitorPool: (poolId, interval = 10000) => {
      setInterval(() => {
        const pool = getPool(poolId);
        if (pool) {
          console.log(`Monitoring pool ${poolId} (${pool.coinA.ticker}/${pool.coinB.ticker}):`, {
            reserveA: pool.reserveA.toString(),
            reserveB: pool.reserveB.toString(),
            totalShares: pool.totalShares.toString(),
            activeLiquidityProviders: pool.activeLiquidityProviders,
          });
        } else {
          console.log(`Pool ${poolId} not found or not yet initialized`);
        }
      }, interval);
    },
    utils: {
      ...createPriceUtils(),
    },
    disconnect: () => {
      if (socket) {
        socket.disconnect();
      }
    },
  };
}
