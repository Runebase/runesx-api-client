import { BigNumber } from 'bignumber.js';

const coinStore = {
  coins: new Map(), // Store coin data by coin ID
  isInitialReceived: false, // Track if initial coin data is received
  pendingUpdates: [], // Buffer for updates before initial data
};

// Initialize coins with initial data
const setInitialCoins = (coins) => {
  coinStore.coins.clear();
  coins.forEach(coin => {
    coinStore.coins.set(coin.id, {
      id: coin.id,
      ticker: coin.ticker,
      dp: coin.dp,
      projectName: coin.projectName,
      status: coin.status,
      runesComplianceRequirement: coin.runesComplianceRequirement || false,
      updatedAt: coin.updatedAt,
      CoinChains: coin.CoinChains || [],
    });
  });
  coinStore.isInitialReceived = true;
  console.log(`Initialized with ${coins.length} coins`);

  // Process buffered updates
  if (coinStore.pendingUpdates.length > 0) {
    console.log(`Processing ${coinStore.pendingUpdates.length} buffered coin updates`);
    coinStore.pendingUpdates.forEach(({ coins }) => {
      coins.forEach(coin => updateCoin(coin));
    });
    coinStore.pendingUpdates = [];
  }
};

// Update a single coin
const updateCoin = (coin) => {
  if (!coinStore.isInitialReceived) {
    console.log('Buffering coin update, initial data not yet received:', coin);
    coinStore.pendingUpdates.push({ coins: [coin] });
    return;
  }

  const existingCoin = coinStore.coins.get(coin.id);
  const incomingUpdatedAt = new Date(coin.updatedAt).getTime();

  if (existingCoin) {
    const existingUpdatedAt = new Date(existingCoin.updatedAt).getTime();
    if (incomingUpdatedAt <= existingUpdatedAt) {
      console.log(`Skipping stale update for coin ${coin.id}`);
      return;
    }

    console.log(`Updating coin ${coin.id} (${coin.ticker}):`, {
      ticker: coin.ticker,
      dp: coin.dp,
      projectName: coin.projectName,
      status: coin.status,
      runesComplianceRequirement: coin.runesComplianceRequirement,
      CoinChains: coin.CoinChains,
    });

    Object.assign(existingCoin, {
      ticker: coin.ticker,
      dp: coin.dp,
      projectName: coin.projectName,
      status: coin.status,
      runesComplianceRequirement: coin.runesComplianceRequirement || false,
      updatedAt: coin.updatedAt,
      CoinChains: coin.CoinChains || existingCoin.CoinChains,
    });
  } else if (coin.ticker && coin.status && new BigNumber(coin.dp || 0).gte(0)) {
    console.log(`Adding new coin ${coin.id}:`, coin);
    coinStore.coins.set(coin.id, {
      id: coin.id,
      ticker: coin.ticker,
      dp: coin.dp,
      projectName: coin.projectName,
      status: coin.status,
      runesComplianceRequirement: coin.runesComplianceRequirement || false,
      updatedAt: coin.updatedAt,
      CoinChains: coin.CoinChains || [],
    });
  } else {
    console.warn(`Ignoring update for unknown coin ${coin.id} with incomplete data`);
  }
};

// Get all coins
const getCoins = () => {
  return Array.from(coinStore.coins.values());
};

// Get a specific coin by ID
const getCoin = (coinId) => {
  return coinStore.coins.get(coinId);
};

// Get a specific coin by ticker
const getCoinByTicker = (ticker) => {
  return Array.from(coinStore.coins.values()).find(coin => coin.ticker === ticker);
};

// Reset store on disconnect or error
const resetCoins = () => {
  coinStore.coins.clear();
  coinStore.isInitialReceived = false;
  coinStore.pendingUpdates = [];
  console.log('Reset coin state due to disconnect or error');
};

export { coinStore, setInitialCoins, updateCoin, getCoins, getCoin, getCoinByTicker, resetCoins };