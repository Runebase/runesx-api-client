// src/utils/swapUtils.mjs
// Uses SafeBigNumber (DECIMAL_PLACES=40, EXPONENTIAL_AT=[-100,100]) aligned
// with the backend's SafeBigNumber to ensure estimation arithmetic matches
// the backend's rounding behavior. (Audit fix L3, 2026-03-17)
import { SafeBigNumber as BigNumber } from './safeBigNumber.mjs';

/**
 * Get a coin's decimal places, requiring it to be explicitly defined.
 * Unlike `coin.dp || 8`, this correctly handles dp=0 (which is falsy in JS).
 * @param {Object} coin - Coin object with a dp property
 * @returns {number}
 */
const getDp = (coin) => {
  if (coin.dp === null || coin.dp === undefined || typeof coin.dp !== 'number') {
    throw new Error(`Coin ${coin.ticker || 'unknown'} is missing dp (decimal places)`);
  }
  return coin.dp;
};

export const validatePositiveNumber = (value, fieldName) => {
  const num = new BigNumber(value);
  if (num.isNaN() || num.lte(0)) {
    throw new Error(`Invalid ${fieldName}: ${value} must be a positive number`);
  }
  return num;
};

// Get RUNES price in USD using RUNES/USDC pool
// ── Pool lookup helper (audit fix L3, 2026-03-18) ──
// Builds a Map keyed by sorted ticker pair ("RUNES-USDC") for O(1) lookups.
// Replaces O(n) Array.find() in getRunesPriceUSD and getTokenPriceInRunes,
// which are called per-hop (up to 10×) per path (up to 20 paths) per estimate.
// The Map is built once per pools array reference — callers that pass the same
// array (or updatedPools from estimatePath) reuse the cached Map.
let _poolMapCache = null;
let _poolMapSource = null;
let _poolMapSourceLen = -1;

function getPoolByTickers(pools, tickerA, tickerB) {
  // Rebuild Map when the pools array changes. Three invalidation signals:
  //   1. Reference equality (primary): Immer/Redux produces a new reference on every state update
  //   2. Length change: catches spread/slice copies where pools were added/removed
  //   3. Always rebuild for spread/slice copies (reference !== source): these are
  //      created by estimatePath with mutated reserves from prior hops. The length
  //      check alone misses in-place reserve updates (same length, different content).
  //
  // Performance: O(pools) rebuild is cheap (~50-100 pools). The Map avoids O(n)
  // per-call linear scans in getRunesPriceUSD and getTokenPriceInRunes.
  // (Audit fix L2, 2026-03-18; strengthened L6, 2026-03-18)
  if (_poolMapSource !== pools || _poolMapSourceLen !== pools.length) {
    _poolMapCache = new Map();
    for (const p of pools) {
      if (!p || !p.coinA || !p.coinB) {continue;}
      const key = [p.coinA.ticker, p.coinB.ticker].sort().join('-');
      _poolMapCache.set(key, p);
    }
    _poolMapSource = pools;
    _poolMapSourceLen = pools.length;
  }
  const key = [tickerA, tickerB].sort().join('-');
  return _poolMapCache.get(key) || null;
}

export const getRunesPriceUSD = (pools) => {
  try {
    const runesUsdcPool = getPoolByTickers(pools, 'RUNES', 'USDC');

    if (!runesUsdcPool) {
      console.warn('RUNES/USDC pool not found');
      return '0';
    }

    const reserveA = new BigNumber(runesUsdcPool.reserveA).shiftedBy(-runesUsdcPool.coinA.dp);
    const reserveB = new BigNumber(runesUsdcPool.reserveB).shiftedBy(-runesUsdcPool.coinB.dp);

    if (reserveA.isZero() || reserveB.isZero()) {
      console.warn('RUNES/USDC pool has zero reserves');
      return '0';
    }

    let runesPriceUSD;
    if (runesUsdcPool.coinA.ticker === 'RUNES' && runesUsdcPool.coinB.ticker === 'USDC') {
      runesPriceUSD = reserveB.div(reserveA);
    } else {
      runesPriceUSD = reserveA.div(reserveB);
    }

    if (runesPriceUSD.isNaN() || runesPriceUSD.lte(0)) {
      console.warn('Invalid RUNES/USDC price calculated');
      return '0';
    }

    return runesPriceUSD.toString();
  } catch (error) {
    console.error('Error calculating RUNES/USD price:', error);
    return '0';
  }
};

