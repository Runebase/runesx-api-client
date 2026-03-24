// src/index.mjs
import { setupSocket, setupPublicSocket } from './socket.mjs';
import { createApi } from './api.mjs';
import { createConfig } from './config.mjs';
import { getPools, getPool } from './store/poolStore.mjs';
import { getCoins, getCoinByTicker } from './store/coinStore.mjs';
import { getChains, getChainByName } from './store/chainStore.mjs';
import { getWallets as getWalletsStore, getWalletByTicker } from './store/walletStore.mjs';
import { getUserShares, getUserShareByPoolId } from './store/userSharesStore.mjs';
import { getAllOrderBooks, getOrderBook, getOrderBookPairs, getUserOrders } from './store/orderbookStore.mjs';
import { getMarkets, getMarketByCoinKey, getMarketByCoins } from './store/marketStore.mjs';
import { getClobFees } from './store/exchangeConfigStore.mjs';
import { waitForStores, waitForSelectiveStores } from './waitForStores.mjs';
import { estimateLiquidityFrontend, checkRunesLiquidityFrontend, calculateShareAmounts, estimateDepositShares } from './utils/liquidityUtils.mjs';
import { estimateSwap } from './utils/swapUtils.mjs';
import { createPriceUtils } from './utils/priceUtils.mjs';

