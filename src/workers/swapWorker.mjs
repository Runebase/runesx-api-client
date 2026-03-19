// src/workers/swapWorker.mjs
import { parentPort } from 'worker_threads';

import { estimateSwap } from '../utils/swapUtils.mjs';

parentPort.on('message', async (data) => {
  const { inputCoin, outputCoin, amountIn, pools, coins, maxHops, algorithm, orderbooks, userOrders, clobFees, marketsLookup } = data;
  try {
    const result = await estimateSwap(inputCoin, outputCoin, amountIn, pools, coins, maxHops, algorithm, orderbooks, userOrders, clobFees, marketsLookup);
    parentPort.postMessage({ result });
  } catch (err) {
    parentPort.postMessage({ error: err.message });
  }
});