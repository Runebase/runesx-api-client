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

  async function getWallets() {
    try {
      const response = await api.get('/wallets');
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to fetch wallets');
    }
  }

  async function postSwap({ amountIn, path, minAmountOut, idempotencyKey }) {
    try {
      const key = idempotencyKey || randomUUID();
      const response = await api.post('/swap', { amountIn, path, minAmountOut }, {
        headers: { 'X-Idempotency-Key': key },
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to execute swap');
    }
  }

  async function depositLiquidity({ tickerA, tickerB, amountA, amountB, minShares, idempotencyKey }) {
    try {
      const headers = {};
      if (idempotencyKey) {
        headers['X-Idempotency-Key'] = idempotencyKey;
      }
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

  async function withdrawLiquidity({ tickerA, tickerB, shares, idempotencyKey }) {
    try {
      const headers = {};
      if (idempotencyKey) {
        headers['X-Idempotency-Key'] = idempotencyKey;
      }
      const response = await api.post('/liquidity/withdraw', { tickerA, tickerB, shares }, { headers });
      return response.data.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to withdraw liquidity');
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

  return { getWallets, getPools, postSwap, depositLiquidity, withdrawLiquidity };
}
