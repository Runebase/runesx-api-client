// src/utils/liquidityUtils.mjs
import { SafeBigNumber as BigNumber } from './safeBigNumber.mjs';
import { getRunesPriceUSD, getTokenPriceInRunes } from './swapUtils.mjs';

export function normalizeTokenPairFrontend(coinA, coinB, pools) {
  if (!coinA || !coinB || !coinA.ticker || !coinB.ticker) {
    throw new Error('Invalid token objects');
  }

  if (coinA.ticker === 'RUNES') {
    return { tokenA: coinA, tokenB: coinB, flipped: false };
  }
  if (coinB.ticker === 'RUNES') {
    return { tokenA: coinB, tokenB: coinA, flipped: true };
  }

  const pool = pools.find(
    (p) =>
      (p.coinA.ticker === coinA.ticker && p.coinB.ticker === coinB.ticker) ||
      (p.coinB.ticker === coinA.ticker && p.coinA.ticker === coinB.ticker)
  );

  if (pool) {
    if (pool.coinA.ticker === coinA.ticker && pool.coinB.ticker === coinB.ticker) {
      return { tokenA: coinA, tokenB: coinB, flipped: false };
    }
    return { tokenA: coinB, tokenB: coinA, flipped: true };
  }

  return { tokenA: coinA, tokenB: coinB, flipped: false };
}

export function checkRunesLiquidityFrontend(tokenA, tokenB, pools, coins) {
  if (tokenA.ticker === 'RUNES' || tokenB.ticker === 'RUNES') {
    return { isCompliant: true, warnings: [] };
  }

  const runesCoin = coins.find((c) => c.ticker === 'RUNES');
  if (!runesCoin) {
    return {
      isCompliant: false,
      warnings: [{ message: 'RUNES coin not found', isListItem: true }],
    };
  }

  const tokensToCheck = [
    { ticker: tokenA.ticker, coin: coins.find((c) => c.ticker === tokenA.ticker) },
    { ticker: tokenB.ticker, coin: coins.find((c) => c.ticker === tokenB.ticker) },
  ];

  const warnings = [];

  for (const { ticker, coin } of tokensToCheck) {
    if (!coin) {
      warnings.push({ message: `Token ${ticker} not found`, isListItem: true });
      continue;
    }

    const runesPool = pools.find(
      (p) => p.coinA.ticker === 'RUNES' && p.coinB.ticker === ticker
    );
    const requiredRunes = new BigNumber(coin.runesComplianceRequirement || '100000000000');
    if (!runesPool || new BigNumber(runesPool.reserveA).isZero()) {
      warnings.push({
        message: `A RUNES/${ticker} pool with at least ${requiredRunes
          .shiftedBy(-runesCoin.dp)
          .dp(runesCoin.dp)
          .toString()} RUNES liquidity is required`,
        isListItem: true,
      });
      continue;
    }

    const actualRunes = new BigNumber(runesPool.reserveA);
    if (actualRunes.lt(requiredRunes)) {
      warnings.push({
        message: `A RUNES/${ticker} pool with at least ${requiredRunes
          .shiftedBy(-runesCoin.dp)
          .dp(runesCoin.dp)
          .toString()} RUNES liquidity is required`,
        isListItem: true,
      });
    }
  }

  if (warnings.length > 0) {
    warnings.push({
      message: 'Pools are periodically checked, and non-compliant pools will be disabled for trading.',
      isListItem: false,
    });
    return { isCompliant: false, warnings };
  }

  return { isCompliant: true, warnings: [] };
}

export function getPoolRatioFrontend(pool) {
  if (!pool || !pool.reserveA || !pool.reserveB || !pool.coinA || !pool.coinB) {
    return null;
  }

  const reserveABN = new BigNumber(pool.reserveA);
  const reserveBBN = new BigNumber(pool.reserveB);
  if (!reserveABN.isFinite() || !reserveBBN.isFinite() || reserveABN.isZero() || reserveBBN.isZero()) {
    return null;
  }

  const reserveADecimal = reserveABN.shiftedBy(-pool.coinA.dp);
  const reserveBDecimal = reserveBBN.shiftedBy(-pool.coinB.dp);
  return reserveADecimal.div(reserveBDecimal);
}

