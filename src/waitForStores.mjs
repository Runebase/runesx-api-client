import { poolStore, getPools } from './store/poolStore.mjs';
import { coinStore, getCoins } from './store/coinStore.mjs';
import { walletStore, getWallets } from './store/walletStore.mjs';
import { userSharesStore, getUserShares } from './store/userSharesStore.mjs';

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

      socket.on('pools_updated', ({ isInitial, pools }) => {
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

      socket.on('coins_updated', ({ isInitial, coins }) => {
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

      socket.on('wallets_updated', ({ isInitial, wallets }) => {
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

      socket.on('user_shares_updated', ({ isInitial, userShares }) => {
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

  // Return a promise that resolves when all stores are populated
  return Promise.all([waitForPools(), waitForCoins(), waitForWallets(), waitForUserShares()])
    .then(([pools, coins, wallets, userShares]) => ({
      pools,
      coins,
      wallets,
      userShares,
    }));
}