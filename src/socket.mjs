import { io } from 'socket.io-client';

import { config } from './config.mjs';
import { setInitialPools, updatePool, resetPools } from './store/poolStore.mjs';
import { setInitialCoins, updateCoin, resetCoins } from './store/coinStore.mjs';
import { setInitialWallets, updateWallet, resetWallets } from './store/walletStore.mjs';
import { setInitialUserShares, updateUserShare, resetUserShares } from './store/userSharesStore.mjs';

export function setupSocket() {
  const socket = io(config.socketUrl, {
    auth: {
      authorization: `Bearer ${config.apiKey}`,
    },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  const errorCount = { count: 0 }; // Track connection errors

  socket.on('connect', () => {
    console.log('Connected to Socket.IO server');
    socket.emit('join_public');
    console.log('Joined public room');
    socket.emit('join_private');
    console.log('Joined private room');
    errorCount.count = 0;
  });

  socket.on('connect_error', (err) => {
    console.log('Socket connect error:', err.message);
    errorCount.count += 1;
    if (errorCount.count >= 3) {
      resetPools();
      resetCoins();
      resetWallets();
      resetUserShares();
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('Disconnected from Socket.IO server:', reason);
    resetPools();
    resetCoins();
    resetWallets();
    resetUserShares();
  });

  socket.on('reconnect_attempt', (attempt) => {
    console.log(`Reconnect attempt #${attempt}`);
  });

  socket.on('reconnect', () => {
    console.log('Reconnected to Socket.IO server');
    socket.emit('join_public');
    console.log('Rejoined public room');
    socket.emit('join_private');
    console.log('Rejoined private room');
    resetPools();
    resetCoins();
    resetWallets();
    resetUserShares();
  });

  socket.on('reconnect_error', (err) => {
    console.log('Reconnect error:', err.message);
    errorCount.count += 1;
    if (errorCount.count >= 3) {
      resetPools();
      resetCoins();
      resetWallets();
      resetUserShares();
    }
  });

  socket.on('error', (err) => {
    console.log('Socket error:', err.message);
  });

  socket.on('pools_updated', ({ pools, isInitial }) => {
    console.log('Received pools_updated:', { pools, isInitial });
    if (isInitial) {
      setInitialPools(pools);
    } else {
      pools.forEach(pool => updatePool(pool));
    }
  });

  socket.on('coins_updated', ({ coins, isInitial }) => {
    console.log('Received coins_updated:', { coins, isInitial });
    if (isInitial) {
      setInitialCoins(coins);
    } else {
      coins.forEach(coin => updateCoin(coin));
    }
  });

  socket.on('wallets_updated', ({ wallets, isInitial }) => {
    console.log('Received wallets_updated:', { wallets, isInitial });
    if (isInitial) {
      setInitialWallets(wallets);
    } else {
      wallets.forEach(wallet => updateWallet(wallet));
    }
  });

  socket.on('user_shares_updated', ({ userShares, isInitial }) => {
    console.log('Received user_shares_updated:', { userShares, isInitial });
    if (isInitial) {
      setInitialUserShares(userShares);
    } else {
      userShares.forEach(share => updateUserShare(share));
    }
  });

  socket.on('volumeUpdate', ({ type, poolId, timestamp, volume }) => {
    console.log('Volume update:', { type, poolId, timestamp, volume });
  });

  socket.on('operationUpdate', (operation) => {
    console.log('Operation update:', operation);
  });

  socket.on('status_updated', (data) => {
    console.log('Status update:', data);
  });

  socket.on('deposit_address_generated', ({ requestId, chainId, address, memo }) => {
    console.log('Deposit address generated:', { requestId, chainId, address, memo });
  });

  socket.on('deposit_processed', (data) => {
    const { amount, coin, chain, confirmations, status, credited } = data;
    const message =
      status === 'confirmed' && credited
        ? `Deposit of ${amount} ${coin.ticker} confirmed!`
        : `Deposit of ${amount} ${coin.ticker} (confirming) [${confirmations}/${chain.requiredConfirmations}]`;
    console.log('Deposit processed:', { message, data });
  });

  socket.on('withdrawal_processed', (data) => {
    const { amount, coin, chain, confirmations, status, credited, createdAt } = data;
    let message;
    if (!createdAt) {
      message = `Withdrawal of ${amount} ${coin.ticker} is stalled due to network congestion.`;
    } else if (status === 'confirmed' && credited) {
      message = `Withdrawal of ${amount} ${coin.ticker} confirmed!`;
    } else {
      message = `Withdrawal of ${amount} ${coin.ticker} (confirming) [${confirmations}/${chain.requiredConfirmations}]`;
    }
    console.log('Withdrawal processed:', { message, data });
  });

  socket.on('withdrawal_initiated', (data) => {
    console.log('Withdrawal initiated:', data);
  });

  socket.on('withdrawal_pin_generated', ({ pinImage, ticker, amount, pendingWithdrawalId, expiresAt, dp, fee, memoRequired }) => {
    console.log('Withdrawal pin generated:', {
      ticker,
      amount,
      pinImage,
      pendingWithdrawalId,
      expiresAt,
      dp,
      fee,
      memoRequired,
    });
  });

  socket.on('withdrawal_queued', ({ pendingWithdrawalId, ticker }) => {
    console.log('Withdrawal queued:', { pendingWithdrawalId, ticker });
  });

  socket.on('withdrawal_canceled', ({ ticker, amount }) => {
    console.log('Withdrawal canceled:', { ticker, amount });
  });

  // socket.on('recent_yard_messages', (initialMessages) => {
  //   console.log('Recent yard messages:', initialMessages);
  // });

  socket.on('yard_message', (message) => {
    console.log('New chat message:', {
      username: message.username,
      text: message.text,
      role: message.role,
      timestamp: new Date(message.timestamp).toLocaleString(),
    });
  });

  socket.on('message_deleted', ({ messageId }) => {
    console.log('Message deleted:', { messageId });
  });

  socket.on('banned', ({ reason, bannedUntil }) => {
    console.log('Banned from yard:', {
      reason,
      bannedUntil: new Date(bannedUntil).toLocaleString(),
    });
  });

  socket.on('withdrawal_updated', ({ pendingWithdrawalId, expiresAt, stage }) => {
    console.log('Withdrawal updated:', { pendingWithdrawalId, expiresAt, stage });
  });

  socket.on('withdrawal_expired', ({ pendingWithdrawalId, ticker, amount }) => {
    console.log('Withdrawal expired:', { pendingWithdrawalId, ticker, amount });
  });

  socket.on('pong', () => {
    console.log('Received pong from server');
  });

  const heartbeatInterval = setInterval(() => {
    if (socket.connected) {
      socket.emit('ping');
    }
  }, 30000);

  socket.on('close', () => {
    clearInterval(heartbeatInterval);
    resetPools();
    resetCoins();
    resetWallets();
    resetUserShares();
  });

  socket.on('connect', () => {
    socket.emit('yard_message', {
      text: 'Hello from RunesX API Key Example Bot!!',
    });
  });

  return { socket };
}