// src/index.js
import { setupSocket } from './socket.mjs';
import { getWallets, postSwap } from './api.mjs';
import { config } from './config.mjs';


async function startBot() {
  console.log('Starting RunesX API Key Example...');

  // Validate API key
  if (!config.apiKey) {
    
    console.error('Error: API_KEY is not set in .env file');
    process.exit(1);
  }

  // Setup Socket.IO
  const socket = setupSocket();

  // Fetch wallet data
  try {
    const wallets = await getWallets();
    console.log('Wallet data:', wallets);
  } catch (error) {
    console.error('Error fetching wallets:', error.message);
  }

  // Execute a swap: 1 RUNES through RUNES -> XLM -> POL
  try {
    const swap = await postSwap({
      amountIn: 1, // 1 RUNES
      path: [
        { from: 'RUNES', to: 'XLM' },
        { from: 'XLM', to: 'POL' },
      ],
      minAmountOut: 0.001, // Example minimum output (adjust based on market rates)
    });
    console.log('Swap executed:', swap);
  } catch (error) {
    console.error('Error executing swap:', error.message);
  }

  // Keep the bot running
  process.on('SIGINT', () => {
    console.log('Shutting down bot...');
    socket.disconnect();
    process.exit(0);
  });
}

startBot();