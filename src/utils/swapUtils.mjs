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
export const getRunesPriceUSD = (pools) => {
  try {
    const runesUsdcPool = pools.find((p) =>
      (p.coinA.ticker === 'RUNES' && p.coinB.ticker === 'USDC') ||
      (p.coinA.ticker === 'USDC' && p.coinB.ticker === 'RUNES'));

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
    ? reserveA.div(reserveB).toString() // RUNES is coinA: price = RUNES_reserve / TOKEN_reserve
    : reserveB.div(reserveA).toString(); // RUNES is coinB: price = RUNES_reserve / TOKEN_reserve

  return priceInRunes;
};

/**
 * Build unified adjacency map from pools + orderbooks.
 * Each edge is keyed by a unique edgeKey (pool ID or "ob:PAIR") to prevent revisiting.
 */
const buildAdjacencyMap = (pools, coins, orderbooks) => {
  const adjMap = new Map();
  const edgePairs = new Set();

  // Add edges from pools
  pools.forEach((pool) => {
    if (!pool.runesCompliant || new BigNumber(pool.reserveA).isZero() || new BigNumber(pool.reserveB).isZero()) {return;}
    const keyA = pool.coinA.ticker;
    const keyB = pool.coinB.ticker;
    if (!adjMap.has(keyA)) {adjMap.set(keyA, []);}
    if (!adjMap.has(keyB)) {adjMap.set(keyB, []);}
    adjMap.get(keyA).push({ edgeKey: pool.id, nextCoin: pool.coinB });
    adjMap.get(keyB).push({ edgeKey: pool.id, nextCoin: pool.coinA });
    const sorted = [keyA, keyB].sort();
    edgePairs.add(`${sorted[0]}-${sorted[1]}`);
  });

  // Add edges from orderbooks (only for pairs not already covered by a pool)
  if (orderbooks) {
    for (const pair of Object.keys(orderbooks)) {
      if (edgePairs.has(pair)) {continue;}
      const depth = orderbooks[pair];
      if ((!depth.bids || depth.bids.length === 0) && (!depth.asks || depth.asks.length === 0)) {continue;}

      const parts = pair.split('-');
      if (parts.length !== 2) {continue;}
      const coinA = coins.find((c) => c.ticker === parts[0]);
      const coinB = coins.find((c) => c.ticker === parts[1]);
      if (!coinA || !coinB) {continue;}

      const edgeKey = `ob:${pair}`;
      if (!adjMap.has(coinA.ticker)) {adjMap.set(coinA.ticker, []);}
      if (!adjMap.has(coinB.ticker)) {adjMap.set(coinB.ticker, []);}
      adjMap.get(coinA.ticker).push({ edgeKey, nextCoin: coinB });
      adjMap.get(coinB.ticker).push({ edgeKey, nextCoin: coinA });
      edgePairs.add(pair);
    }
  }

  return adjMap;
};

// DFS-based pathfinding
const findAllPathsDFS = (startCoin, endCoin, pools, maxHops = 6, coins = [], orderbooks = null) => {
  const paths = [];
  const visited = new Set();
  const adjMap = buildAdjacencyMap(pools, coins, orderbooks);

  function dfs(currentCoin, currentPath, hops) {
    if (hops > maxHops) {return;}
    if (currentCoin.ticker === endCoin.ticker) {
      paths.push([...currentPath]);
      return;
    }

    const edges = adjMap.get(currentCoin.ticker) || [];
    for (const { edgeKey, nextCoin } of edges) {
      if (visited.has(edgeKey)) {continue;}
      visited.add(edgeKey);

      currentPath.push({
        from: currentCoin.ticker,
        to: nextCoin.ticker,
      });

      dfs(nextCoin, currentPath, hops + 1);

      currentPath.pop();
      visited.delete(edgeKey);
    }
  }

  dfs(startCoin, [], 0);
  return paths;
};

// BFS-based pathfinding
const findAllPathsBFS = (startCoin, endCoin, pools, maxHops = 6, maxPaths = 20, coins = [], orderbooks = null) => {
  const paths = [];
  const queue = [{ coin: startCoin, path: [], hops: 0 }];
  const visited = new Set();
  const adjMap = buildAdjacencyMap(pools, coins, orderbooks);

  while (queue.length && paths.length < maxPaths) {
    const { coin, path, hops } = queue.shift();
    if (hops > maxHops) {continue;}
    if (coin.ticker === endCoin.ticker) {
      paths.push(path);
      continue;
    }

    const edges = adjMap.get(coin.ticker) || [];
    for (const { edgeKey, nextCoin } of edges) {
      const visitKey = `${coin.ticker}-${edgeKey}`;
      if (visited.has(visitKey)) {continue;}
      visited.add(visitKey);

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
// coins + orderbooks are optional — when provided, orderbook-only pairs are included in pathfinding
export const findAllPaths = (startCoin, endCoin, pools, maxHops = 6, algorithm = 'dfs', coins = [], orderbooks = null) => {
  if (algorithm === 'bfs') {
    return findAllPathsBFS(startCoin, endCoin, pools, maxHops, 20, coins, orderbooks);
  }
  return findAllPathsDFS(startCoin, endCoin, pools, maxHops, coins, orderbooks);
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
  let totalFeeAmount = amountInBN.times(totalFeeRate).integerValue(BigNumber.ROUND_DOWN);
  // Minimum fee floor: match backend - ensure at least 1 smallest unit when fees are configured
  if (totalFeeRate.gt(0) && totalFeeAmount.isZero()) {
    totalFeeAmount = new BigNumber(1);
  }
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

  if (amountOutBN.isNaN() || !amountOutBN.isFinite() || amountOutBN.lt(1)) {return null;}

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

/**
 * Simulate filling an order book for a given input amount.
 * For a buy (inputCoin is quote, outputCoin is base): walk asks (ascending price).
 * For a sell (inputCoin is base, outputCoin is quote): walk bids (descending price).
 *
 * @param {object} depth - { bids: [[price, qty], ...], asks: [[price, qty], ...] } (human-readable values)
 * @param {'buy'|'sell'} side - 'buy' means spending inputCoin to acquire outputCoin
 * @param {BigNumber} amountIn - whole-unit input amount
 * @param {number} inputDp - decimal places of input coin
 * @param {number} outputDp - decimal places of output coin
 * @returns {{ amountOut: BigNumber }|null}
 */
export const simulateClobFill = (depth, side, amountIn, inputDp, outputDp, userOrders = null, pair = null) => {
  let levels = side === 'buy' ? (depth.asks || []) : (depth.bids || []);
  if (levels.length === 0) {return null;}

  // Self-trade prevention: subtract user's own order quantities from depth levels
  if (userOrders && pair) {
    const oppositeSide = side === 'buy' ? 'sell' : 'buy';
    const ownOrders = userOrders.filter(
      (o) => o.pair === pair && o.side === oppositeSide && ['open', 'partially_filled'].includes(o.status)
    );
    if (ownOrders.length > 0) {
      const ownQtyByPrice = {};
      for (const o of ownOrders) {
        const remaining = new BigNumber(o.quantity).minus(o.filledQuantity || '0');
        if (remaining.gt(0)) {
          const p = o.price;
          ownQtyByPrice[p] = (ownQtyByPrice[p] || new BigNumber(0)).plus(remaining);
        }
      }
      levels = levels
        .map(([priceStr, qtyStr]) => {
          const ownQty = ownQtyByPrice[priceStr];
          if (!ownQty) {return [priceStr, qtyStr];}
          const adjusted = new BigNumber(qtyStr).minus(ownQty);
          if (adjusted.lte(0)) {return null;}
          return [priceStr, adjusted.toString()];
        })
        .filter(Boolean);
      if (levels.length === 0) {return null;}
    }
  }

  let remaining = amountIn.shiftedBy(-inputDp);
  let totalOutput = new BigNumber(0);

  for (const [priceStr, qtyStr] of levels) {
    if (remaining.lte(0)) {break;}
    const price = new BigNumber(priceStr);
    const qty = new BigNumber(qtyStr);
    if (price.lte(0) || qty.lte(0)) {continue;}

    if (side === 'buy') {
      const maxBaseBuyable = remaining.div(price);
      const fillQty = BigNumber.min(maxBaseBuyable, qty);
      const cost = fillQty.times(price);
      totalOutput = totalOutput.plus(fillQty);
      remaining = remaining.minus(cost);
    } else {
      const fillQty = BigNumber.min(remaining, qty);
      const revenue = fillQty.times(price);
      totalOutput = totalOutput.plus(revenue);
      remaining = remaining.minus(fillQty);
    }
  }

  if (totalOutput.lte(0)) {return null;}
  return { amountOut: totalOutput.shiftedBy(outputDp).integerValue(BigNumber.ROUND_DOWN) };
};

const deriveClobPairAndSide = (fromTicker, toTicker) => {
  // Uppercase to match backend normalizeQueueName
  const from = fromTicker.toUpperCase();
  const to = toTicker.toUpperCase();
  const [first, second] = [from, to].sort();
  const pair = `${first}-${second}`;
  const side = from === first ? 'buy' : 'sell';
  return { pair, side };
};

// Estimate a single path
export const estimatePath = async (pools, path, inputCoin, amountIn, coins, orderbooks = null, userOrders = null) => {
  let currentAmount = new BigNumber(amountIn).shiftedBy(inputCoin.dp || 8);
  let currentCoin = inputCoin;
  let priceImpact = 0;
  const intermediateAmounts = [];
  const enrichedPath = [];
  let updatedPools = [...pools];

  for (const step of path) {
    const poolIndex = updatedPools.findIndex(
      (p) =>
        (p.coinA.ticker === step.from && p.coinB.ticker === step.to) ||
        (p.coinB.ticker === step.from && p.coinA.ticker === step.to)
    );

    const pool = poolIndex !== -1 ? updatedPools[poolIndex] : null;
    const outputCoin = coins.find((c) => c.ticker === step.to);
    if (!outputCoin) {return null;}

    const currentCoinDp = currentCoin.dp || 8;
    const smallestUnit = new BigNumber(1).shiftedBy(-currentCoinDp);
    if (new BigNumber(currentAmount).shiftedBy(-currentCoinDp).lt(smallestUnit)) {
      return null;
    }

    // AMM simulation (only if pool exists and is compliant)
    let ammOut = null;
    let swapResult = null;
    if (pool && pool.runesCompliant) {
      const isCoinAInput = pool.coinA.ticker === step.from;
      swapResult = simulateSwap(pool, currentCoin, currentAmount, isCoinAInput);
      if (swapResult && swapResult.amountOut.gt(0)) {
        ammOut = swapResult.amountOut;
      }
    }

    // CLOB simulation
    let clobOut = null;
    if (orderbooks) {
      const { pair: clobPair, side: clobSide } = deriveClobPairAndSide(step.from, step.to);
      const depth = orderbooks[clobPair];
      if (depth) {
        const clobResult = simulateClobFill(depth, clobSide, currentAmount, currentCoinDp, outputCoin.dp || 8, userOrders, clobPair);
        if (clobResult && clobResult.amountOut.gt(0)) {
          clobOut = clobResult.amountOut;
        }
      }
    }

    // Pick best venue
    let amountOutBN;
    let venue;
    if (ammOut && clobOut) {
      if (clobOut.gt(ammOut)) {
        amountOutBN = clobOut;
        venue = 'clob';
      } else {
        amountOutBN = ammOut;
        venue = 'amm';
      }
    } else if (ammOut) {
      amountOutBN = ammOut;
      venue = 'amm';
    } else if (clobOut) {
      amountOutBN = clobOut;
      venue = 'clob';
    } else {
      return null;
    }

    if (venue === 'amm' && swapResult) {
      updatedPools[poolIndex] = swapResult.updatedPool;
    }

    if (pool && venue === 'amm') {
      const isCoinAInput = pool.coinA.ticker === step.from;
      const reserveA = new BigNumber(pool.reserveA);
      const reserveB = new BigNumber(pool.reserveB);
      const spotPrice = isCoinAInput ? reserveB.div(reserveA) : reserveA.div(reserveB);
      const totalFeeRate = new BigNumber(pool.lpFeeRate).plus(pool.treasuryFeeRate).div(100);
      const effectivePrice = amountOutBN.div(
        currentAmount.times(new BigNumber(1).minus(totalFeeRate))
      );
      const stepPriceImpact = spotPrice.minus(effectivePrice).div(spotPrice).abs().toNumber();
      priceImpact += stepPriceImpact;
    }

    enrichedPath.push({
      from: step.from,
      to: step.to,
      venue,
      output: amountOutBN.shiftedBy(-(outputCoin.dp || 8)).toString(),
    });

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
    enrichedPath,
  };
};

// Main estimateSwap function
// orderbooks: optional { [pair]: { bids, asks } } for CLOB comparison per hop
export const estimateSwap = async (
  inputCoin,
  outputCoin,
  amountIn,
  pools,
  coins,
  maxHops = 6,
  algorithm = 'dfs',
  orderbooks = null,
  userOrders = null,
) => {
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

  const paths = findAllPaths(inputCoinData, outputCoinData, pools, maxHops, algorithm, coins, orderbooks);
  if (!paths.length) {
    throw new Error('No valid swap paths found with RUNES-compliant pools');
  }

  let bestPath = null;
  let maxAmountOut = new BigNumber(0);
  let bestResult = null;

  for (const path of paths) {
    const result = await estimatePath(pools, path, inputCoinData, amountIn, coins, orderbooks, userOrders);
    if (result && result.amountOut.gt(maxAmountOut)) {
      maxAmountOut = result.amountOut;
      bestPath = path;
      bestResult = result;
    }
  }

  if (!bestPath) {
    throw new Error('No valid swap path with positive output using RUNES-compliant pools');
  }

  const runesPriceUSD = await getRunesPriceUSD(pools);
  const priceAInRunes = getTokenPriceInRunes(inputCoinData, pools);
  const priceBInRunes = getTokenPriceInRunes(outputCoinData, pools);
  if (!priceAInRunes || priceAInRunes === '0' || !priceBInRunes || priceBInRunes === '0') {
    throw new Error('Pool not initialized or invalid token');
  }

  const priceAUSD = new BigNumber(priceAInRunes).times(runesPriceUSD).toString();
  const priceBUSD = new BigNumber(priceBInRunes).times(runesPriceUSD).toString();
  const inputValueUSD = new BigNumber(amountIn).times(priceAUSD).toString();

  const outputValueUSD = maxAmountOut
    .shiftedBy(-outputCoinData.dp)
    .times(priceBUSD)
    .toString();

  const runesPriceUSDAfter = getRunesPriceUSD(bestResult.updatedPools);
  const priceAInRunesAfter = new BigNumber(getTokenPriceInRunes(inputCoinData, bestResult.updatedPools));
  const priceBInRunesAfter = new BigNumber(getTokenPriceInRunes(outputCoinData, bestResult.updatedPools));

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
      [inputCoin.ticker]: priceAInRunesAfter.times(runesPriceUSDAfter).toString(),
      [outputCoin.ticker]: priceBInRunesAfter.times(runesPriceUSDAfter).toString(),
    },
    path: bestResult.enrichedPath,
    algorithm,
  };
};