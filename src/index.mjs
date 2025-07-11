import { setupSocket } from './socket.mjs';
import { getWallets, postSwap } from './api.mjs';
import { config } from './config.mjs';
import { getPools, getPool } from './poolStore.mjs';

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
      console.log('All pools:', pools.map(pool => ({
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

  // Keep the bot running
  process.on('SIGINT', () => {
    console.log('Shutting down bot...');
    socket.disconnect();
    process.exit(0);
  });
}

startBot();