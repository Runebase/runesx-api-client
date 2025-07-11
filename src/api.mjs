// src/api.js
import axios from 'axios';

import { config } from './config.mjs';

const api = axios.create({
  baseURL: config.apiUrl,
  headers: {
    Authorization: `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
  },
});

// Fetch wallet data (requires 'read' scope)
export async function getWallets() {
  try {
    const response = await api.get('/wallets');
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.error || 'Failed to fetch wallets');
  }
}

// Execute a swap (requires 'swap' scope)
export async function postSwap({ amountIn, path, minAmountOut }) {
  try {
    const response = await api.post('/swap', { amountIn, path, minAmountOut });
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.error || 'Failed to execute swap');
  }
}