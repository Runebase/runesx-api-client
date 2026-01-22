// src/utils/priceUtils.mjs
import { BigNumber } from 'bignumber.js';

import { getPools } from '../store/poolStore.mjs';
import { getCoinByTicker } from '../store/coinStore.mjs';

export function createPriceUtils() {
  const getRunesPriceUSD = () => {
    const pools = getPools();

    const runesUsdcPool = pools.find((p) =>
      (p.coinA.ticker === 'RUNES' && p.coinB.ticker === 'USDC') ||
      (p.coinA.ticker === 'USDC' && p.coinB.ticker === 'RUNES')
    );

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

    const runesPriceUSD = runesUsdcPool.coinA.ticker === 'RUNES'
      ? reserveB.div(reserveA)
      : reserveA.div(reserveB);

    if (runesPriceUSD.isNaN() || runesPriceUSD.lte(0)) {
      console.warn('Invalid RUNES/USDC price calculated, using fallback price of $0.01');
      return '0.01';
    }

    return runesPriceUSD.toString();
  };

  const getTokenPriceInRunes = (ticker) => {
    ensureInitialized();
    if (ticker === 'RUNES') {return '1';}

    const pools = getPools();
    const pool = pools.find(
      (p) =>
        (p.coinA.ticker === 'RUNES' && p.coinB.ticker === ticker) ||
        (p.coinB.ticker === 'RUNES' && p.coinA.ticker === ticker)
    );

    if (!pool || new BigNumber(pool.reserveA).isZero() || new BigNumber(pool.reserveB).isZero()) {
      return '0';
    }

    const reserveA = new BigNumber(pool.reserveA).shiftedBy(-pool.coinA.dp);
    const reserveB = new BigNumber(pool.reserveB).shiftedBy(-pool.coinB.dp);

    const priceInRunes = pool.coinA.ticker === 'RUNES'
      ? reserveA.div(reserveB)
      : reserveB.div(reserveA);

    return priceInRunes.toString();
  };

  const getTokenPriceUSD = (ticker) => {
    ensureInitialized();
    if (ticker === 'USDC') {return '1';}

    const coin = getCoinByTicker(ticker);
    if (!coin) {
      console.warn(`Coin not found for ticker ${ticker}`);
      return '0';
    }

    const runesPriceUSD = getRunesPriceUSD();
    const priceInRunes = getTokenPriceInRunes(ticker);

    if (priceInRunes === '0') {return '0';}

    return new BigNumber(priceInRunes).multipliedBy(runesPriceUSD).toString();
  };

  const getPrices = (tickers) => {
    const prices = {};
    for (const ticker of tickers) {
      try {
        prices[ticker] = getTokenPriceUSD(ticker);
      } catch (e) {
        console.warn(`Failed to get price for ${ticker}:`, e.message);
        prices[ticker] = null;
      }
    }
    return prices;
  };

  const calculateUSDValue = (amount, ticker, decimals = null) => {
    try {
      const priceUSD = getTokenPriceUSD(ticker);
      if (priceUSD === '0' || !priceUSD) {return '0.00';}

      let valueBN = new BigNumber(amount).multipliedBy(priceUSD);

      if (decimals !== null) {
        valueBN = valueBN.dp(decimals, BigNumber.ROUND_DOWN);
      }

      return valueBN.toString();
    } catch (error) {
      console.warn(`Failed to calculate USD value for ${amount} ${ticker}:`, error.message);
      return '0.00';
    }
  };

  return {
    getRunesPriceUSD,
    getTokenPriceInRunes,
    getTokenPriceUSD,
    getPrices,
    calculateUSDValue,
  };
}