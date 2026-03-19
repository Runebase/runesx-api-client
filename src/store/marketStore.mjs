// src/store/marketStore.mjs
// Stores admin-defined markets received from the backend via socket.
// Markets define the canonical pair direction (e.g., "RUNES-DOG" not "DOG-RUNES").

let markets = [];
let byCoinKey = {};

function buildCoinKey(coinIdA, coinIdB) {
  return coinIdA < coinIdB ? `${coinIdA}|${coinIdB}` : `${coinIdB}|${coinIdA}`;
}

function rebuildLookup() {
  const lookup = {};
  for (const m of markets) {
    const key = buildCoinKey(m.baseCoinId, m.quoteCoinId);
    lookup[key] = m;
  }
  byCoinKey = lookup;
}

export function setInitialMarkets(list) {
  markets = list || [];
  rebuildLookup();
}

export function addOrUpdateMarket(market) {
  const idx = markets.findIndex((m) => m.id === market.id);
  if (idx >= 0) {
    markets[idx] = { ...markets[idx], ...market };
  } else {
    markets.push(market);
  }
  rebuildLookup();
}

export function getMarkets() {
  return markets;
}

export function getMarketByCoinKey() {
  return byCoinKey;
}

/**
 * Look up a market by two coin IDs (order-independent).
 * @param {string} coinIdA
 * @param {string} coinIdB
 * @returns {Object|undefined}
 */
export function getMarketByCoins(coinIdA, coinIdB) {
  return byCoinKey[buildCoinKey(coinIdA, coinIdB)];
}

export function resetMarkets() {
  markets = [];
  byCoinKey = {};
}
