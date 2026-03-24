import { poolStore, getPools } from './store/poolStore.mjs';
import { coinStore, getCoins } from './store/coinStore.mjs';
import { chainStore, getChains } from './store/chainStore.mjs';
import { walletStore, getWallets } from './store/walletStore.mjs';
import { userSharesStore, getUserShares } from './store/userSharesStore.mjs';
import { orderbookStore, getAllOrderBooks } from './store/orderbookStore.mjs';
import { getMarkets } from './store/marketStore.mjs';

export function waitForStores(socket) {
  // Function to wait for poolStore to be populated
  const waitForPools = () => {
    return new Promise((resolve, reject) => {
      if (poolStore.isInitialReceived) {
        const pools = getPools();
        resolve(pools);
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for initial pool data'));
      }, 30000); // 30-second timeout

      socket.on('pools_updated', ({ isInitial }) => {
        if (isInitial) {
          const pools = getPools();
          clearTimeout(timeout);
          resolve(pools);
        }
      });

      socket.on('connect_error', (err) => {
        console.error('Socket connect error:', err.message);
        clearTimeout(timeout);
        reject(new Error('Socket connection failed'));
      });

      socket.on('disconnect', (reason) => {
        console.error('Socket disconnected:', reason);
        clearTimeout(timeout);
        reject(new Error('Socket disconnected before receiving initial pool data'));
      });
    });
  };

  // Function to wait for coinStore to be populated
  const waitForCoins = () => {
    return new Promise((resolve, reject) => {
      if (coinStore.isInitialReceived) {
        const coins = getCoins();
        resolve(coins);
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for initial coin data'));
      }, 30000); // 30-second timeout

      socket.on('coins_updated', ({ isInitial }) => {
        if (isInitial) {
          const coins = getCoins();
          clearTimeout(timeout);
          resolve(coins);
        }
      });

      socket.on('connect_error', (err) => {
        console.error('Socket connect error:', err.message);
        clearTimeout(timeout);
        reject(new Error('Socket connection failed'));
      });

      socket.on('disconnect', (reason) => {
        console.error('Socket disconnected:', reason);
        clearTimeout(timeout);
        reject(new Error('Socket disconnected before receiving initial coin data'));
      });
    });
  };

  // Function to wait for chainStore to be populated
  const waitForChains = () => {
    return new Promise((resolve, reject) => {
      if (chainStore.isInitialReceived) {
        const chains = getChains();
        resolve(chains);
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for initial chain data'));
      }, 30000); // 30-second timeout

      socket.on('chains_updated', ({ isInitial }) => {
        if (isInitial) {
          const chains = getChains();
          clearTimeout(timeout);
          resolve(chains);
        }
      });

      socket.on('connect_error', (err) => {
        console.error('Socket connect error:', err.message);
        clearTimeout(timeout);
        reject(new Error('Socket connection failed'));
      });

      socket.on('disconnect', (reason) => {
        console.error('Socket disconnected:', reason);
        clearTimeout(timeout);
        reject(new Error('Socket disconnected before receiving initial chain data'));
      });
    });
  };

  // Function to wait for walletStore to be populated
  const waitForWallets = () => {
    return new Promise((resolve, reject) => {
      if (walletStore.isInitialReceived) {
        const wallets = getWallets();
        resolve(wallets);
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for initial wallet data'));
      }, 30000); // 30-second timeout

      socket.on('wallets_updated', ({ isInitial }) => {
        if (isInitial) {
          const wallets = getWallets();
          clearTimeout(timeout);
          resolve(wallets);
        }
      });

      socket.on('connect_error', (err) => {
        console.error('Socket connect error:', err.message);
        clearTimeout(timeout);
        reject(new Error('Socket connection failed'));
      });

      socket.on('disconnect', (reason) => {
        console.error('Socket disconnected:', reason);
        clearTimeout(timeout);
        reject(new Error('Socket disconnected before receiving initial wallet data'));
      });
    });
  };

  // Function to wait for userSharesStore to be populated
  const waitForUserShares = () => {
    return new Promise((resolve, reject) => {
      if (userSharesStore.isInitialReceived) {
        const userShares = getUserShares();
        resolve(userShares);
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for initial user shares data'));
      }, 30000); // 30-second timeout

      socket.on('user_shares_updated', ({ isInitial }) => {
        if (isInitial) {
          const userShares = getUserShares();
          clearTimeout(timeout);
          resolve(userShares);
        }
      });

      socket.on('connect_error', (err) => {
        console.error('Socket connect error:', err.message);
        clearTimeout(timeout);
        reject(new Error('Socket connection failed'));
      });

      socket.on('disconnect', (reason) => {
        console.error('Socket disconnected:', reason);
        clearTimeout(timeout);
        reject(new Error('Socket disconnected before receiving initial user shares data'));
      });
    });
  };

  // Function to wait for orderbookStore to be populated
  const waitForOrderBooks = () => {
    return new Promise((resolve, reject) => {
      if (orderbookStore.isInitialReceived) {
        resolve(getAllOrderBooks());
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for initial orderbook data'));
      }, 30000);

      socket.on('orderbooks_initial', ({ isInitial }) => {
        if (isInitial) {
          clearTimeout(timeout);
          resolve(getAllOrderBooks());
        }
      });

      socket.on('connect_error', (err) => {
        console.error('Socket connect error:', err.message);
        clearTimeout(timeout);
        reject(new Error('Socket connection failed'));
      });

      socket.on('disconnect', (reason) => {
        console.error('Socket disconnected:', reason);
        clearTimeout(timeout);
        reject(new Error('Socket disconnected before receiving initial orderbook data'));
      });
    });
  };

  // Return a promise that resolves when all stores are populated
  return Promise.all([waitForPools(), waitForCoins(), waitForChains(), waitForWallets(), waitForUserShares(), waitForOrderBooks()])
    .then(([pools, coins, chains, wallets, userShares, orderbooks]) => ({
      pools,
      coins,
      chains,
      wallets,
      userShares,
      orderbooks,
    }));
}