// Get token price in RUNES
export const getTokenPriceInRunes = (token, pools) => {
  if (token.ticker === 'RUNES') {return '1';}
  const pool = getPoolByTickers(pools, 'RUNES', token.ticker);
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
  const adjMap = new Map(); // ticker -> [{ edgeKey, nextCoin }]
  const edgePairs = new Set(); // track "TICKERA-TICKERB" pairs already added

  // Build ticker→coin Map for O(1) lookups (Audit fix L2, 2026-03-18).
  // Previously used coins.find() per orderbook pair — O(pairs * coins).
  const coinByUpperTicker = new Map();
  for (const c of coins) {
    coinByUpperTicker.set(c.ticker.toUpperCase(), c);
  }

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
      if (edgePairs.has(pair)) {
        continue;
      }
      const depth = orderbooks[pair];
      if ((!depth.bids || depth.bids.length === 0) && (!depth.asks || depth.asks.length === 0)) {
        continue;
      }

      const parts = pair.split('-');
      if (parts.length !== 2) {continue;}
      // Uppercase tickers for case-insensitive matching: pool edges use
      // pool.coinA.ticker (already uppercase from DB), but legacy coin data
      // could have lowercase tickers. Without uppercasing, a coin with ticker
      // 'runes' wouldn't match the pool edge keyed by 'RUNES', creating a
      // disconnected graph node. (Audit fix L2, 2026-03-18)
      const tickerA = parts[0].toUpperCase();
      const tickerB = parts[1].toUpperCase();
      const coinA = coinByUpperTicker.get(tickerA);
      const coinB = coinByUpperTicker.get(tickerB);
      if (!coinA || !coinB) {
        continue;
      }

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
// Each queue entry carries its own visited-edges set so that different branches
// can independently traverse the same edge — matching DFS backtracking semantics.
const findAllPathsBFS = (startCoin, endCoin, pools, maxHops = 6, maxPaths = 20, coins = [], orderbooks = null) => {
  const paths = [];
  const queue = [{ coin: startCoin, path: [], hops: 0, visitedEdges: new Set() }];
  const adjMap = buildAdjacencyMap(pools, coins, orderbooks);

  while (queue.length && paths.length < maxPaths) {
    const { coin, path, hops, visitedEdges } = queue.shift();
    if (hops > maxHops) {continue;}
    if (coin.ticker === endCoin.ticker) {
      paths.push(path);
      continue;
    }

    const edges = adjMap.get(coin.ticker) || [];
    for (const { edgeKey, nextCoin } of edges) {
      if (visitedEdges.has(edgeKey)) {continue;}

      const newVisited = new Set(visitedEdges);
      newVisited.add(edgeKey);

      queue.push({
        coin: nextCoin,
        path: [...path, { from: coin.ticker, to: nextCoin.ticker }],
        hops: hops + 1,
        visitedEdges: newVisited,
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

  // Validate dp from socket-delivered pool data. A corrupted payload with
  // dp outside [0,18] would produce astronomically wrong estimates via
  // shiftedBy(). Matches backend swapSingle dp validation range.
  // (Audit fix L3, 2026-03-18; supports dp=0 for indivisible tokens, audit B, 2026-03-18)
  const coinADp = pool.coinA?.dp;
  const coinBDp = pool.coinB?.dp;
  if (!Number.isInteger(coinADp) || coinADp < 0 || coinADp > 18
    || !Number.isInteger(coinBDp) || coinBDp < 0 || coinBDp > 18) {return null;}

  if (amountInBN.lt(1)) {return null;}

  const reserveABN = new BigNumber(pool.reserveA);
  const reserveBBN = new BigNumber(pool.reserveB);
  if (reserveABN.isZero() || reserveBBN.isZero()) {return null;}

  const lpFeeRate = new BigNumber(pool.lpFeeRate).div(100);
  const treasuryFeeRate = new BigNumber(pool.treasuryFeeRate).div(100);
  const totalFeeRate = lpFeeRate.plus(treasuryFeeRate);

  // Fee rate validation: matches backend computeAmmFees() in swapCore.mjs.
  // Without this, a corrupted pool fee rate from the socket could produce
  // nonsensical estimates (negative output, NaN, etc). (Audit fix L6, 2026-03-18)
  if (lpFeeRate.isNaN() || !lpFeeRate.isFinite() || lpFeeRate.lt(0)
    || treasuryFeeRate.isNaN() || !treasuryFeeRate.isFinite() || treasuryFeeRate.lt(0)
    || totalFeeRate.gte(1) || totalFeeRate.gt('0.05')) {return null;}

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

  let amountOutBN;
  if (isCoinAInput) {
    amountOutBN = amountInForPool.times(reserveBBN).div(reserveABN.plus(amountInForPool));
  } else {
    amountOutBN = amountInForPool.times(reserveABN).div(reserveBBN.plus(amountInForPool));
  }
  amountOutBN = amountOutBN.integerValue(BigNumber.ROUND_DOWN);

  if (amountOutBN.isNaN() || !amountOutBN.isFinite() || amountOutBN.lt(1)) {return null;}

  // MIN_RESERVE_THRESHOLD: matches backend swapSingle's check in swapCore.mjs.
  // Without this, the frontend could show estimates for swaps that the backend
  // would reject due to insufficient post-swap reserves. (Audit fix L4, 2026-03-18)
  const MIN_RESERVE_THRESHOLD = new BigNumber(1000);
  const newResOut = isCoinAInput
    ? reserveBBN.minus(amountOutBN)
    : reserveABN.minus(amountOutBN);
  if (newResOut.lt(MIN_RESERVE_THRESHOLD)) {return null;}

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
 * Matches backend fillFromOrderBook.mjs math: operates in whole units with
 * per-level integer rounding and per-level fee deductions.
 *
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
// Default hard cap on total orders the backend will lock across all batches.
// Overridden at runtime by exchange_config from the backend socket event.
const DEFAULT_MAX_CLOB_FILL_TOTAL = 500;

/**
 * Calculate a CLOB fee as floor(amount * rate).
 * Mirrors backend clobFees.mjs calculateClobFee() exactly.
 * When the amount is small enough that floor rounds to zero, the fee is zero.
 * Minimum trade/swap amounts prevent economically insignificant fills.
 *
 * @param {BigNumber} amount - Whole-unit amount the fee is charged on
 * @param {BigNumber} rate   - Fee rate (e.g. 0.002 for taker)
 * @returns {BigNumber} Fee in whole units
 */
const calculateClobFee = (amount, rate) => {
  return amount.times(rate).integerValue(BigNumber.ROUND_DOWN);
};

// SECURITY NOTE (audit H3, 2026-03-18): This function operates on depth data
// delivered via WebSocket. A compromised or MITM'd socket could inject inflated
// per-order sizes or fake price levels. The backend re-evaluates all CLOB fills
// independently with FOR UPDATE locks inside a SERIALIZABLE transaction — this
// simulation is purely advisory for UI estimation and minAmountOut derivation.
// The per-order size sum validation below (H3 fix) catches gross payload corruption,
// but subtle manipulation (redistributing sizes within tolerance) is accepted —
// the backend's independent execution + minAmountOut slippage protection are the
// authoritative safeguards.
export const simulateClobFill = (depth, side, amountIn, inputDp, outputDp, userOrders = null, pair = null, clobFees = null) => {
  // side = 'buy': we spend quote coin, walk asks, receive base coin
  // side = 'sell': we spend base coin, walk bids, receive quote coin
  const levels = side === 'buy' ? (depth.asks || []) : (depth.bids || []);
  if (levels.length === 0) {return null;}

  // Price deviation guard (audit fix M6, 2026-03-17):
  // Matches backend fillFromOrderBook.mjs and matchingEngine.mjs — if the
  // current fill price deviates by more than maxPriceDeviation from the best
  // (first) fill price, stop filling. Without this, the frontend simulation
  // could overstate CLOB output when the real fill would stop early due to
  // price deviation, causing the user to set an unrealistically high
  // minAmountOut that fails on execution.
  // Fallback '5' matches backend MAX_CLOB_PRICE_DEVIATION_FACTOR in config/clobFees.mjs.
  // The authoritative value is delivered via exchange_config socket event.
  // (Aligned: audit fix H4, 2026-03-18 — tightened from '10' to '5')
  const MAX_PRICE_DEVIATION = new BigNumber(clobFees?.maxPriceDeviation || '5');

  // Self-trade prevention: the backend (fillFromOrderBook.mjs) walks orders
  // in price-time priority and stops when it encounters the user's own order,
  // filling valid non-user orders BEFORE it. We simulate this using exact user
  // order data (available from the orderbook Redux store via socket):
  //
  //   - At price levels BEFORE the user's first resting order: fill normally
  //   - AT the boundary level: fill non-user orders only (quantity reduced by
  //     user's resting quantity, order count reduced by user's order count).
  //     This is a lower-bound approximation since we don't know the exact
  //     time-priority ordering of user vs non-user orders within the level.
  //   - At price levels BEYOND the boundary: stop entirely
  //
  // (Audit fix M5, 2026-03-16; aligned with backend H5, 2026-03-17)
  let selfTradePriceBN = null;
  let userQtyByPrice = null;     // price -> total remaining qty (BigNumber)
  let userRemainingsByPrice = null; // price -> [remaining1, remaining2, ...] (human-readable strings for per-order matching)
  if (userOrders && pair) {
    const oppositeSide = side === 'buy' ? 'sell' : 'buy';
    const userOppositeOrders = userOrders.filter(
      (o) => o.pair === pair && o.side === oppositeSide && ['open', 'partially_filled'].includes(o.status)
        && new BigNumber(o.quantity).minus(o.filledQuantity || '0').gt(0)
    );
    if (userOppositeOrders.length > 0) {
      // Build map of user's remaining quantity at each price (aggregate + individual)
      userQtyByPrice = new Map();
      userRemainingsByPrice = new Map();
      for (const o of userOppositeOrders) {
        const remaining = new BigNumber(o.quantity).minus(o.filledQuantity || '0');
        const priceKey = new BigNumber(o.price).toString();
        const existing = userQtyByPrice.get(priceKey) || new BigNumber(0);
        userQtyByPrice.set(priceKey, existing.plus(remaining));
        // Track individual remaining quantities for per-order size matching at
        // self-trade boundary levels. (Audit fix L2, 2026-03-17)
        if (!userRemainingsByPrice.has(priceKey)) {userRemainingsByPrice.set(priceKey, []);}
        userRemainingsByPrice.get(priceKey).push(remaining.toString());
      }
      // Best (first-encountered) self-trade price determines the boundary.
      // For buy side (walking asks ASC): user's lowest ask price.
      // For sell side (walking bids DESC): user's highest bid price.
      // Use reduce instead of BigNumber.min/max(...spread) to avoid creating
      // a large argument list for users with many opposite-side orders.
      // (Audit fix L2, 2026-03-18)
      const userPrices = userOppositeOrders.map((o) => new BigNumber(o.price));
      selfTradePriceBN = userPrices.reduce((best, p) =>
        (side === 'buy' ? (p.lt(best) ? p : best) : (p.gt(best) ? p : best)),
        userPrices[0],
      );
    }
  }

  // Fee rate from backend config (delivered via exchange_config socket event).
  // Falls back to 0.2% if config hasn't arrived yet — matches current backend default.
  const TAKER_FEE_RATE = new BigNumber(clobFees?.takerFeeRate || '0.002');

  // Depth values are human-readable. Convert to whole units for integer math
  // matching the backend's per-level rounding behavior.
  // baseDp is always outputDp for buy, inputDp for sell.
  const baseDp = side === 'buy' ? outputDp : inputDp;

  const maxFillTotal = clobFees?.maxFillTotal || DEFAULT_MAX_CLOB_FILL_TOTAL;

  let remainingInput = new BigNumber(amountIn); // already in whole units
  let totalNetOutput = new BigNumber(0);
  // totalRowsExamined tracks ALL orders walked (including dust-skipped), matching
  // the backend's totalRowsLocked counter in fillFromOrderBook.mjs which counts
  // all rows locked FOR UPDATE regardless of whether they produce a fill. Without
  // this, the simulation could walk more orders than the backend allows, overstating
  // CLOB output when many orders are dust-skipped. (Audit fix M4, 2026-03-17)
  let totalRowsExamined = 0;
  // Track cumulative per-order sizes received. The backend's getDepthSnapshot
  // caps per-order sizes at MAX_CLOB_FILL_TOTAL across all levels (the
  // `totalOrderSizesEmitted` counter in OrderBook.getDepthSnapshot). Once this
  // cap is reached, subsequent levels have no perOrderSizes and the frontend
  // falls back to equal-split. This is slightly less accurate for deep books
  // but matches the backend's fill behavior: it won't lock more than
  // MAX_CLOB_FILL_TOTAL orders anyway, so the missing per-order data is
  // beyond the simulation boundary. (Audit fix L5, 2026-03-17)
  let cumulativePerOrderSizesReceived = 0;
  // Track whether the simulation used the equal-split fallback for any level.
  // When true, the estimate may diverge from actual execution because equal-
  // splitting assumes uniform order sizes, which can differ significantly from
  // reality. The caller can use this to display a lower-confidence indicator.
  // (Audit fix M4, 2026-03-17)
  let usedEqualSplitFallback = false;
  // Track how much of the total output came from equal-split fallback levels
  // (no per-order sizes). When this fraction is high, the estimate may diverge
  // significantly from actual execution. The caller can use this to display a
  // quantitative confidence metric. (Audit fix M3, 2026-03-18)
  let fallbackOutput = new BigNumber(0);

  // Price deviation guard: track the first (best) fill price to detect
  // catastrophic slippage through stale or manipulated deep-book orders.
  // (Audit fix M6, 2026-03-17 — aligned with backend)
  let bestFillPrice = null;

  // Cumulative rounding trackers: instead of rounding each fill independently
  // (which causes sum(ceil) > ceil(sum) drift), track the cumulative exact quote
  // amount and derive each fill's integer consumption from the delta between
  // consecutive cumulative ceils. Matches backend fillFromOrderBook.mjs logic.
  //
  // NOTE: The backend also tracks per-maker cumulative rounding (makerCumulativeExact)
  // for maker lock accounting. We intentionally omit that here because it only affects
  // how much locked balance each maker loses — it does NOT affect taker output or
  // input consumed. The taker-side tracker below is sufficient for estimation.
  let cumulativeExactQuote = new BigNumber(0);
  let prevCumulativeCeil = new BigNumber(0);

  for (const level of levels) {
    if (remainingInput.lte(0)) {break;}

    const [priceStr, qtyStr, orderCount, ...perOrderSizes] = level;

    const levelOrders = orderCount || 1;
    // NOTE: Order count cap is now checked per-order inside the inner loop
    // (audit fix M1, 2026-03-16) to match backend behavior. The backend fills
    // individual orders up to MAX_CLOB_FILL_TOTAL — it doesn't skip an entire
    // level when the level's order count would exceed the cap. The previous
    // per-level check understated CLOB output when a large level straddled
    // the cap boundary.
    const priceHuman = new BigNumber(priceStr);

    // Self-trade prevention: levels beyond the user's best opposite order
    // are unreachable (the backend stops at the user's own order).
    // At the boundary level, subtract the user's own quantity and order count —
    // the backend fills non-user orders at the same price before encountering
    // the user's. (Audit fix M5, 2026-03-16; aligned H5, 2026-03-17)
    let isSelfTradeLevel = false;
    if (selfTradePriceBN) {
      if (side === 'buy' && priceHuman.gt(selfTradePriceBN)) {break;}
      if (side === 'sell' && priceHuman.lt(selfTradePriceBN)) {break;}
      isSelfTradeLevel = priceHuman.eq(selfTradePriceBN);
    }
    let qtyHuman = new BigNumber(qtyStr);
    if (isSelfTradeLevel && userQtyByPrice) {
      const userQty = userQtyByPrice.get(priceHuman.toString());
      if (userQty && userQty.gt(0)) {
        qtyHuman = qtyHuman.minus(userQty);
        if (qtyHuman.lte(0)) {break;} // entire level is user's orders
      }
    }
    // Guard against NaN/non-finite values from corrupted socket payloads.
    // BigNumber(NaN).lte(0) returns false, so NaN would silently propagate
    // through all downstream arithmetic — corrupting totalNetOutput and
    // bypassing the final lte(0) return check. Explicit NaN/finite guards
    // match backend matchingEngine.mjs:133. (Audit fix H1, 2026-03-18)
    if (priceHuman.isNaN() || !priceHuman.isFinite() || priceHuman.lte(0)
      || qtyHuman.isNaN() || !qtyHuman.isFinite() || qtyHuman.lte(0)) {continue;}

    // Price deviation guard (audit fix M6, 2026-03-17):
    // Matches backend fillFromOrderBook.mjs — if the current level's price
    // deviates by more than MAX_PRICE_DEVIATION from the best (first) fill
    // price, stop filling. For buy side (asks sorted ASC), later levels have
    // higher price (worse for buyer). For sell side (bids sorted DESC), later
    // levels have lower price (worse for seller).
    if (!bestFillPrice) {
      bestFillPrice = priceHuman;
    } else {
      const deviation = side === 'buy'
        ? priceHuman.div(bestFillPrice)
        : bestFillPrice.div(priceHuman);
      if (deviation.gt(MAX_PRICE_DEVIATION)) {break;}
    }

    // Convert level values to whole units (matching backend representation)
    // price_whole = price_human * 10^quoteDp where quoteDp = (buy ? inputDp : outputDp)
    const quoteDp = side === 'buy' ? inputDp : outputDp;
    const makerPrice = priceHuman.shiftedBy(quoteDp); // price in whole units
    const levelQty = qtyHuman.shiftedBy(baseDp);       // quantity in base whole units

    // quoteAmount = fillQty * makerPrice / 10^baseDp (backend formula)
    const quoteForLevel = (qty) => qty.times(makerPrice).shiftedBy(-baseDp);

    // Build per-order quantities for this level.
    // When the backend provides actual per-order sizes (indices 3+ in the depth
    // entry), use them for accurate fill simulation. Otherwise, fall back to
    // equal-size splitting (less accurate but backwards-compatible).
    //
    // Self-trade boundary levels (aligned with backend, audit fix H5, 2026-03-17):
    // The backend walks orders in price-time priority and stops at the FIRST
    // user order encountered. At the boundary level, it fills non-user orders
    // that appear before the user's order. We approximate this by using the
    // adjusted level quantity (qtyHuman, already reduced by the user's quantity
    // above) and distributing it across the non-user order count. This is a
    // lower-bound estimate (assumes user orders are interspersed, not at the
    // end), but more accurate than the previous approach which skipped the
    // entire level.
    const ordersAtLevel = levelOrders;

    // Count of user's orders at this price (for boundary level order count adjustment)
    let userOrderCountAtLevel = 0;
    if (isSelfTradeLevel && userOrders && pair) {
      const oppositeSide = side === 'buy' ? 'sell' : 'buy';
      userOrderCountAtLevel = userOrders.filter(
        (o) => o.pair === pair && o.side === oppositeSide
          && ['open', 'partially_filled'].includes(o.status)
          && new BigNumber(o.quantity).minus(o.filledQuantity || '0').gt(0)
          && new BigNumber(o.price).eq(priceHuman),
      ).length;
    }
    // Effective non-user order count at this level
    const effectiveOrderCount = isSelfTradeLevel
      ? Math.max(0, ordersAtLevel - userOrderCountAtLevel)
      : ordersAtLevel;

    let orderQuantities;
    // Track whether this level used equal-split so we can attribute its output
    // to the fallback fraction. (Audit fix M3, 2026-03-18)
    let levelUsedFallback = false;
    if (perOrderSizes.length > 0 && perOrderSizes.length === ordersAtLevel) {
      // Validate that per-order sizes sum to the level's total quantity.
      // A corrupted socket payload (MITM, bug) could inject inflated sizes,
      // overstating CLOB output and causing the user to set an unrealistic
      // minAmountOut. Fall back to equal-split on mismatch. (Audit fix H3, 2026-03-18)
      const perOrderSum = perOrderSizes.reduce(
        (acc, s) => acc.plus(new BigNumber(s)), new BigNumber(0),
      );
      // Compare in human-readable space (same as qtyStr) to avoid dp conversion
      const levelQtyHuman = new BigNumber(qtyStr);
      const perOrderSizesValid = perOrderSum.gt(0)
        && perOrderSum.minus(levelQtyHuman).abs().lte(levelQtyHuman.times('0.001').plus(1e-18));

      if (!perOrderSizesValid) {
        // Mismatch — fall back to equal-split for this level
        if (perOrderSum.gt(0)) {
          console.warn(
            `simulateClobFill: perOrderSizes sum (${perOrderSum.toString()}) does not match `
            + `level qty (${qtyStr}) at price ${priceStr} — falling back to equal split`,
          );
        }
        const splitCount = isSelfTradeLevel ? effectiveOrderCount : ordersAtLevel;
        if (splitCount <= 0 || levelQty.lte(0)) {
          orderQuantities = [];
        } else {
          const perOrderQty = levelQty.div(splitCount).integerValue(BigNumber.ROUND_DOWN);
          const lastOrderQty = levelQty.minus(perOrderQty.times(splitCount - 1));
          orderQuantities = [];
          for (let i = 0; i < splitCount; i += 1) {
            orderQuantities.push(i < splitCount - 1 ? perOrderQty : lastOrderQty);
          }
          usedEqualSplitFallback = true;
          levelUsedFallback = true;
        }
      } else {
        // Per-order sizes are valid — use them
        cumulativePerOrderSizesReceived += perOrderSizes.length;
        if (!isSelfTradeLevel) {
          // Non-boundary level: use per-order sizes directly
          orderQuantities = perOrderSizes.map((s) => new BigNumber(s).shiftedBy(baseDp));
        } else {
          // Self-trade boundary level: the backend walks orders in price-time
          // priority and stops at the FIRST user order encountered. We have
          // per-order sizes but don't know their exact time-priority position.
          //
          // Strategy (audit fix L2, 2026-03-17): When individual user order
          // remaining quantities are available, greedily remove matching entries
          // from the per-order size list. This preserves actual non-user order
          // sizes instead of falling back to equal-split, producing a tighter
          // estimate. The match is by quantity value (human-readable string
          // comparison) — if a user order's remaining quantity matches a per-order
          // size, it's likely that entry. Multiple user orders at the same price
          // are handled by consuming one match per user order.
          //
          // KNOWN LIMITATION (audit fix L4, 2026-03-18): This greedy matching
          // is lossy — if a non-user order has the same remaining quantity as a
          // user order, the non-user order could be incorrectly removed from the
          // simulation, understating available liquidity at the self-trade
          // boundary level. This produces a LOWER-BOUND estimate, which is
          // conservative (the user may receive more than estimated, not less).
          // The backend has exact per-order userId knowledge and does not share
          // this limitation. No fix is possible without the backend exposing
          // per-order userId data in the depth snapshot (which would leak
          // trading activity). Accept as inherent estimation approximation.
          const userRemainings = (userRemainingsByPrice && userRemainingsByPrice.get(priceHuman.toString())) || [];
          if (userRemainings.length > 0) {
            // Build a consumable multiset of user remaining quantities
            const userQtyBag = new Map(); // qty string -> count remaining to remove
            for (const uqty of userRemainings) {
              userQtyBag.set(uqty, (userQtyBag.get(uqty) || 0) + 1);
            }
            // Filter per-order sizes: keep entries that don't match a user order.
            //
            // IMPROVEMENT (audit fix M6, 2026-03-18): Track how many entries were
            // removed by greedy matching. If any were removed, flag as low-confidence
            // because a non-user order with the same remaining quantity could have
            // been incorrectly excluded (understating available liquidity). This is
            // a LOWER-BOUND estimate — conservative for the user.
            const filteredSizes = [];
            let greedyMatchCount = 0;
            for (const s of perOrderSizes) {
              const remaining = userQtyBag.get(s) || 0;
              if (remaining > 0) {
                // This per-order size matches a user order — remove it
                userQtyBag.set(s, remaining - 1);
                greedyMatchCount += 1;
              } else {
                filteredSizes.push(s);
              }
            }
            orderQuantities = filteredSizes.map((s) => new BigNumber(s).shiftedBy(baseDp));
            // If greedy matching removed entries, flag low confidence: a non-user
            // order with an identical remaining quantity may have been incorrectly
            // excluded. The estimate is still conservative (lower-bound).
            if (greedyMatchCount > 0) {
              usedEqualSplitFallback = true;
              levelUsedFallback = true;
            }
          } else {
            // No individual user remainders available — fall back to equal-split
            if (effectiveOrderCount <= 0 || levelQty.lte(0)) {
              orderQuantities = [];
            } else {
              const perOrderQty = levelQty.div(effectiveOrderCount).integerValue(BigNumber.ROUND_DOWN);
              const lastOrderQty = levelQty.minus(perOrderQty.times(effectiveOrderCount - 1));
              orderQuantities = [];
              for (let i = 0; i < effectiveOrderCount; i += 1) {
                orderQuantities.push(i < effectiveOrderCount - 1 ? perOrderQty : lastOrderQty);
              }
              usedEqualSplitFallback = true;
              levelUsedFallback = true;
            }
          }
        }
      }
    } else {
      // No per-order sizes available for this level. Three scenarios:
      //
      //   1. The backend's per-order size cap (MAX_CLOB_FILL_TOTAL) was exceeded —
      //      cumulativePerOrderSizesReceived >= maxFillTotal. The backend won't lock
      //      more orders anyway, so stop simulating entirely. Previously the frontend
      //      used equal-split which diverged from real per-order fills, causing
      //      estimation errors and minAmountOut rejections. (Audit fix M3, 2026-03-17)
      //
      //   2. perOrderSizes length doesn't match orderCount — data inconsistency.
      //      Fall back to equal split for this level only (rare edge case).
      //
      //   3. No perOrderSizes provided at all (older backend or non-includeOrderSizes
      //      depth). Fall back to equal split for all levels (backwards-compatible).
      //
      // Scenario 1 is the common case — once we've consumed all per-order data from
      // the backend, further simulation is beyond the backend's fill boundary and
      // would produce divergent estimates.
      //
      // STRANDED DUST NOTE (audit fix M1, 2026-03-18): The backend's getDepthSnapshot
      // filters permanently stranded dust orders (orders whose full remaining quantity
      // produces zero quote transfer) via a pre-computed `_stranded` flag on each
      // OrderBook entry. This flag is set when _baseDp is provided to the OrderBook
      // constructor, which is always the case (orderBookCache.getOrCreate resolves
      // baseDp from the pair). Therefore, stranded orders should NOT appear in the
      // depth data received via socket. If a legacy backend omits the filter (no
      // _baseDp), the equal-split fallback here may overstate CLOB output for levels
      // containing stranded dust — the usedEqualSplitFallback flag below signals
      // lower confidence to the UI.
      if (cumulativePerOrderSizesReceived > 0 && cumulativePerOrderSizesReceived >= maxFillTotal) {
        // Per-order data exhausted: we've reached the backend's fill cap.
        // Stop simulating — any remaining levels are beyond what the backend
        // will actually fill. This aligns the frontend estimate with the
        // backend's MAX_CLOB_FILL_TOTAL boundary. (Audit fix M3, 2026-03-17)
        break;
      }
      if (perOrderSizes.length > 0 && perOrderSizes.length !== ordersAtLevel) {
        console.warn(`simulateClobFill: perOrderSizes length (${perOrderSizes.length}) does not match orderCount (${ordersAtLevel}) at price ${priceStr} — falling back to equal split`);
      }
      // Use effectiveOrderCount for self-trade boundary levels (adjusted for
      // user's orders), ordersAtLevel otherwise. (Audit fix H5, 2026-03-17)
      const splitCount = isSelfTradeLevel ? effectiveOrderCount : ordersAtLevel;
      if (splitCount <= 0 || levelQty.lte(0)) {
        orderQuantities = [];
      } else {
        const perOrderQty = levelQty.div(splitCount).integerValue(BigNumber.ROUND_DOWN);
        const lastOrderQty = levelQty.minus(perOrderQty.times(splitCount - 1));
        orderQuantities = [];
        for (let i = 0; i < splitCount; i += 1) {
          orderQuantities.push(i < splitCount - 1 ? perOrderQty : lastOrderQty);
        }
        usedEqualSplitFallback = true; // (Audit fix M4, 2026-03-17)
        levelUsedFallback = true;
      }
    }

    // Use orderQuantities.length (not ordersAtLevel) since self-trade
    // filtering may have reduced the number of orders. (Audit fix M3, 2026-03-17)
    for (let orderIdx = 0; orderIdx < orderQuantities.length; orderIdx += 1) {
      if (remainingInput.lte(0)) {break;}
      // Per-order cap: matches backend's FOR UPDATE LIMIT across all batches.
      // Stranded dust orders (whose remaining qty produces zero quote) are NOT
      // excluded here — they count against the cap, matching the backend fill
      // loop which fetches them via FOR UPDATE before the dust-fill `continue`.
      // The backend auto-cancels stranded orders within the same transaction
      // and removes them from the in-memory book in afterCommit, so subsequent
      // depth snapshots won't include them. (Audit review H3, 2026-03-17)
      // (Audit fix M1, 2026-03-16)
      totalRowsExamined += 1;
      if (totalRowsExamined > maxFillTotal) {break;}

      const makerQty = orderQuantities[orderIdx];
      // Guard against NaN/non-finite values from corrupted socket payloads.
      // BigNumber(NaN).lte(0) returns false, so NaN would silently propagate
      // through all downstream arithmetic — producing a NaN amountOut that
      // accidentally bypasses the final lte(0) check. Explicit NaN/finite
      // check ensures corrupted entries are skipped cleanly.
      // (Audit fix H3, 2026-03-18)
      if (!makerQty || makerQty.isNaN() || !makerQty.isFinite() || makerQty.lte(0)) {continue;}

      let fillQty;
      let inputConsumed;

      if (side === 'buy') {
        // User spends quote (input) whole units, receives base (output) whole units.
        // maxBuyable = remainingInput * 10^baseDp / makerPrice (ROUND_DOWN — conservative for taker)
        const maxBuyable = remainingInput.times(new BigNumber(10).pow(baseDp)).div(makerPrice).integerValue(BigNumber.ROUND_DOWN);
        fillQty = BigNumber.min(maxBuyable, makerQty);
        if (fillQty.lte(0)) {break;}
        // Dust-fill guard: skip fills where the quote transfer rounds to zero.
        // Uses `continue` (not `break`) to allow subsequent orders with larger
        // quantities to produce valid fills — aligned with backend
        // fillFromOrderBook.mjs and placeOrder.mjs. (Audit fix M1, 2026-03-17)
        const quoteAmountExact = quoteForLevel(fillQty);
        const quoteAmountFloor = quoteAmountExact.integerValue(BigNumber.ROUND_DOWN);
        if (quoteAmountFloor.lte(0)) {continue;}
        // Cumulative ceil: derive this fill's cost from the delta between consecutive ceils
        cumulativeExactQuote = cumulativeExactQuote.plus(quoteAmountExact);
        const currentCumulativeCeil = cumulativeExactQuote.integerValue(BigNumber.ROUND_UP);
        inputConsumed = currentCumulativeCeil.minus(prevCumulativeCeil);
        prevCumulativeCeil = currentCumulativeCeil;
      } else {
        // User spends base (input) whole units, receives quote (output) whole units.
        fillQty = BigNumber.min(remainingInput, makerQty);
        if (fillQty.lte(0)) {break;}
        inputConsumed = fillQty;
      }

      // Per-order output and fee (matching backend per-fill deduction)
      const outputThisFill = side === 'buy'
        ? fillQty // taker receives base whole units
        : quoteForLevel(fillQty).integerValue(BigNumber.ROUND_DOWN); // taker receives quote whole units

      // Dust-fill guard for sell side: quote amount rounds to zero at this price.
      // Uses `continue` to allow subsequent orders to produce valid fills —
      // aligned with backend fillFromOrderBook.mjs. (Audit fix M1, 2026-03-17)
      if (outputThisFill.lte(0)) {continue;}

      const takerFee = calculateClobFee(outputThisFill, TAKER_FEE_RATE);
      const netOutput = outputThisFill.minus(takerFee);

      totalNetOutput = totalNetOutput.plus(netOutput);
      if (levelUsedFallback) {fallbackOutput = fallbackOutput.plus(netOutput);}
      remainingInput = remainingInput.minus(inputConsumed);
    }

    // After filling at the self-trade boundary level, stop — the backend
    // would encounter the user's own order here and halt further fills.
    if (isSelfTradeLevel) {break;}
    // If per-order cap was hit inside the inner loop, stop outer loop too.
    if (totalRowsExamined > maxFillTotal) {break;}
  }

  // Final NaN guard: if any corrupted level bypassed per-level validation
  // (e.g., a NaN intermediate value from BigNumber arithmetic edge cases),
  // the accumulated totalNetOutput could be NaN. BigNumber(NaN).lte(0)
  // returns false, so the check below would NOT catch it — returning
  // { amountOut: NaN } to the caller. (Audit fix H1, 2026-03-18)
  if (totalNetOutput.isNaN() || !totalNetOutput.isFinite() || totalNetOutput.lte(0)) {return null;}

  // totalNetOutput is already in output whole units — return directly
  // inputUsed = total input consumed in whole units (amountIn - remainingInput)
  const inputUsed = new BigNumber(amountIn).minus(remainingInput);
  // fallbackFraction: proportion of total net output that came from equal-split
  // levels (no per-order sizes). 0 = fully accurate, 1 = entirely estimated.
  // The caller can use this to display a quantitative confidence metric.
  // (Audit fix M3, 2026-03-18)
  const fallbackFraction = totalNetOutput.gt(0)
    ? fallbackOutput.div(totalNetOutput).toNumber()
    : 0;
  return { amountOut: totalNetOutput, inputUsed, remainingInput, usedEqualSplitFallback, fallbackFraction, totalRowsExamined };
};

/**
 * Derive canonical pair and side for CLOB lookup from a hop step.
 * @param {string} fromTicker
 * @param {string} toTicker
 * @returns {{ pair: string, side: 'buy'|'sell' }}
 */
// Default ticker regex — used as fallback until the backend delivers the
// authoritative pattern via exchange_config. Callers pass the backend's
// pattern via clobFees.tickerPattern when available (single source of truth).
// (Audit fix L1, 2026-03-18; replaces hardcoded duplicate M7, 2026-03-18)
const DEFAULT_TICKER_PATTERN = /^[A-Z0-9]{1,20}$/;

// Cache compiled RegExp per pattern string to avoid re-compilation per call.
// Capped at 20 entries to prevent unbounded growth if a compromised socket
// delivers many unique patterns. (Audit fix M3, 2026-03-19)
const _tickerReCache = new Map();
const MAX_TICKER_RE_CACHE_SIZE = 20;
function getTickerRe(pattern) {
  if (!pattern) {return DEFAULT_TICKER_PATTERN;}
  let cached = _tickerReCache.get(pattern);
  if (!cached) {
    try {
      cached = new RegExp(pattern);
    } catch {
      cached = DEFAULT_TICKER_PATTERN;
    }
    if (_tickerReCache.size >= MAX_TICKER_RE_CACHE_SIZE) {
      const oldestKey = _tickerReCache.keys().next().value;
      _tickerReCache.delete(oldestKey);
    }
    _tickerReCache.set(pattern, cached);
  }
  return cached;
}

/**
 * Derive CLOB pair and side from a hop step.
 * Uses the admin-defined market direction from the markets lookup (if provided),
 * falling back to alphabetical sorting for backward compatibility.
 *
 * @param {string} fromTicker
 * @param {string} toTicker
 * @param {string|null} tickerPattern - Regex pattern for ticker validation
 * @param {Object|null} marketsLookup - Map of sorted coin key → market object from Redux
 * @param {Array|null} coins - Coins array for ID resolution when using marketsLookup
 * @returns {{ pair: string, side: 'buy'|'sell' }|null}
 */
const deriveClobPairAndSide = (fromTicker, toTicker, tickerPattern = null, marketsLookup = null, coins = null) => {
  const TICKER_RE = getTickerRe(tickerPattern);
  const from = fromTicker.toUpperCase();
  const to = toTicker.toUpperCase();
  if (!TICKER_RE.test(from) || !TICKER_RE.test(to) || from === to) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`deriveClobPairAndSide: invalid tickers "${fromTicker}" / "${toTicker}" — CLOB estimation skipped`);
    }
    return null;
  }

  // Try to resolve from admin-defined markets
  if (marketsLookup && coins) {
    const fromCoin = coins.find((c) => c.ticker.toUpperCase() === from);
    const toCoin = coins.find((c) => c.ticker.toUpperCase() === to);
    if (fromCoin && toCoin) {
      const key = fromCoin.id < toCoin.id ? `${fromCoin.id}|${toCoin.id}` : `${toCoin.id}|${fromCoin.id}`;
      const market = marketsLookup[key];
      if (market && market.pair) {
        const parts = market.pair.split('-');
        const baseTicker = parts[0];
        // buy = spending quote to get base, sell = spending base to get quote
        const side = from === baseTicker ? 'sell' : 'buy';
        return { pair: market.pair, side };
      }
    }
  }

  // Fallback: alphabetical sorting (backward compatible)
  const [first, second] = [from, to].sort();
  const pair = `${first}-${second}`;
  const side = from === first ? 'buy' : 'sell';
  return { pair, side };
};

// Estimate a single path
export const estimatePath = (pools, path, inputCoin, amountIn, coins, orderbooks = null, userOrders = null, clobFees = null, marketsLookup = null) => {
  // ── Path validation (mirrors backend deriveQueueNamesAndPoolConditions) ──
  // Reject paths that the backend would reject, preventing the user from seeing
  // an estimate for an unsubmittable swap. (Audit fix L4, 2026-03-17)
  if (!path || path.length === 0) {return null;}
  // Max path length: aligned with backend executeSwapCore (swapCore.mjs) which
  // rejects paths longer than 10 hops. Without this, a direct call to
  // estimatePath with a crafted long path would execute without bounds,
  // consuming CPU on the client. (Audit fix M5, 2026-03-18)
  if (path.length > 10) {return null;}
  const usedPairs = new Set();
  for (let i = 0; i < path.length; i += 1) {
    const step = path[i];
    if (!step || typeof step.from !== 'string' || typeof step.to !== 'string') {return null;} // invalid step structure
    if (step.from === step.to) {return null;} // self-pair
    if (i > 0 && step.from !== path[i - 1].to) {return null;} // discontinuous
    const [first, second] = [step.from.toUpperCase(), step.to.toUpperCase()].sort();
    const pairKey = `${first}-${second}`;
    if (usedPairs.has(pairKey)) {return null;} // duplicate pair usage
    usedPairs.add(pairKey);
  }

  let currentAmount = new BigNumber(amountIn).shiftedBy(getDp(inputCoin));
  let currentCoin = inputCoin;
  const intermediateAmounts = [];
  const enrichedPath = []; // Path steps enriched with venue decision
  let updatedPools = [...pools]; // Clone pools to simulate reserve updates
  let clobEstimateLowConfidence = false; // Set when CLOB simulation used equal-split fallback (Audit fix M4, 2026-03-17)
  let spilloverEstimateLowConfidence = false; // Set when CLOB+AMM spillover uses potentially stale pool reserves (Audit fix M4, 2026-03-17)

  // Price impact (Option C — audit fix L6, 2026-03-16):
  // Compute the marginal (spot) rate at each hop — what 1 unit of input would
  // receive at the best available price, before any size-dependent slippage.
  // The compound product of per-hop marginal rates gives the ideal end-to-end
  // rate. Comparing that against the actual rate isolates pure size-dependent
  // price impact, correctly compounding across multi-hop paths without double-
  // counting fees (fees affect both marginal and actual rates equally).
  let compoundMarginalRate = new BigNumber(1); // product of per-hop marginal rates (output-whole / input-whole)

  // Build pool lookup map for O(1) per-hop resolution instead of O(pools) findIndex.
  // Key: sorted "TICKERA-TICKERB" → index in updatedPools array.
  // Rebuilt from updatedPools (not the original pools) so reserve updates from
  // earlier hops are visible to later hops. (Audit fix L2, 2026-03-18)
  const buildPoolLookup = (poolList) => {
    const map = new Map();
    for (let idx = 0; idx < poolList.length; idx += 1) {
      const p = poolList[idx];
      if (!p || !p.coinA || !p.coinB) {continue;}
      const key = [p.coinA.ticker, p.coinB.ticker].sort().join('-');
      map.set(key, idx);
    }
    return map;
  };
  let poolLookup = buildPoolLookup(updatedPools);

  for (let stepIdx = 0; stepIdx < path.length; stepIdx += 1) {
    const step = path[stepIdx];
    const lookupKey = [step.from, step.to].sort().join('-');
    const poolIndex = poolLookup.get(lookupKey) ?? -1;

    const pool = poolIndex !== -1 ? updatedPools[poolIndex] : null;
    // Snapshot pre-hop reserves for marginal rate calculation. The venue
    // selection block below may update updatedPools[poolIndex] (e.g., for
    // CLOB+AMM spillover), which mutates the pool reference. The marginal
    // rate must use pre-hop reserves (the spot rate before this hop
    // executes). (Audit fix M5, 2026-03-18)
    const preHopReserveA = pool ? pool.reserveA : null;
    const preHopReserveB = pool ? pool.reserveB : null;
    const outputCoin = coins.find((c) => c.ticker === step.to);
    if (!outputCoin) {return null;}

    const currentCoinDp = getDp(currentCoin);
    const outputCoinDp = getDp(outputCoin);
    const smallestUnit = new BigNumber(1).shiftedBy(-currentCoinDp);
    if (new BigNumber(currentAmount).shiftedBy(-currentCoinDp).lt(smallestUnit)) {
      return null;
    }

    // Cap intermediate amounts to prevent excessive BigNumber arithmetic from
    // hanging the client. Matches the backend's 1e25 whole-unit cap in
    // fillFromOrderBook.mjs and placeOrder.mjs. An extreme intermediate amount
    // (from a manipulated pool reserve in the socket payload) could cause
    // BigNumber operations to take excessive time. (Audit fix M12, 2026-03-18)
    const MAX_INTERMEDIATE_WHOLE = new BigNumber('1e30');
    if (new BigNumber(currentAmount).gt(MAX_INTERMEDIATE_WHOLE)) {
      return null;
    }

    // For intermediate hops, validate against per-coin swap minimum input.
    // The backend rejects swaps where any intermediate amount is below the
    // coin's swapMinimumInput. Checking here prevents showing an estimate
    // that would be rejected on submission. (Audit fix S7, 2026-03-16)
    if (stepIdx > 0 && currentCoin.swapMinimumInput) {
      const swapMin = new BigNumber(currentCoin.swapMinimumInput);
      const currentAmountHuman = new BigNumber(currentAmount).shiftedBy(-currentCoinDp);
      if (swapMin.gt(0) && currentAmountHuman.lt(swapMin)) {
        return null;
      }
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
    let clobResult = null;
    if (orderbooks) {
      const clobPairInfo = deriveClobPairAndSide(step.from, step.to, clobFees?.tickerPattern, marketsLookup, coins);
      if (clobPairInfo) {
        const { pair: clobPair, side: clobSide } = clobPairInfo;
        const depth = orderbooks[clobPair];
        if (depth) {
          clobResult = simulateClobFill(depth, clobSide, currentAmount, currentCoinDp, outputCoinDp, userOrders, clobPair, clobFees);
          if (clobResult && clobResult.amountOut.gt(0)) {
            clobOut = clobResult.amountOut;
            if (clobResult.usedEqualSplitFallback) {clobEstimateLowConfidence = true;}
          }
        }
      }
    }

    // Pick best venue, with CLOB+AMM spillover support.
    // The backend (swapCore.mjs) can split a first-hop across CLOB and AMM when
    // CLOB only partially fills the input. We simulate this here:
    // 1. If CLOB gives better output AND fully consumes input → pure CLOB
    // 2. If CLOB gives better output but partially fills → CLOB output + AMM on remainder
    // 3. Otherwise → pure AMM (or pure CLOB if no pool)
    let amountOutBN;
    let venue;
    if (ammOut && clobOut) {
      // Check if CLOB fully consumed the input
      const clobFullyFilled = clobResult && clobResult.remainingInput && clobResult.remainingInput.lte(0);

      if (clobOut.gt(ammOut)) {
        // CLOB is better — use it
        if (clobFullyFilled) {
          amountOutBN = clobOut;
          venue = 'clob';
        } else if (pool && pool.runesCompliant && clobResult.remainingInput.gt(0)) {
          // CLOB partial fill + AMM spillover: the backend handles this for all
          // hops (swapCore.mjs routes the unconsumed CLOB remainder through AMM
          // at every hop, not just the first). (Comment corrected, audit fix M6, 2026-03-17)
          const isCoinAInput = pool.coinA.ticker === step.from;
          const remainderResult = simulateSwap(pool, currentCoin, clobResult.remainingInput, isCoinAInput);
          if (remainderResult && remainderResult.amountOut.gt(0)) {
            // Apply a conservative 1% discount to the AMM spillover portion.
            // The AMM remainder estimate uses pool reserves from the last socket
            // update, which may be stale by seconds. In volatile markets this can
            // cause the combined estimate to diverge from actual execution (where
            // the backend uses reserves locked FOR UPDATE). The discount prevents
            // the user's derived minAmountOut from being set too aggressively,
            // reducing slippage failures on execution.
            // (Audit fix M1, 2026-03-18; supplements M4 low-confidence flag)
            const spilloverDiscount = new BigNumber('0.99');
            const discountedAmmOut = remainderResult.amountOut.times(spilloverDiscount).integerValue(BigNumber.ROUND_DOWN);
            amountOutBN = clobOut.plus(discountedAmmOut);
            venue = 'clob+amm';
            spilloverEstimateLowConfidence = true;
            updatedPools[poolIndex] = remainderResult.updatedPool;
          } else {
            // AMM can't handle remainder — compare pure CLOB (partial) vs pure AMM (full)
            if (clobOut.gt(ammOut)) {
              // Even partial CLOB beats full AMM — but backend would reject on
              // intermediate hops. For first hop, backend also rejects if no pool.
              // Use AMM as it processes the full amount.
              amountOutBN = ammOut;
              venue = 'amm';
              updatedPools[poolIndex] = swapResult.updatedPool;
            } else {
              amountOutBN = ammOut;
              venue = 'amm';
              updatedPools[poolIndex] = swapResult.updatedPool;
            }
          }
        } else {
          // Partial CLOB fill, no pool for spillover — pure CLOB still better
          // Note: backend would reject this on first hop without a pool, but for
          // estimation we show the best possible output. The actual execution will
          // fail with an appropriate error if liquidity is insufficient.
          amountOutBN = clobOut;
          venue = 'clob';
        }
      } else {
        amountOutBN = ammOut;
        venue = 'amm';
        updatedPools[poolIndex] = swapResult.updatedPool;
      }
    } else if (ammOut) {
      amountOutBN = ammOut;
      venue = 'amm';
      updatedPools[poolIndex] = swapResult.updatedPool;
    } else if (clobOut) {
      amountOutBN = clobOut;
      venue = 'clob';
    } else {
      return null; // No liquidity from either venue
    }

    // ── Per-hop marginal rate for price impact (audit fix L6) ──
    // Compute the output a hypothetically tiny trade would receive at the
    // current spot/best price. This is the "zero-size" rate — the rate before
    // any size-dependent slippage. All values are in whole units so the ratio
    // is unit-consistent across hops regardless of decimal places.
    //
    // AMM: marginal rate = reserveOut / reserveIn (constant-product spot price,
    //   already accounts for fee structure since fees are deducted from input
    //   before the x*y=k calculation — a tiny trade has the same fee rate).
    // CLOB: marginal rate = output from 1 unit at best price level (with fees).
    //   For buy: 1 quote-whole buys (10^baseDp / bestPrice) base-whole.
    //   For sell: 1 base-whole receives (bestPrice / 10^baseDp) quote-whole.
    //   Taker fee is deducted from output, matching the actual fill path.
    let hopMarginalRate = null;

    if (pool && pool.runesCompliant && (venue === 'amm' || venue === 'clob+amm')) {
      // AMM marginal rate from pre-hop reserves. Uses the snapshotted values
      // captured BEFORE venue selection (preHopReserveA/B) so that CLOB+AMM
      // spillover — which updates updatedPools[poolIndex] — cannot affect the
      // marginal rate computation. The marginal rate should reflect the spot
      // price BEFORE this hop executes, not after partial reserve consumption.
      // (Audit fix M5, 2026-03-18)
      const isCoinAInput = pool.coinA.ticker === step.from;
      const reserveA = new BigNumber(preHopReserveA);
      const reserveB = new BigNumber(preHopReserveB);
      if (!reserveA.isZero() && !reserveB.isZero()) {
        // Marginal rate in output-whole per input-whole (after fees)
        const totalFeeRate = new BigNumber(pool.lpFeeRate).plus(pool.treasuryFeeRate).div(100);
        const feeMultiplier = new BigNumber(1).minus(totalFeeRate);
        hopMarginalRate = isCoinAInput
          ? reserveB.div(reserveA).times(feeMultiplier)
          : reserveA.div(reserveB).times(feeMultiplier);
      }
    }

    if ((venue === 'clob' || venue === 'clob+amm') && !hopMarginalRate) {
      // CLOB-only or CLOB+AMM where pool is missing: use best price level
      const marginalClobInfo = deriveClobPairAndSide(step.from, step.to, clobFees?.tickerPattern, marketsLookup, coins);
      const depth = marginalClobInfo && orderbooks && orderbooks[marginalClobInfo.pair];
      const clobSide = marginalClobInfo?.side;
      if (depth) {
        const clobLevels = clobSide === 'buy' ? (depth.asks || []) : (depth.bids || []);
        if (clobLevels.length > 0) {
          const bestPriceHuman = new BigNumber(clobLevels[0][0]);
          if (bestPriceHuman.gt(0)) {
            const TAKER_FEE_RATE = new BigNumber(clobFees?.takerFeeRate || '0.002');
            const feeMultiplier = new BigNumber(1).minus(TAKER_FEE_RATE);
            if (clobSide === 'buy') {
              // 1 quote-whole → (10^baseDp / bestPrice_whole) base-whole, after fee
              // bestPrice_whole = bestPriceHuman * 10^quoteDp where quoteDp = inputDp
              const bestPriceWhole = bestPriceHuman.shiftedBy(currentCoinDp);
              hopMarginalRate = new BigNumber(10).pow(outputCoinDp).div(bestPriceWhole).times(feeMultiplier);
            } else {
              // 1 base-whole → (bestPrice_whole / 10^baseDp) quote-whole, after fee
              // bestPrice_whole = bestPriceHuman * 10^quoteDp where quoteDp = outputDp
              const bestPriceWhole = bestPriceHuman.shiftedBy(outputCoinDp);
              hopMarginalRate = bestPriceWhole.div(new BigNumber(10).pow(currentCoinDp)).times(feeMultiplier);
            }
          }
        }
      }
    }

    if (hopMarginalRate && hopMarginalRate.gt(0) && hopMarginalRate.isFinite()) {
      compoundMarginalRate = compoundMarginalRate.times(hopMarginalRate);
    }

    // venueHint is sent to the backend as step.venue — must be 'amm' or 'clob'.
    // For 'clob+amm' (spillover), hint 'clob' so the backend tries CLOB first
    // and its own spillover logic routes the remainder through AMM.
    const venueHint = venue === 'clob+amm' ? 'clob' : venue;

    enrichedPath.push({
      from: step.from,
      to: step.to,
      venue: venueHint,
      venueDisplay: venue, // preserved for UI display (e.g. "CLOB+AMM")
      output: amountOutBN.shiftedBy(-outputCoinDp).toString(),
    });

    currentAmount = amountOutBN;
    currentCoin = outputCoin;
    if (step !== path[path.length - 1]) {
      intermediateAmounts.push({
        ticker: step.to,
        amount: currentAmount.shiftedBy(-outputCoinDp).toString(),
      });
    }
  }

  const outputCoin = coins.find((c) => c.ticker === path[path.length - 1].to);
  const outputCoinDp = getDp(outputCoin);
  if (
    new BigNumber(currentAmount)
      .shiftedBy(-outputCoinDp)
      .lt(new BigNumber(1).shiftedBy(-outputCoinDp))
  ) {
    return null;
  }

  // End-to-end price impact (audit fix L6, 2026-03-16):
  // Compare the actual execution rate against the compound marginal (spot) rate.
  // actualRate = totalOutput / totalInput (in whole units)
  // marginalRate = compoundMarginalRate (product of per-hop spot rates)
  // priceImpact = 1 - (actualRate / marginalRate)
  //
  // This correctly captures compounding across multi-hop paths, handles mixed
  // AMM+CLOB venues uniformly, and isolates size-dependent slippage from fees
  // (fees are present in both the marginal and actual rates, so they cancel out).
  let priceImpact = 0;
  const inputWhole = new BigNumber(amountIn).shiftedBy(getDp(inputCoin));
  if (inputWhole.gt(0) && compoundMarginalRate.gt(0) && compoundMarginalRate.isFinite()) {
    const actualRate = currentAmount.div(inputWhole);
    const impactRatio = actualRate.div(compoundMarginalRate);
    // 1 - impactRatio: positive means user gets less than spot (normal slippage)
    const impact = new BigNumber(1).minus(impactRatio).toNumber();
    if (Number.isFinite(impact) && impact >= 0) {
      priceImpact = impact;
    }
  }

  return {
    amountOut: currentAmount,
    priceImpact,
    intermediateAmounts,
    updatedPools,
    enrichedPath,
    ...(clobEstimateLowConfidence ? { clobEstimateLowConfidence: true } : {}),
    ...(spilloverEstimateLowConfidence ? { spilloverEstimateLowConfidence: true } : {}),
  };
};

// Main estimateSwap function
// orderbooks: optional { [pair]: { bids, asks } } for CLOB comparison per hop
export const estimateSwap = (
  inputCoin,
  outputCoin,
  amountIn,
  pools,
  coins,
  maxHops = 6,
  algorithm = 'dfs', // Default to DFS
  orderbooks = null,
  userOrders = null,
  clobFees = null,
  marketsLookup = null,
) => {
  // Validate inputs
  if (!inputCoin || !outputCoin) {
    throw new Error('Input or output coin not provided');
  }
  validatePositiveNumber(amountIn, 'amountIn');
  validatePositiveNumber(maxHops, 'maxHops');
  // Aligned with backend limit: swapCore.mjs rejects paths longer than 10 hops,
  // and the swap route (api/routes/swap/swap.mjs) validates path.length <= 10.
  // Previously 14, which allowed the frontend to display routes the backend
  // would reject on submission. (Audit fix H5, 2026-03-17)
  if (maxHops < 1 || maxHops > 10) {
    throw new Error('Max hops must be between 1 and 10');
  }
  if (!['dfs', 'bfs'].includes(algorithm)) {
    throw new Error('Invalid algorithm: must be "dfs" or "bfs"');
  }

  const inputCoinData = coins.find((c) => c.ticker === inputCoin.ticker);
  const outputCoinData = coins.find((c) => c.ticker === outputCoin.ticker);
  if (!inputCoinData || !outputCoinData) {
    throw new Error(`Coin not found: ${inputCoin.ticker} or ${outputCoin.ticker}`);
  }

  const inputCoinDp = getDp(inputCoinData);
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

  // Validate against per-coin swap minimum input. The backend rejects swaps
  // below this threshold, so checking here prevents the user from seeing an
  // estimate that would be rejected on submission. (Audit fix L5, 2026-03-16)
  if (inputCoinData.swapMinimumInput) {
    const swapMin = new BigNumber(inputCoinData.swapMinimumInput);
    if (swapMin.gt(0) && amountInBN.lt(swapMin)) {
      throw new Error(
        `Input amount ${amountIn} ${inputCoin.ticker} is less than the swap minimum (${swapMin.toString()})`
      );
    }
  }

  // Find all paths using the specified algorithm (include orderbook pairs in graph)
  const paths = findAllPaths(inputCoinData, outputCoinData, pools, maxHops, algorithm, coins, orderbooks);
  if (!paths.length) {
    throw new Error('No valid swap paths found');
  }

  // Estimate each path
  let bestPath = null;
  let maxAmountOut = new BigNumber(0);
  let bestResult = null;

  for (const path of paths) {
    const result = estimatePath(pools, path, inputCoinData, amountIn, coins, orderbooks, userOrders, clobFees, marketsLookup);
    if (result && result.amountOut.gt(maxAmountOut)) {
      maxAmountOut = result.amountOut;
      bestPath = path;
      bestResult = result;
    }
  }

  if (!bestPath) {
    throw new Error('No valid swap path with positive output using RUNES-compliant pools');
  }

  // Calculate USD prices. For CLOB-only pairs without a corresponding RUNES
  // AMM pool, price lookups return '0'. Instead of throwing (which blocks the
  // entire estimation), return null USD values — the swap path is still valid,
  // just without USD display data. (Audit fix L5, 2026-03-18)
  const runesPriceUSD = getRunesPriceUSD(pools);
  const priceAInRunes = getTokenPriceInRunes(inputCoinData, pools);
  const priceBInRunes = getTokenPriceInRunes(outputCoinData, pools);
  const hasUsdPrices = priceAInRunes && priceAInRunes !== '0' && priceBInRunes && priceBInRunes !== '0';

  let priceAUSD = null;
  let priceBUSD = null;
  let inputValueUSD = null;
  let outputValueUSD = null;
  let afterSwapPrices = null;

  if (hasUsdPrices) {
    priceAUSD = new BigNumber(priceAInRunes).times(runesPriceUSD).toString();
    priceBUSD = new BigNumber(priceBInRunes).times(runesPriceUSD).toString();
    inputValueUSD = new BigNumber(amountIn).times(priceAUSD).toString();
    outputValueUSD = maxAmountOut
      .shiftedBy(-outputCoinData.dp)
      .times(priceBUSD)
      .toString();

    // After-swap prices: use the already-simulated updated pools from bestResult
    // (estimatePath already tracks post-swap reserve states, no need to re-simulate)
    const runesPriceUSDAfter = getRunesPriceUSD(bestResult.updatedPools);
    const priceAInRunesAfter = new BigNumber(getTokenPriceInRunes(inputCoinData, bestResult.updatedPools));
    const priceBInRunesAfter = new BigNumber(getTokenPriceInRunes(outputCoinData, bestResult.updatedPools));
    afterSwapPrices = {
      [inputCoin.ticker]: priceAInRunesAfter.times(runesPriceUSDAfter).toString(),
      [outputCoin.ticker]: priceBInRunesAfter.times(runesPriceUSDAfter).toString(),
    };
  }

  return {
    input: {
      token: inputCoin.ticker,
      amount: amountIn,
      priceUSD: priceAUSD,
      valueUSD: inputValueUSD,
      priceInRunes: priceAInRunes || '0',
    },
    output: {
      token: outputCoin.ticker,
      amount: maxAmountOut.shiftedBy(-outputCoinData.dp).toString(),
      priceUSD: priceBUSD,
      valueUSD: outputValueUSD,
      priceInRunes: priceBInRunes || '0',
    },
    slippage: {
      priceImpact: bestResult.priceImpact * 100,
      intermediateAmounts: bestResult.intermediateAmounts,
    },
    afterSwapPrices,
    path: bestResult.enrichedPath,
    algorithm, // Include algorithm in the response
    // Low-confidence flags: when set, the estimate may diverge from actual
    // execution. The UI should display a warning (e.g. wider slippage recommended).
    // - clobEstimateLowConfidence: CLOB used equal-split fallback (no per-order sizes)
    // - spilloverEstimateLowConfidence: CLOB+AMM split used potentially stale pool reserves
    // (Audit fix M4, 2026-03-17)
    ...(bestResult.clobEstimateLowConfidence ? { clobEstimateLowConfidence: true } : {}),
    ...(bestResult.spilloverEstimateLowConfidence ? { spilloverEstimateLowConfidence: true } : {}),
  };
};