export function estimateLiquidityFrontend({ coinA, coinB, amountA, amountB, pools }) {
  if ((amountA === null && amountB === null) || (amountA !== null && amountB !== null)) {
    throw new Error('Provide either amountA or amountB, but not both or neither');
  }
  if (amountA !== null && new BigNumber(amountA).lte(0)) {
    throw new Error(`${coinA.ticker} amount must be positive`);
  }
  if (amountB !== null && new BigNumber(amountB).lte(0)) {
    throw new Error(`${coinB.ticker} amount must be positive`);
  }

  const { tokenA, tokenB, flipped } = normalizeTokenPairFrontend(coinA, coinB, pools);
  let adjustedAmountA = amountA;
  let adjustedAmountB = amountB;
  if (flipped) {
    adjustedAmountA = amountB;
    adjustedAmountB = amountA;
  }

  const pool = pools.find(
    (p) =>
      (p.coinA.ticker === tokenA.ticker && p.coinB.ticker === tokenB.ticker) ||
      (p.coinB.ticker === tokenA.ticker && p.coinA.ticker === coinB.ticker)
  );

  let amountAOut;
  let amountBOut;

  if (!pool || (new BigNumber(pool.reserveA).isZero() && new BigNumber(pool.reserveB).isZero())) {
    if (adjustedAmountA === null || adjustedAmountB === null) {
      return {
        coinA: { ticker: tokenA.ticker, dp: tokenA.dp, projectName: tokenA.projectName },
        coinB: { ticker: tokenB.ticker, dp: tokenB.dp, projectName: tokenB.projectName },
        isPoolEmpty: true,
        flipped,
      };
    }
    amountAOut = new BigNumber(adjustedAmountA).decimalPlaces(tokenA.dp, BigNumber.ROUND_DOWN);
    amountBOut = new BigNumber(adjustedAmountB).decimalPlaces(tokenB.dp, BigNumber.ROUND_DOWN);
  } else {
    const currentRatio = getPoolRatioFrontend(pool);
    if (!currentRatio || currentRatio.isZero() || !currentRatio.isFinite()) {
      throw new Error('Invalid pool ratio');
    }
    if (adjustedAmountA !== null) {
      amountAOut = new BigNumber(adjustedAmountA).decimalPlaces(tokenA.dp, BigNumber.ROUND_DOWN);
      amountBOut = amountAOut.div(currentRatio).decimalPlaces(tokenB.dp, BigNumber.ROUND_DOWN);
    } else {
      amountBOut = new BigNumber(adjustedAmountB).decimalPlaces(tokenB.dp, BigNumber.ROUND_DOWN);
      amountAOut = amountBOut.times(currentRatio).decimalPlaces(tokenA.dp, BigNumber.ROUND_DOWN);
    }
  }

  return {
    amountA: amountAOut.toString(),
    amountB: amountBOut.toString(),
    coinA: { ticker: tokenA.ticker, dp: tokenA.dp, projectName: tokenA.projectName },
    coinB: { ticker: tokenB.ticker, dp: tokenB.dp, projectName: tokenB.projectName },
    isPoolEmpty: !pool || (new BigNumber(pool.reserveA).isZero() && new BigNumber(pool.reserveB).isZero()),
    flipped,
  };
}

/**
 * Estimate the shares that would be minted for a liquidity deposit.
 * Uses the same formula as the backend engine.
 *
 * @param {Object} params
 * @param {Object} params.pool - Pool object from getPools() (must include reserveA, reserveB, totalShares, coinA.dp, coinB.dp)
 * @param {string} params.amountA - Decimal amount of tokenA to deposit
 * @param {string} params.amountB - Decimal amount of tokenB to deposit
 * @param {number} [params.slippagePercent=2] - Slippage tolerance percentage (e.g. 2 for 2%)
 * @returns {{ estimatedShares: string, minShares: string } | null} null if shares cannot be estimated
 */