// ---- Selective store waiting (for public-only initialization) ----

const _storeDefinitions = {
  pools: {
    waitEvent: 'pools_updated',
    checkReady: () => poolStore.isInitialReceived,
    getData: getPools,
  },
  coins: {
    waitEvent: 'coins_updated',
    checkReady: () => coinStore.isInitialReceived,
    getData: getCoins,
  },
  chains: {
    waitEvent: 'chains_updated',
    checkReady: () => chainStore.isInitialReceived,
    getData: getChains,
  },
  orderbooks: {
    waitEvent: 'orderbooks_initial',
    checkReady: () => orderbookStore.isInitialReceived,
    getData: getAllOrderBooks,
  },
  markets: {
    waitEvent: 'markets_initial',
    checkReady: () => true, // fire-and-forget, resolve immediately
    getData: getMarkets,
  },
};

export function waitForSelectiveStores(socket, requestedStores) {
  const promises = [];

  for (const storeName of requestedStores) {
    const def = _storeDefinitions[storeName];
    if (!def) {
      // Stores not in the map (buckets, operations, messages, status) are silently skipped
      continue;
    }

    const promise = new Promise((resolve, reject) => {
      if (def.checkReady()) {
        resolve({ [storeName]: def.getData() });
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error(`Timeout waiting for initial ${storeName} data`));
      }, 30000);

      const handler = (data) => {
        const isInitial = data && data.isInitial;
        if (isInitial) {
          clearTimeout(timeout);
          socket.off(def.waitEvent, handler);
          resolve({ [storeName]: def.getData() });
        }
      };

      socket.on(def.waitEvent, handler);

      socket.on('connect_error', () => {
        clearTimeout(timeout);
        reject(new Error(`Socket connection failed while waiting for ${storeName}`));
      });

      socket.on('disconnect', () => {
        clearTimeout(timeout);
        reject(new Error(`Socket disconnected before receiving initial ${storeName} data`));
      });
    });

    promises.push(promise);
  }

  return Promise.all(promises).then((results) => {
    return Object.assign({}, ...results);
  });
}