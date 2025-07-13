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

  // Process buffered updates
  if (walletStore.pendingUpdates.length > 0) {
    walletStore.pendingUpdates.forEach(({ wallets }) => {
      wallets.forEach(wallet => updateWallet(wallet));
    });
    walletStore.pendingUpdates = [];
  }
};

// Update a single wallet
const updateWallet = (wallet) => {
  if (!walletStore.isInitialReceived) {
    walletStore.pendingUpdates.push({ wallets: [wallet] });
    return;
  }

  const existingWallet = walletStore.wallets.get(wallet.ticker);
  const incomingUpdatedAt = new Date(wallet.updatedAt).getTime();

  if (existingWallet) {
    const existingUpdatedAt = new Date(existingWallet.updatedAt).getTime();
    if (incomingUpdatedAt <= existingUpdatedAt) {
      return;
    }

    walletStore.wallets.set(wallet.ticker, {
      ...existingWallet,
      available: new BigNumber(wallet.available).toString(),
      locked: new BigNumber(wallet.locked).toString(),
      updatedAt: wallet.updatedAt,
    });
  } else if (wallet.ticker && new BigNumber(wallet.available).gte(0) && new BigNumber(wallet.locked).gte(0)) {
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
};

export { walletStore, setInitialWallets, updateWallet, getWallets, getWalletByTicker, resetWallets };