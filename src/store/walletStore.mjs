import { BigNumber } from 'bignumber.js';

const walletStore = {
  wallets: new Map(), // Store wallet data by ticker
  isInitialReceived: false, // Track if initial wallet data is received
  pendingUpdates: [], // Buffer for updates before initial data
};

// Initialize wallets with initial data
const setInitialWallets = (wallets) => {
  walletStore.wallets.clear();
  wallets.forEach(wallet => {
    walletStore.wallets.set(wallet.ticker, {
      id: wallet.id,
      ticker: wallet.ticker,
      available: new BigNumber(wallet.available).toString(),
      locked: new BigNumber(wallet.locked).toString(),
      updatedAt: wallet.updatedAt,
    });
  });
  walletStore.isInitialReceived = true;
  console.log(`Initialized with ${wallets.length} wallets`);

  // Process buffered updates
  if (walletStore.pendingUpdates.length > 0) {
    console.log(`Processing ${walletStore.pendingUpdates.length} buffered wallet updates`);
    walletStore.pendingUpdates.forEach(({ wallets }) => {
      wallets.forEach(wallet => updateWallet(wallet));
    });
    walletStore.pendingUpdates = [];
  }
};

// Update a single wallet
const updateWallet = (wallet) => {
  if (!walletStore.isInitialReceived) {
    console.log('Buffering wallet update, initial data not yet received:', wallet);
    walletStore.pendingUpdates.push({ wallets: [wallet] });
    return;
  }

  const existingWallet = walletStore.wallets.get(wallet.ticker);
  const incomingUpdatedAt = new Date(wallet.updatedAt).getTime();

  if (existingWallet) {
    const existingUpdatedAt = new Date(existingWallet.updatedAt).getTime();
    if (incomingUpdatedAt <= existingUpdatedAt) {
      console.log(`Skipping stale update for wallet ${wallet.ticker}`);
      return;
    }

    console.log(`Updating wallet ${wallet.ticker}:`, {
      available: wallet.available,
      locked: wallet.locked,
      updatedAt: wallet.updatedAt,
    });

    walletStore.wallets.set(wallet.ticker, {
      ...existingWallet,
      available: new BigNumber(wallet.available).toString(),
      locked: new BigNumber(wallet.locked).toString(),
      updatedAt: wallet.updatedAt,
    });
  } else if (wallet.ticker && new BigNumber(wallet.available).gte(0) && new BigNumber(wallet.locked).gte(0)) {
    console.log(`Adding new wallet ${wallet.ticker}:`, wallet);
    walletStore.wallets.set(wallet.ticker, {
      id: wallet.id,
      ticker: wallet.ticker,
      available: new BigNumber(wallet.available).toString(),
      locked: new BigNumber(wallet.locked).toString(),
      updatedAt: wallet.updatedAt,
    });
  } else {
    console.warn(`Ignoring update for unknown wallet ${wallet.ticker} with incomplete data`);
  }
};

// Get all wallets
const getWallets = () => {
  return Array.from(walletStore.wallets.values());
};

// Get a specific wallet by ticker
const getWalletByTicker = (ticker) => {
  return walletStore.wallets.get(ticker);
};

// Reset store on disconnect or error
const resetWallets = () => {
  walletStore.wallets.clear();
  walletStore.isInitialReceived = false;
  walletStore.pendingUpdates = [];
  console.log('Reset wallet state due to disconnect or error');
};

export { walletStore, setInitialWallets, updateWallet, getWallets, getWalletByTicker, resetWallets };