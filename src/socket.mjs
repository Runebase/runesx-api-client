// src/socket.mjs
import { io } from 'socket.io-client';

import { setInitialPools, updatePool, resetPools } from './store/poolStore.mjs';
import { setInitialCoins, updateCoin, resetCoins } from './store/coinStore.mjs';
import { setInitialChains, updateChain, resetChains } from './store/chainStore.mjs';
import { setInitialWallets, updateWallet, resetWallets } from './store/walletStore.mjs';
import { setInitialUserShares, updateUserShare, resetUserShares } from './store/userSharesStore.mjs';
import { setInitialOrderBooks, updateOrderBook, resetOrderBooks, setUserOrders, updateUserOrder } from './store/orderbookStore.mjs';
import { setInitialMarkets, addOrUpdateMarket, resetMarkets } from './store/marketStore.mjs';
import { setExchangeConfig } from './store/exchangeConfigStore.mjs';

// ---- Shared public event handler registration ----
// Used by both setupSocket and setupPublicSocket to avoid duplicating handler code.
function _registerPublicHandlers(socket, emit) {
  socket.on('exchange_config', (cfg) => {
    setExchangeConfig(cfg);
    emit('exchange_config', cfg);
  });

  socket.on('markets_initial', (data) => {
    setInitialMarkets(data);
    emit('markets_initial', data);
  });

  socket.on('market_created', (data) => {
    addOrUpdateMarket(data);
    emit('market_created', data);
  });

  socket.on('market_updated', (data) => {
    addOrUpdateMarket(data);
    emit('market_updated', data);
  });

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

  socket.on('orderbooks_initial', ({ books, isInitial }) => {
    if (isInitial) {
      setInitialOrderBooks(books);
    }
    emit('orderbooks_initial', { books, isInitial });
  });

  socket.on('orderbook_updated', ({ pair, bids, asks }) => {
    updateOrderBook(pair, bids, asks);
    emit('orderbook_updated', { pair, bids, asks });
  });

  socket.on('user_orders_initial', (orders) => {
    setUserOrders(orders);
    emit('user_orders_initial', orders);
  });

  socket.on('order_updated', (data) => {
    updateUserOrder(data);
    emit('order_updated', data);
  });

  socket.on('clob_trade', (trade) => {
    emit('clob_trade', trade);
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
}

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
      resetOrderBooks();
      resetMarkets();
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
    resetMarkets();
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
      resetOrderBooks();
    }
    emit('reconnect_error', err);
  });

  socket.on('error', (err) => {
    console.log('Socket error:', err.message);
    emit('error', err);
  });

  // ---- Public room events (shared handler) ----
  _registerPublicHandlers(socket, emit);

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

  function joinCandlesticks(pair, timeframe) {
    socket.emit('join_candlesticks', { pair, timeframe });
  }

  function leaveCandlesticks(pair, timeframe) {
    socket.emit('leave_candlesticks', { pair, timeframe });
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

// ---- Public-only socket (no auth) ----

const _storeResetMap = {
  pools: resetPools,
  coins: resetCoins,
  chains: resetChains,
  orderbooks: resetOrderBooks,
  markets: resetMarkets,
};

export function setupPublicSocket(config, requestedStores) {
  const _requestedStores = new Set(requestedStores);

  const socket = io(config.socketUrl, {
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
    socket.emit('join_public_selective', { stores: [..._requestedStores] });
    errorCount.count = 0;
    emit('connect', null);
  });

  socket.on('connect_error', (err) => {
    console.log('Socket connect error:', err.message);
    errorCount.count += 1;
    if (errorCount.count >= 3) {
      for (const store of _requestedStores) {
        if (_storeResetMap[store]) { _storeResetMap[store](); }
      }
    }
    emit('connect_error', err);
  });

  socket.on('disconnect', (reason) => {
    console.log('Disconnected from Socket.IO server:', reason);
    clearInterval(heartbeatInterval);
    for (const store of _requestedStores) {
      if (_storeResetMap[store]) { _storeResetMap[store](); }
    }
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
      for (const store of _requestedStores) {
        if (_storeResetMap[store]) { _storeResetMap[store](); }
      }
    }
    emit('reconnect_error', err);
  });

  socket.on('error', (err) => {
    console.log('Socket error:', err.message);
    emit('error', err);
  });

  // ---- Public room events (shared handler) ----
  _registerPublicHandlers(socket, emit);

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

  function requestStores(additionalStores) {
    for (const store of additionalStores) {
      _requestedStores.add(store);
    }
    socket.emit('request_stores', { stores: additionalStores });
  }

  function joinCandlesticks(pair, timeframe) {
    socket.emit('join_candlesticks', { pair, timeframe });
  }

  function leaveCandlesticks(pair, timeframe) {
    socket.emit('leave_candlesticks', { pair, timeframe });
  }

  return {
    socket,
    on,
    off,
    requestStores,
    joinCandlesticks,
    leaveCandlesticks,
  };
}