export function estimateDepositShares({ pool, amountA, amountB, slippagePercent = 2 }) {
  if (!pool || !amountA || !amountB) {
    return null;
  }

  const dpA = pool.coinA.dp;
  const dpB = pool.coinB.dp;
  const amountABN = new BigNumber(amountA).decimalPlaces(dpA, BigNumber.ROUND_DOWN);
  const amountBBN = new BigNumber(amountB).decimalPlaces(dpB, BigNumber.ROUND_DOWN);

  if (!amountABN.isFinite() || !amountBBN.isFinite() || amountABN.lte(0) || amountBBN.lte(0)) {
    return null;
  }

  const reserveA = new BigNumber(pool.reserveA);
  const reserveB = new BigNumber(pool.reserveB);
  const isNewPool = reserveA.isZero() && reserveB.isZero();

  let shares;
  if (isNewPool) {
    // New pool: sqrt(amountA * amountB) * 10^9
    shares = amountABN.times(amountBBN).sqrt().shiftedBy(9).integerValue(BigNumber.ROUND_DOWN);
  } else {
    // Existing pool: min((wholeCoinA * totalShares / reserveA), (wholeCoinB * totalShares / reserveB))
    const totalShares = new BigNumber(pool.totalShares);
    if (totalShares.isZero() || reserveA.isZero() || reserveB.isZero()) {
      return null;
    }

    const wholeCoinA = amountABN.shiftedBy(dpA).integerValue(BigNumber.ROUND_DOWN);
    const wholeCoinB = amountBBN.shiftedBy(dpB).integerValue(BigNumber.ROUND_DOWN);
    const sharesFromA = wholeCoinA.times(totalShares).div(reserveA).integerValue(BigNumber.ROUND_DOWN);
    const sharesFromB = wholeCoinB.times(totalShares).div(reserveB).integerValue(BigNumber.ROUND_DOWN);
    shares = BigNumber.min(sharesFromA, sharesFromB);
  }

  if (shares.isZero()) {
    return null;
  }

  const slippageMultiplier = new BigNumber(1).minus(new BigNumber(slippagePercent).div(100));
  const minShares = shares.times(slippageMultiplier).integerValue(BigNumber.ROUND_DOWN).toString();

  return {
    estimatedShares: shares.toString(),
    minShares,
  };
}

export function calculateShareAmounts({ userShares, pools }) {
  return userShares.map(share => {
    const pool = pools.find(p => p.id === share.poolId);
    if (!pool || !pool.totalShares || new BigNumber(pool.totalShares).isZero()) {
      return {
        ...share,
        amountA: '0',
        amountB: '0',
        totalShares: '0',
        reserveA: '0',
        reserveB: '0',
        coinA: { ticker: 'Unknown', dp: 0, projectName: 'Unknown' },
        coinB: { ticker: 'Unknown', dp: 0, projectName: 'Unknown' },
        pair: 'Unknown/Unknown',
      };
    }

    const sharesBN = new BigNumber(share.shares);
    const totalSharesBN = new BigNumber(pool.totalShares);
    const reserveABN = new BigNumber(pool.reserveA);
    const reserveBBN = new BigNumber(pool.reserveB);

    const shareRatio = sharesBN.div(totalSharesBN);
    const amountA = shareRatio.times(reserveABN).decimalPlaces(pool.coinA.dp, BigNumber.ROUND_DOWN).toString();
    const amountB = shareRatio.times(reserveBBN).decimalPlaces(pool.coinB.dp, BigNumber.ROUND_DOWN).toString();

    return {
      ...share,
      amountA,
      amountB,
      totalShares: pool.totalShares,
      reserveA: pool.reserveA,
      reserveB: pool.reserveB,
      coinA: pool.coinA,
      coinB: pool.coinB,
      pair: `${pool.coinA.ticker}/${pool.coinB.ticker}`,
    };
  });
}

export const getPoolLiquidityUSD = (pool, coins, pools) => {
  if (!pool || !coins || !pools || !pool.runesCompliant) {
    return { value: '0', error: 'Pool or coin data missing or not RUNES compliant' };
  }

  const coinA = coins.find((c) => c.ticker === pool.coinA.ticker);
  const coinB = coins.find((c) => c.ticker === pool.coinB.ticker);
  if (!coinA || !coinB) {
    return { value: '0', error: `Coins not found: ${pool.coinA.ticker}/${pool.coinB.ticker}` };
  }

  const reserveA = new BigNumber(pool.reserveA).shiftedBy(-pool.coinA.dp);
  const reserveB = new BigNumber(pool.reserveB).shiftedBy(-pool.coinB.dp);

  if (reserveA.isZero() || reserveB.isZero()) {
    return { value: '0', error: 'Zero reserves in pool' };
  }

  const runesPriceUSD = getRunesPriceUSD(pools);
  const priceAInRunes = new BigNumber(getTokenPriceInRunes(coinA, pools) || '0');
  const priceBInRunes = new BigNumber(getTokenPriceInRunes(coinB, pools) || '0');

  const valueA = priceAInRunes.times(runesPriceUSD).times(reserveA);
  const valueB = priceBInRunes.times(runesPriceUSD).times(reserveB);

  if (valueA.isNaN() || valueB.isNaN() || priceAInRunes.isZero() || priceBInRunes.isZero()) {
    return {
      value: '0',
      error: 'Invalid liquidity data (NaN or zero price)',
    };
  }

  const poolValue = valueA.plus(valueB);
  return {
    value: poolValue.toString(),
    error: null,
  };
};