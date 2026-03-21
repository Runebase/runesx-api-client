// src/api.mjs
import { randomUUID } from 'crypto';

import axios from 'axios';

export function createApi(config) {
  const api = axios.create({
    baseURL: config.apiUrl,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  // ---- Public endpoints (no auth required) ----

  async function getStatus() {
    try {
      const response = await api.get('/status');
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to fetch status');
    }
  }

  async function getCoins() {
    try {
      const response = await api.get('/coins');
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to fetch coins');
    }
  }

  async function getCoin(ticker) {
    try {
      const response = await api.get(`/coins/${encodeURIComponent(ticker)}`);
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to fetch coin');
    }
  }

  async function getPools() {
    try {
      const response = await api.get('/pools');
      return response.data.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to fetch pools');
    }
  }

  async function getPoolByPair(tickerA, tickerB) {
    try {
      const response = await api.get(`/pools/${encodeURIComponent(tickerA)}/${encodeURIComponent(tickerB)}`);
      return response.data.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to fetch pool');
    }
  }

  async function getPoolLiquidityShares(poolId) {
    try {
      const response = await api.get(`/pools/liquidity-shares/${encodeURIComponent(poolId)}`);
      return response.data.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to fetch pool liquidity shares');
    }
  }

  async function getPrices() {
    try {
      const response = await api.get('/price');
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to fetch prices');
    }
  }

  async function getPrice(ticker) {
    try {
      const response = await api.get(`/price/${encodeURIComponent(ticker)}`);
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to fetch price');
    }
  }

  async function getCandlesticks(poolId, timeframe, from, to) {
    try {
      const response = await api.get(`/candlesticks/${encodeURIComponent(poolId)}/${encodeURIComponent(timeframe)}/${encodeURIComponent(from)}/${encodeURIComponent(to)}`);
      return response.data.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to fetch candlesticks');
    }
  }

  async function getVolumeTotal() {
    try {
      const response = await api.get('/volume/total');
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to fetch total volume');
    }
  }

  async function getVolumePool(poolId) {
    try {
      const response = await api.get(`/volume/pool/${encodeURIComponent(poolId)}`);
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to fetch pool volume');
    }
  }

  async function getBucketsPools() {
    try {
      const response = await api.get('/buckets/pools');
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to fetch pool buckets');
    }
  }

  async function getRecentOperations({ operationType, limit } = {}) {
    try {
      const params = {};
      if (operationType) { params.operationType = operationType; }
      if (limit) { params.limit = limit; }
      const response = await api.get('/operations/recent', { params });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to fetch recent operations');
    }
  }

  async function getPoolOperations(poolId, { operationType, limit } = {}) {
    try {
      const params = {};
      if (operationType) { params.operationType = operationType; }
      if (limit) { params.limit = limit; }
      const response = await api.get(`/operations/pool/${encodeURIComponent(poolId)}`, { params });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to fetch pool operations');
    }
  }

  async function getYardMessages({ before, limit } = {}) {
    try {
      const params = {};
      if (before) { params.before = before; }
      if (limit) { params.limit = limit; }
      const response = await api.get('/yard/messages', { params });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to fetch yard messages');
    }
  }

  // ---- Private endpoints (auth required) ----

  async function getWallets() {
    try {
      const response = await api.get('/wallets');
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to fetch wallets');
    }
  }

  async function getLiquidityShares() {
    try {
      const response = await api.get('/liquidity/shares');
      return response.data.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to fetch liquidity shares');
    }
  }

  async function postSwap({ amountIn, path, minAmountOut, idempotencyKey }) {
    try {
      const key = idempotencyKey || randomUUID();
      const cleanPath = path.map(({ from, to }) => ({ from, to }));
      const response = await api.post('/swap', { amountIn, path: cleanPath, minAmountOut }, {
        headers: { 'X-Idempotency-Key': key },
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to execute swap');
    }
  }

  async function depositLiquidity({ tickerA, tickerB, amountA, amountB, minShares, idempotencyKey }) {
    try {
      const key = idempotencyKey || randomUUID();
      const headers = { 'X-Idempotency-Key': key };
      const body = { tickerA, tickerB, amountA, amountB };
      if (minShares !== undefined && minShares !== null) {
        body.minShares = minShares;
      }
      const response = await api.post('/liquidity/deposit', body, { headers });
      return response.data.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to deposit liquidity');
    }
  }

  async function withdrawLiquidity({ tickerA, tickerB, shares, minAmountA, minAmountB, idempotencyKey }) {
    try {
      const key = idempotencyKey || randomUUID();
      const headers = { 'X-Idempotency-Key': key };
      const body = { tickerA, tickerB, shares };
      if (minAmountA !== undefined && minAmountA !== null) {
        body.minAmountA = minAmountA;
      }
      if (minAmountB !== undefined && minAmountB !== null) {
        body.minAmountB = minAmountB;
      }
      const response = await api.post('/liquidity/withdraw', body, { headers });
      return response.data.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to withdraw liquidity');
    }
  }

  async function getDepositAddress(chainName) {
    try {
      const response = await api.get(`/deposit/address/${encodeURIComponent(chainName)}`);
      return response.data.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to get deposit address');
    }
  }

  async function getAllDepositAddresses() {
    try {
      const response = await api.get('/deposit/all-addresses');
      return response.data.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to get deposit addresses');
    }
  }

  async function initiateWithdraw({ ticker, chain, address, amount, memo, idempotencyKey }) {
    try {
      const key = idempotencyKey || randomUUID();
      const body = { ticker, chain, address, amount };
      if (memo !== undefined && memo !== null) {
        body.memo = memo;
      }
      const response = await api.post('/withdraw', body, {
        headers: { 'x-idempotency-key': key },
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to initiate withdrawal');
    }
  }

  async function verifyWithdrawPin({ pendingWithdrawalId, pinCode }) {
    try {
      const response = await api.post('/withdraw/verify-pin', { pendingWithdrawalId, pinCode });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to verify withdrawal PIN');
    }
  }

  async function sendWithdrawEmailPin({ pendingWithdrawalId }) {
    try {
      const response = await api.post('/withdraw/send-email-pin', { pendingWithdrawalId });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to send withdrawal email PIN');
    }
  }

  async function verifyWithdrawEmailPin({ pendingWithdrawalId, emailPinCode }) {
    try {
      const response = await api.post('/withdraw/verify-email-pin', { pendingWithdrawalId, emailPinCode });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to verify withdrawal email PIN');
    }
  }

  async function verifyWithdraw2FA({ pendingWithdrawalId, twoFactorToken }) {
    try {
      const response = await api.post('/withdraw/verify-2fa', { pendingWithdrawalId, twoFactorToken });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to verify withdrawal 2FA');
    }
  }

  async function getPendingWithdrawals() {
    try {
      const response = await api.get('/withdraw/pending');
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to fetch pending withdrawals');
    }
  }

  async function cancelWithdrawal({ pendingWithdrawalId }) {
    try {
      const response = await api.post('/withdraw/cancel', { pendingWithdrawalId });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to cancel withdrawal');
    }
  }

  async function getTransactionHistory({ page, limit, type, status } = {}) {
    try {
      const params = {};
      if (page) { params.page = page; }
      if (limit) { params.limit = limit; }
      if (type) { params.type = type; }
      if (status) { params.status = status; }
      const response = await api.get('/transactions/history', { params });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to fetch transaction history');
    }
  }

  async function getUserOperations({ operationType, poolId, startTime, endTime, page, limit } = {}) {
    try {
      const params = {};
      if (operationType) { params.operationType = operationType; }
      if (poolId) { params.poolId = poolId; }
      if (startTime) { params.startTime = startTime; }
      if (endTime) { params.endTime = endTime; }
      if (page) { params.page = page; }
      if (limit) { params.limit = limit; }
      const response = await api.get('/operations/user', { params });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to fetch user operations');
    }
  }

  // ---- Orders endpoints ----

  async function placeOrder({ pair, side, price, quantity, timeInForce, inverted, idempotencyKey }) {
    try {
      const key = idempotencyKey || randomUUID();
      const body = { pair, side, price, quantity, timeInForce };
      if (inverted !== undefined && inverted !== null) {
        body.inverted = inverted;
      }
      const response = await api.post('/orders', body, {
        headers: { 'x-idempotency-key': key },
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to place order');
    }
  }

  async function cancelOrder(orderId, { idempotencyKey } = {}) {
    try {
      const headers = {};
      if (idempotencyKey) {
        headers['x-idempotency-key'] = idempotencyKey;
      }
      const response = await api.delete(`/orders/${encodeURIComponent(orderId)}`, { headers });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to cancel order');
    }
  }

  async function getOrders({ pair, status, limit, offset } = {}) {
    try {
      const params = {};
      if (pair) { params.pair = pair; }
      if (status) { params.status = status; }
      if (limit) { params.limit = limit; }
      if (offset !== undefined && offset !== null) { params.offset = offset; }
      const response = await api.get('/orders', { params });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to fetch orders');
    }
  }

  async function getOrderBookApi(pair, { levels } = {}) {
    try {
      const params = {};
      if (levels) { params.levels = levels; }
      const response = await api.get(`/orders/book/${encodeURIComponent(pair)}`, { params });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to fetch order book');
    }
  }

  async function getTrades(pair, { limit } = {}) {
    try {
      const params = {};
      if (limit) { params.limit = limit; }
      const response = await api.get(`/orders/trades/${encodeURIComponent(pair)}`, { params });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to fetch trades');
    }
  }

  async function deleteYardMessage(messageId) {
    try {
      const response = await api.delete(`/yard/messages/${encodeURIComponent(messageId)}`);
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to delete yard message');
    }
  }

  return {
    // Public
    getStatus,
    getCoins,
    getCoin,
    getPools,
    getPoolByPair,
    getPoolLiquidityShares,
    getPrices,
    getPrice,
    getCandlesticks,
    getVolumeTotal,
    getVolumePool,
    getBucketsPools,
    getRecentOperations,
    getPoolOperations,
    getYardMessages,
    // Private
    getWallets,
    getLiquidityShares,
    postSwap,
    depositLiquidity,
    withdrawLiquidity,
    getDepositAddress,
    getAllDepositAddresses,
    initiateWithdraw,
    verifyWithdrawPin,
    sendWithdrawEmailPin,
    verifyWithdrawEmailPin,
    verifyWithdraw2FA,
    getPendingWithdrawals,
    cancelWithdrawal,
    getTransactionHistory,
    getUserOperations,
    deleteYardMessage,
    // Orders
    placeOrder,
    cancelOrder,
    getOrders,
    getOrderBookApi,
    getTrades,
  };
}
