// src/utils/swapUtils.mjs
import { BigNumber } from 'bignumber.js';

export const validatePositiveNumber = (value, fieldName) => {
  const num = new BigNumber(value);
  if (num.isNaN() || num.lte(0)) {
    throw new Error(`Invalid ${fieldName}: ${value} must be a positive number`);
  }
  return num;
};

// Get RUNES price in USD using RUNES/USDC pool
export const getRunesPriceUSD = async (pools) => {
  try {
    const runesUsdcPool = pools.find((p) => (p.coinA.ticker === 'RUNES' && p.coinB.ticker === 'USDC'));

    if (!runesUsdcPool) {
      console.warn('RUNES/USDC pool not found, using fallback price of $0.01');
      return '0.01';
    }

    const reserveA = new BigNumber(runesUsdcPool.reserveA).shiftedBy(-runesUsdcPool.coinA.dp);
    const reserveB = new BigNumber(runesUsdcPool.reserveB).shiftedBy(-runesUsdcPool.coinB.dp);

    if (reserveA.isZero() || reserveB.isZero()) {
      console.warn('RUNES/USDC pool has zero reserves, using fallback price of $0.01');
      return '0.01';
    }

    let runesPriceUSD;
    if (runesUsdcPool.coinA.ticker === 'RUNES' && runesUsdcPool.coinB.ticker === 'USDC') {
      runesPriceUSD = reserveB.div(reserveA);
    } else {
      runesPriceUSD = reserveA.div(reserveB);
    }

    if (runesPriceUSD.isNaN() || runesPriceUSD.lte(0)) {
      console.warn('Invalid RUNES/USDC price calculated, using fallback price of $0.01');
      return '0.01';
    }

    return runesPriceUSD.toString();
  } catch (error) {
    console.error('Error calculating RUNES/USD price:', error);
    return '0.01';
  }
};

// Get token price in RUNES
export const getTokenPriceInRunes = (token, pools) => {
  if (token.ticker === 'RUNES') {return '1';}
  const pool = pools.find(
    (p) =>
      (p.coinA.ticker === 'RUNES' && p.coinB.ticker === token.ticker) ||
      (p.coinB.ticker === 'RUNES' && p.coinA.ticker === token.ticker)
  );
  if (!pool || new BigNumber(pool.reserveA).isZero() || new BigNumber(pool.reserveB).isZero()) {
    return '0';
  }
  const isRunesA = pool.coinA.ticker === 'RUNES';

  const reserveA = new BigNumber(pool.reserveA).shiftedBy(-pool.coinA.dp);
  const reserveB = new BigNumber(pool.reserveB).shiftedBy(-pool.coinB.dp);

  const priceInRunes = isRunesA
    ? reserveA.div(reserveB).toString() // RUNES/TOKEN: price = reserveB (TOKEN) / reserveA (RUNES)
    : reserveB.div(reserveA).toString(); // TOKEN/RUNES: price = reserveA (TOKEN) / reserveB (RUNES)

  return priceInRunes;
};

// DFS-based pathfinding
const findAllPathsDFS = (startCoin, endCoin, pools, maxHops = 6) => {
  const paths = [];
  const visited = new Set();

  function dfs(currentCoin, currentPath, hops) {
    if (hops > maxHops) {return;}
    if (currentCoin.ticker === endCoin.ticker) {
      paths.push([...currentPath]);
      return;
    }

    for (const pool of pools) {
      if (!pool.runesCompliant) {continue;}
      const isCoinA = pool.coinA.ticker === currentCoin.ticker;
      const isCoinB = pool.coinB.ticker === currentCoin.ticker;
      if (!isCoinA && !isCoinB) {continue;}

      const nextCoin = isCoinA ? pool.coinB : pool.coinA;
      const poolKey = pool.id;

      if (visited.has(poolKey)) {continue;}
      visited.add(poolKey);

      currentPath.push({
        from: currentCoin.ticker,
        to: nextCoin.ticker,
      });

      dfs(nextCoin, currentPath, hops + 1);

      currentPath.pop();
      visited.delete(poolKey);
    }
  }

  dfs(startCoin, [], 0);
  return paths;
};

