// src/api.mjs
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

  async function postSwap({ amountIn, path, minAmountOut }) {
    try {
      const response = await api.post('/swap', { amountIn, path, minAmountOut });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to execute swap');
    }
  }

  async function depositLiquidity({ coinA, coinB, amountA, amountB }) {
    try {
      const response = await api.post('/liquidity/deposit', { coinA, coinB, amountA, amountB });
      return response.data.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to deposit liquidity');
    }
  }

  async function withdrawLiquidity({ coinA, coinB, shares }) {
    try {
      const response = await api.post('/liquidity/withdraw', { coinA, coinB, shares });
      return response.data.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to withdraw liquidity');
    }
  }

  return { getWallets, postSwap, depositLiquidity, withdrawLiquidity };
}