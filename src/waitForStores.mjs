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
        console.log('Initial pool data already received:', pools.length, 'pools', pools);
        resolve(pools);
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for initial pool data'));
      }, 30000); // 30-second timeout

      socket.on('pools_updated', ({ isInitial, pools }) => {
        console.log('Received pools_updated:', { isInitial, pools });
        if (isInitial) {
          const pools = getPools();
          console.log('Initial pool data received:', pools.length, 'pools', pools);
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
        console.log('Initial coin data already received:', coins.length, 'coins', coins);
        resolve(coins);
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for initial coin data'));
      }, 30000); // 30-second timeout

      socket.on('coins_updated', ({ isInitial, coins }) => {
        console.log('Received coins_updated:', { isInitial, coins });
        if (isInitial) {
          const coins = getCoins();
          console.log('Initial coin data received:', coins.length, 'coins', coins);
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
        console.log('Initial wallet data already received:', wallets.length, 'wallets', wallets);
        resolve(wallets);
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for initial wallet data'));
      }, 30000); // 30-second timeout

      socket.on('wallets_updated', ({ isInitial, wallets }) => {
        console.log('Received wallets_updated:', { isInitial, wallets });
        if (isInitial) {
          const wallets = getWallets();
          console.log('Initial wallet data received:', wallets.length, 'wallets', wallets);
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
        console.log('Initial user shares data already received:', userShares.length, 'user shares', userShares);
        resolve(userShares);
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for initial user shares data'));
      }, 30000); // 30-second timeout

      socket.on('user_shares_updated', ({ isInitial, userShares }) => {
        console.log('Received user_shares_updated:', { isInitial, userShares });
        if (isInitial) {
          const userShares = getUserShares();
          console.log('Initial user shares data received:', userShares.length, 'user shares', userShares);
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