// BFS-based pathfinding
const findAllPathsBFS = (startCoin, endCoin, pools, maxHops = 6, maxPaths = 20) => {
  const paths = [];
  const queue = [{ coin: startCoin, path: [], hops: 0 }];
  const visited = new Set();

  // Build pool map for faster lookup
  const poolMap = new Map();
  pools.forEach((pool) => {
    if (!pool.runesCompliant || new BigNumber(pool.reserveA).isZero() || new BigNumber(pool.reserveB).isZero()) {return;}
    const keyA = pool.coinA.ticker;
    const keyB = pool.coinB.ticker;
    if (!poolMap.has(keyA)) {poolMap.set(keyA, []);}
    if (!poolMap.has(keyB)) {poolMap.set(keyB, []);}
    poolMap.get(keyA).push({ pool, nextCoin: pool.coinB });
    poolMap.get(keyB).push({ pool, nextCoin: pool.coinA });
  });

  while (queue.length && paths.length < maxPaths) {
    const { coin, path, hops } = queue.shift();
    if (hops > maxHops) {continue;}
    if (coin.ticker === endCoin.ticker) {
      paths.push(path);
      continue;
    }

    const connectedPools = poolMap.get(coin.ticker) || [];
    for (const { pool, nextCoin } of connectedPools) {
      const poolKey = `${coin.ticker}-${pool.id}`;
      if (visited.has(poolKey)) {continue;}
      visited.add(poolKey);

      queue.push({
        coin: nextCoin,
        path: [...path, { from: coin.ticker, to: nextCoin.ticker }],
        hops: hops + 1,
      });
    }
  }

  return paths;
};

// Find all possible swap paths (select DFS or BFS)
export const findAllPaths = (startCoin, endCoin, pools, maxHops = 6, algorithm = 'dfs') => {
  if (algorithm === 'bfs') {
    return findAllPathsBFS(startCoin, endCoin, pools, maxHops, 20); // Limit to 20 paths for BFS
  }
  return findAllPathsDFS(startCoin, endCoin, pools, maxHops);
};

// Simulate a single swap in a pool (aligned with backend's swapSingle)
export const simulateSwap = (pool, inputCoin, amountInBN, isCoinAInput) => {
  if (!pool.runesCompliant) {return null;}

  if (amountInBN.lt(1)) {return null;}

  const reserveABN = new BigNumber(pool.reserveA);
  const reserveBBN = new BigNumber(pool.reserveB);
  if (reserveABN.isZero() || reserveBBN.isZero()) {return null;}

  const lpFeeRate = new BigNumber(pool.lpFeeRate).div(100);
  const treasuryFeeRate = new BigNumber(pool.treasuryFeeRate).div(100);
  const totalFeeRate = lpFeeRate.plus(treasuryFeeRate);

  // Calculate total fee and split proportionally
  const totalFeeAmount = amountInBN.times(totalFeeRate).integerValue(BigNumber.ROUND_DOWN);
  let treasuryFeeAmount = new BigNumber(0);
  let lpFeeAmount = new BigNumber(0);
  if (!totalFeeRate.eq(0)) {
    treasuryFeeAmount = totalFeeAmount.times(treasuryFeeRate).div(totalFeeRate).integerValue(BigNumber.ROUND_DOWN);
    lpFeeAmount = totalFeeAmount.minus(treasuryFeeAmount);
  }

  const amountInForPool = amountInBN.minus(totalFeeAmount);
  if (amountInForPool.lt(1)) {return null;}

  // const outputCoin = isCoinAInput ? pool.coinB : pool.coinA;
  // const outputCoinDp = outputCoin.dp || 8;

  let amountOutBN;
  if (isCoinAInput) {
    amountOutBN = amountInForPool.times(reserveBBN).div(reserveABN.plus(amountInForPool));
  } else {
    amountOutBN = amountInForPool.times(reserveABN).div(reserveBBN.plus(amountInForPool));
  }
  amountOutBN = amountOutBN.integerValue(BigNumber.ROUND_DOWN);

  if (amountOutBN.isNaN() || amountOutBN.lt(1)) {return null;}

  // Simulate reserve updates (mimicking backend)
  const updatedPool = { ...pool };
  if (isCoinAInput) {
    updatedPool.reserveA = reserveABN.plus(amountInForPool).plus(lpFeeAmount).toString();
    updatedPool.reserveB = reserveBBN.minus(amountOutBN).toString();
  } else {
    updatedPool.reserveB = reserveBBN.plus(amountInForPool).plus(lpFeeAmount).toString();
    updatedPool.reserveA = reserveABN.minus(amountOutBN).toString();
  }

  return {
    amountOut: amountOutBN,
    updatedPool,
    lpFeeAmount,
    treasuryFeeAmount,
  };
};