export function createRunesXClient(options = {}) {
  const config = createConfig(options);
  let socketHandler = null;
  let initialized = false;
  const api = createApi(config);

  async function initialize() {
    if (!config.apiKey) {
      throw new Error('API_KEY is required');
    }
    socketHandler = setupSocket(config);
    const { pools, coins, chains, wallets, userShares, orderbooks } = await waitForStores(socketHandler.socket);
    initialized = true;
    return { pools, coins, chains, wallets, userShares, orderbooks };
  }

  async function initializePublic({ stores = ['pools', 'coins'] } = {}) {
    socketHandler = setupPublicSocket(config, stores);
    const storeData = await waitForSelectiveStores(socketHandler.socket, stores);
    initialized = true;
    return storeData;
  }

  function ensureInitialized() {
    if (!initialized) {
      throw new Error('Client not initialized. Call initialize() first.');
    }
  }

  return {
    initialize,
    initializePublic,

    requestStores: (additionalStores) => {
      ensureInitialized();
      socketHandler.requestStores(additionalStores);
      return waitForSelectiveStores(socketHandler.socket, additionalStores);
    },

    // Raw socket access
    getSocket: () => {
      ensureInitialized();
      return socketHandler.socket;
    },

    // ---- Store accessors (real-time data from WebSocket) ----
    getPools,
    getPool,
    getCoins,
    getCoinByTicker,
    getChains,
    getChainByName,
    getWallets: getWalletsStore,
    getWalletByTicker,
    getUserShares,
    getUserShareByPoolId,
    getAllOrderBooks,
    getOrderBook,
    getOrderBookPairs,
    getUserOrders,
    getMarkets,
    getMarketByCoins,

    // ---- Event callbacks ----
    on: (event, callback) => {
      ensureInitialized();
      socketHandler.on(event, callback);
    },
    off: (event, callback) => {
      ensureInitialized();
      socketHandler.off(event, callback);
    },

    // ---- Socket emit convenience methods ----
    joinCandlesticks: (pair, timeframe) => {
      ensureInitialized();
      socketHandler.joinCandlesticks(pair, timeframe);
    },
    leaveCandlesticks: (pair, timeframe) => {
      ensureInitialized();
      socketHandler.leaveCandlesticks(pair, timeframe);
    },
    sendYardMessage: (text) => {
      ensureInitialized();
      socketHandler.sendYardMessage(text);
    },
    deleteMessage: (messageId) => {
      ensureInitialized();
      socketHandler.deleteMessage(messageId);
    },
    markYardRead: () => {
      ensureInitialized();
      socketHandler.markYardRead();
    },

    // ---- Trading API (auth required, scope: swap) ----
    postSwap: api.postSwap,

    // ---- Liquidity API (auth required, scope: liquidity_deposit/liquidity_withdraw) ----
    depositLiquidity: api.depositLiquidity,
    withdrawLiquidity: api.withdrawLiquidity,
    getLiquidityShares: api.getLiquidityShares,

    // ---- Wallet API (auth required, scope: read) ----
    getWalletsApi: api.getWallets,

    // ---- Deposit API (auth required) ----
    getDepositAddress: api.getDepositAddress,
    getAllDepositAddresses: api.getAllDepositAddresses,

    // ---- Withdrawal API (auth required, scope: wallet_withdraw) ----
    initiateWithdraw: api.initiateWithdraw,
    verifyWithdrawPin: api.verifyWithdrawPin,
    sendWithdrawEmailPin: api.sendWithdrawEmailPin,
    verifyWithdrawEmailPin: api.verifyWithdrawEmailPin,
    verifyWithdraw2FA: api.verifyWithdraw2FA,
    getPendingWithdrawals: api.getPendingWithdrawals,
    cancelWithdrawal: api.cancelWithdrawal,

    // ---- Transaction history (auth required, scope: read) ----
    getTransactionHistory: api.getTransactionHistory,

    // ---- Operations API (public + auth) ----
    getRecentOperations: api.getRecentOperations,
    getUserOperations: api.getUserOperations,
    getPoolOperations: api.getPoolOperations,

    // ---- Public market data API ----
    getStatus: api.getStatus,
    getCoinsApi: api.getCoins,
    getCoinApi: api.getCoin,
    getPoolsApi: api.getPools,
    getPoolByPair: api.getPoolByPair,
    getPoolLiquidityShares: api.getPoolLiquidityShares,
    getPrices: api.getPrices,
    getPrice: api.getPrice,
    getCandlesticks: api.getCandlesticks,
    getVolumeTotal: api.getVolumeTotal,
    getVolumePool: api.getVolumePool,
    getBucketsPools: api.getBucketsPools,

    // ---- Orders API (auth required for place/cancel/getOrders, public for book/trades) ----
    placeOrder: api.placeOrder,
    cancelOrder: api.cancelOrder,
    getOrders: api.getOrders,
    getOrderBookApi: api.getOrderBookApi,
    getTrades: api.getTrades,

    // ---- Yard (chat) API ----
    getYardMessages: api.getYardMessages,
    deleteYardMessage: api.deleteYardMessage,

    // ---- Client-side estimation utilities ----
    // skipSelfTradeCheck: pass true when estimating on behalf of a different user
    // (e.g. tipbot swaps) — the API key user's CLOB orders would incorrectly
    // trigger self-trade prevention against bids/asks that the actual swap user
    // (a Discord user with no CLOB orders) would freely fill.
    estimateSwap: (inputCoin, outputCoin, amountIn, maxHops = 6, algorithm = 'dfs', { skipSelfTradeCheck = false } = {}) =>
      estimateSwap(inputCoin, outputCoin, amountIn, getPools(), getCoins(), maxHops, algorithm, getAllOrderBooks(), skipSelfTradeCheck ? null : getUserOrders(), getClobFees(), getMarketByCoinKey()),
    estimateLiquidityFrontend,
    estimateDepositShares: ({ pool, amountA, amountB, slippagePercent } = {}) =>
      estimateDepositShares({ pool, amountA, amountB, slippagePercent }),
    checkRunesLiquidityFrontend: (coinA, coinB) =>
      checkRunesLiquidityFrontend(coinA, coinB, getPools(), getCoins()),
    calculateShareAmounts: () => calculateShareAmounts({ userShares: getUserShares(), pools: getPools() }),

    // ---- Price utilities ----
    utils: {
      ...createPriceUtils(),
    },

    // ---- Pool monitoring ----
    monitorPool: (poolId, interval = 10000) => {
      return setInterval(() => {
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

    // ---- Disconnect ----
    disconnect: () => {
      if (socketHandler) {
        socketHandler.socket.disconnect();
      }
    },
  };
}
