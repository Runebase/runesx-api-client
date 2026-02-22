// src/socket.mjs
import { io } from 'socket.io-client';

import { setInitialPools, updatePool, resetPools } from './store/poolStore.mjs';
import { setInitialCoins, updateCoin, resetCoins } from './store/coinStore.mjs';
import { setInitialChains, updateChain, resetChains } from './store/chainStore.mjs';
import { setInitialWallets, updateWallet, resetWallets } from './store/walletStore.mjs';
import { setInitialUserShares, updateUserShare, resetUserShares } from './store/userSharesStore.mjs';

export function setupSocket(config) {
  const socket = io(config.socketUrl, {
    auth: { authorization: `Bearer ${config.apiKey}` },
    extraHeaders: { authorization: `Bearer ${config.apiKey}` },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  const errorCount = { count: 0 };

  // User-registered event callbacks
  const callbacks = {};

  function emit(event, data) {
    if (callbacks[event]) {
      callbacks[event].forEach((cb) => {
        try { cb(data); } catch (e) { console.error(`Error in ${event} callback:`, e.message); }
      });
    }
  }

  const heartbeatInterval = setInterval(() => {
    if (socket.connected) {
      socket.emit('ping');
    }
  }, 30000);

  socket.on('connect', () => {
    socket.emit('join_public');
    socket.emit('join_private');
    errorCount.count = 0;
    emit('connect', null);
  });

  socket.on('connect_error', (err) => {
    console.log('Socket connect error:', err.message);
    errorCount.count += 1;
    if (errorCount.count >= 3) {
      resetPools();
      resetCoins();
      resetChains();
      resetWallets();
      resetUserShares();
    }
    emit('connect_error', err);
  });

  socket.on('disconnect', (reason) => {
    console.log('Disconnected from Socket.IO server:', reason);
    clearInterval(heartbeatInterval);
    resetPools();
    resetCoins();
    resetChains();
    resetWallets();
    resetUserShares();
    emit('disconnect', reason);
  });

  socket.io.on('reconnect_attempt', (attempt) => {
    console.log(`Reconnect attempt #${attempt}`);
    emit('reconnect_attempt', attempt);
  });

  socket.io.on('reconnect', () => {
    emit('reconnect', null);
  });

  socket.io.on('reconnect_error', (err) => {
    console.log('Reconnect error:', err.message);
    errorCount.count += 1;
    if (errorCount.count >= 3) {
      resetPools();
      resetCoins();
      resetChains();
      resetWallets();
      resetUserShares();
    }
    emit('reconnect_error', err);
  });

  socket.on('error', (err) => {
    console.log('Socket error:', err.message);
    emit('error', err);
  });

  // ---- Public room events ----

  socket.on('pools_updated', ({ pools, isInitial }) => {
    if (isInitial) {
      setInitialPools(pools);
    } else {
      pools.forEach(pool => updatePool(pool));
    }
    emit('pools_updated', { pools, isInitial });
  });

  socket.on('coins_updated', ({ coins, isInitial }) => {
    if (isInitial) {
      setInitialCoins(coins);
    } else {
      coins.forEach(coin => updateCoin(coin));
    }
    emit('coins_updated', { coins, isInitial });
  });

  socket.on('chains_updated', ({ chains, isInitial }) => {
    if (isInitial) {
      setInitialChains(chains);
    } else {
      chains.forEach(chain => updateChain(chain));
    }
    emit('chains_updated', { chains, isInitial });
  });

  socket.on('buckets_updated', (data) => {
    emit('buckets_updated', data);
  });

  socket.on('operations_updated', (operations) => {
    emit('operations_updated', operations);
  });

  socket.on('recent_yard_messages', (data) => {
    emit('recent_yard_messages', data);
  });

  socket.on('status_updated', (data) => {
    emit('status_updated', data);
  });

  socket.on('volumeUpdate', (data) => {
    emit('volumeUpdate', data);
  });

  socket.on('operationUpdate', (operation) => {
    emit('operationUpdate', operation);
  });

  socket.on('candlestick_updated', (data) => {
    emit('candlestick_updated', data);
  });

  // ---- Private room events ----

  socket.on('wallets_updated', ({ wallets, isInitial }) => {
    if (isInitial) {
      setInitialWallets(wallets);
    } else {
      wallets.forEach(wallet => updateWallet(wallet));
    }
    emit('wallets_updated', { wallets, isInitial });
  });

  socket.on('user_shares_updated', ({ userShares, isInitial }) => {
    if (isInitial) {
      setInitialUserShares(userShares);
    } else {
      userShares.forEach(share => updateUserShare(share));
    }
    emit('user_shares_updated', { userShares, isInitial });
  });

  socket.on('deposit_address_generated', (data) => {
    emit('deposit_address_generated', data);
  });

  socket.on('deposit_processed', (data) => {
    emit('deposit_processed', data);
  });

  socket.on('withdrawal_processed', (data) => {
    emit('withdrawal_processed', data);
  });

  socket.on('withdrawal_initiated', (data) => {
    emit('withdrawal_initiated', data);
  });

  socket.on('withdrawal_pin_generated', (data) => {
    emit('withdrawal_pin_generated', data);
  });

  socket.on('withdrawal_queued', (data) => {
    emit('withdrawal_queued', data);
  });

  socket.on('withdrawal_canceled', (data) => {
    emit('withdrawal_canceled', data);
  });

  socket.on('withdrawal_updated', (data) => {
    emit('withdrawal_updated', data);
  });

  socket.on('withdrawal_expired', (data) => {
    emit('withdrawal_expired', data);
  });

  socket.on('yard_message', (message) => {
    emit('yard_message', message);
  });

  socket.on('message_deleted', (data) => {
    emit('message_deleted', data);
  });

  socket.on('banned', (data) => {
    emit('banned', data);
  });

  socket.on('yard_read_marked', (data) => {
    emit('yard_read_marked', data);
  });

  socket.on('session_expired', (data) => {
    emit('session_expired', data);
  });

  socket.on('pong', () => {
    emit('pong', null);
  });

  // ---- Convenience methods ----

  function on(event, callback) {
    if (!callbacks[event]) {
      callbacks[event] = [];
    }
    callbacks[event].push(callback);
  }

  function off(event, callback) {
    if (!callbacks[event]) { return; }
    if (callback) {
      callbacks[event] = callbacks[event].filter((cb) => cb !== callback);
    } else {
      delete callbacks[event];
    }
  }

  function joinCandlesticks(poolId, timeframe) {
    socket.emit('join_candlesticks', { poolId, timeframe });
  }

  function leaveCandlesticks(poolId, timeframe) {
    socket.emit('leave_candlesticks', { poolId, timeframe });
  }

  function sendYardMessage(text) {
    socket.emit('yard_message', { text });
  }

  function deleteMessage(messageId) {
    socket.emit('delete_message', { messageId });
  }

  function markYardRead() {
    socket.emit('mark_yard_read');
  }

  function leavePublic() {
    socket.leave('public');
  }

  function leavePrivate() {
    socket.leave('private');
  }

  return {
    socket,
    on,
    off,
    joinCandlesticks,
    leaveCandlesticks,
    sendYardMessage,
    deleteMessage,
    markYardRead,
    leavePublic,
    leavePrivate,
  };
}