// Estimate a single path
export const estimatePath = async (pools, path, inputCoin, amountIn, coins) => {
  let currentAmount = new BigNumber(amountIn).shiftedBy(inputCoin.dp || 8);
  let currentCoin = inputCoin;
  let priceImpact = 0;
  const intermediateAmounts = [];
  let updatedPools = [...pools]; // Clone pools to simulate reserve updates

  for (const step of path) {
    const poolIndex = updatedPools.findIndex(
      (p) =>
        (p.coinA.ticker === step.from && p.coinB.ticker === step.to) ||
        (p.coinB.ticker === step.from && p.coinA.ticker === step.to)
    );
    if (poolIndex === -1 || !updatedPools[poolIndex].runesCompliant) {return null;}

    const pool = updatedPools[poolIndex];
    const isCoinAInput = pool.coinA.ticker === step.from;
    const outputCoin = coins.find((c) => c.ticker === step.to);
    if (!outputCoin) {return null;}

    const currentCoinDp = currentCoin.dp || 8;
    const smallestUnit = new BigNumber(1).shiftedBy(-currentCoinDp);
    if (new BigNumber(currentAmount).shiftedBy(-currentCoinDp).lt(smallestUnit)) {
      return null;
    }

    const swapResult = simulateSwap(pool, currentCoin, currentAmount, isCoinAInput);
    if (!swapResult || swapResult.amountOut.lte(0)) {return null;}

    const { amountOut: amountOutBN, updatedPool } = swapResult;

    // Update the pool in the cloned pools array
    updatedPools[poolIndex] = updatedPool;

    const reserveA = new BigNumber(pool.reserveA);
    const reserveB = new BigNumber(pool.reserveB);
    const spotPrice = isCoinAInput ? reserveB.div(reserveA) : reserveA.div(reserveB);
    const totalFeeRate = new BigNumber(pool.lpFeeRate).plus(pool.treasuryFeeRate).div(100);
    const effectivePrice = amountOutBN.div(
      currentAmount.times(new BigNumber(1).minus(totalFeeRate))
    );
    const stepPriceImpact = spotPrice.minus(effectivePrice).div(spotPrice).abs().toNumber();
    priceImpact += stepPriceImpact;

    currentAmount = amountOutBN;
    currentCoin = outputCoin;
    if (step !== path[path.length - 1]) {
      intermediateAmounts.push({
        ticker: step.to,
        amount: currentAmount.shiftedBy(-(outputCoin.dp || 8)).toString(),
      });
    }
  }

  const outputCoin = coins.find((c) => c.ticker === path[path.length - 1].to);
  const outputCoinDp = outputCoin.dp || 8;
  if (
    new BigNumber(currentAmount)
      .shiftedBy(-outputCoinDp)
      .lt(new BigNumber(1).shiftedBy(-outputCoinDp))
  ) {
    return null;
  }

  return {
    amountOut: currentAmount,
    priceImpact: priceImpact / path.length,
    intermediateAmounts,
    updatedPools,
  };
};

// Main estimateSwap function
export const estimateSwap = async (
  inputCoin,
  outputCoin,
  amountIn,
  pools,
  coins,
  maxHops = 6,
  algorithm = 'dfs' // Default to DFS
) => {
  // Validate inputs
  if (!inputCoin || !outputCoin) {
    throw new Error('Input or output coin not provided');
  }
  validatePositiveNumber(amountIn, 'amountIn');
  validatePositiveNumber(maxHops, 'maxHops');
  if (maxHops < 1 || maxHops > 14) {
    throw new Error('Max hops must be between 1 and 14');
  }
  if (!['dfs', 'bfs'].includes(algorithm)) {
    throw new Error('Invalid algorithm: must be "dfs" or "bfs"');
  }

  const inputCoinData = coins.find((c) => c.ticker === inputCoin.ticker);
  const outputCoinData = coins.find((c) => c.ticker === outputCoin.ticker);
  if (!inputCoinData || !outputCoinData) {
    throw new Error(`Coin not found: ${inputCoin.ticker} or ${outputCoin.ticker}`);
  }

  const inputCoinDp = inputCoinData.dp || 8;
  const amountInBN = new BigNumber(amountIn);
  if (amountInBN.decimalPlaces() > inputCoinDp) {
    throw new Error(
      `Input amount ${amountIn} ${inputCoin.ticker} has ${amountInBN.decimalPlaces()} decimal places, exceeding allowed ${inputCoinDp}`
    );
  }

  const smallestUnit = new BigNumber(1).shiftedBy(-inputCoinDp);
  if (amountInBN.lt(smallestUnit)) {
    throw new Error(
      `Input amount ${amountIn} ${inputCoin.ticker} is less than the smallest unit (10^-${inputCoinDp})`
    );
  }

  // Find all paths using the specified algorithm
  const paths = findAllPaths(inputCoinData, outputCoinData, pools, maxHops, algorithm);
  if (!paths.length) {
    throw new Error('No valid swap paths found with RUNES-compliant pools');
  }

  // Estimate each path
  let bestPath = null;
  let maxAmountOut = new BigNumber(0);
  let bestResult = null;

  for (const path of paths) {
    const result = await estimatePath(pools, path, inputCoinData, amountIn, coins);
    if (result && result.amountOut.gt(maxAmountOut)) {
      maxAmountOut = result.amountOut;
      bestPath = path;
      bestResult = result;
    }
  }

  if (!bestPath) {
    throw new Error('No valid swap path with positive output using RUNES-compliant pools');
  }

  // Calculate USD prices
  const runesPriceUSD = await getRunesPriceUSD(pools);
  const priceAInRunes = getTokenPriceInRunes(inputCoinData, pools);
  const priceBInRunes = getTokenPriceInRunes(outputCoinData, pools);
  if (!priceAInRunes || !priceBInRunes) {
    throw new Error('Pool not initialized or invalid token');
  }

  const priceAUSD = new BigNumber(priceAInRunes).times(runesPriceUSD).toString();
  const priceBUSD = new BigNumber(priceBInRunes).times(runesPriceUSD).toString();
  const inputValueUSD = new BigNumber(amountIn).times(priceAUSD).toString();

  const outputValueUSD = maxAmountOut
    .shiftedBy(-outputCoinData.dp)
    .times(priceBUSD)
    .toString();

  // Simulate after-swap prices
  let priceAInRunesAfter = new BigNumber(priceAInRunes);
  let priceBInRunesAfter = new BigNumber(priceBInRunes);
  let currentAmount = new BigNumber(amountIn).shiftedBy(inputCoinData.dp || 8);
  let currentCoin = inputCoinData;
  let updatedPools = [...pools]; // Clone pools for after-swap price simulation

  for (const step of bestPath) {
    const poolIndex = updatedPools.findIndex(
      (p) =>
        (p.coinA.ticker === step.from && p.coinB.ticker === step.to) ||
        (p.coinB.ticker === step.from && p.coinA.ticker === step.to)
    );
    const pool = updatedPools[poolIndex];
    const isCoinAInput = pool.coinA.ticker === step.from;
    const nextCoin = coins.find((c) => c.ticker === step.to);
    const swapResult = simulateSwap(pool, currentCoin, currentAmount, isCoinAInput);

    const reserveA = new BigNumber(pool.reserveA);
    const reserveB = new BigNumber(pool.reserveB);
    if (isCoinAInput) {
      const newRunesReserve = reserveA.plus(currentAmount);
      const newTokenReserve = reserveB.minus(swapResult.amountOut);
      if (step.from === 'RUNES') {
        priceAInRunesAfter = newRunesReserve.div(newTokenReserve);
      } else if (step.to === 'RUNES') {
        priceBInRunesAfter = newRunesReserve.div(newTokenReserve);
      }
    } else {
      const newTokenReserve = reserveB.plus(currentAmount);
      const newRunesReserve = reserveA.minus(swapResult.amountOut);
      if (step.from === 'RUNES') {
        priceAInRunesAfter = newRunesReserve.div(newTokenReserve);
      } else if (step.to === 'RUNES') {
        priceBInRunesAfter = newRunesReserve.div(newTokenReserve);
      }
    }

    currentAmount = swapResult.amountOut;
    currentCoin = nextCoin;
    updatedPools[poolIndex] = swapResult.updatedPool; // Update pool for next iteration
  }

  return {
    input: {
      token: inputCoin.ticker,
      amount: amountIn,
      priceUSD: priceAUSD,
      valueUSD: inputValueUSD,
      priceInRunes: priceAInRunes,
    },
    output: {
      token: outputCoin.ticker,
      amount: maxAmountOut.shiftedBy(-outputCoinData.dp).toString(),
      priceUSD: priceBUSD,
      valueUSD: outputValueUSD,
      priceInRunes: priceBInRunes,
    },
    slippage: {
      priceImpact: bestResult.priceImpact * 100,
      intermediateAmounts: bestResult.intermediateAmounts,
    },
    afterSwapPrices: {
      [inputCoin.ticker]: priceAInRunesAfter.times(runesPriceUSD).toString(),
      [outputCoin.ticker]: priceBInRunesAfter.times(runesPriceUSD).toString(),
    },
    path: bestPath,
    algorithm, // Include algorithm in the response
  };
};