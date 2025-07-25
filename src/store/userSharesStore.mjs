// src/store/userSharesStore.mjs
import { BigNumber } from 'bignumber.js';

const userSharesStore = {
  userShares: new Map(),
  isInitialReceived: false,
  pendingUpdates: [],
};

const setInitialUserShares = (userShares) => {
  userSharesStore.userShares.clear();
  userShares.forEach(share => {
    userSharesStore.userShares.set(share.poolId, {
      poolId: share.poolId,
      shares: new BigNumber(share.shares).toString(),
      updatedAt: share.updatedAt,
    });
  });
  userSharesStore.isInitialReceived = true;
  console.log(`Initialized with ${userShares.length} user shares`);

  if (userSharesStore.pendingUpdates.length > 0) {
    console.log(`Processing ${userSharesStore.pendingUpdates.length} buffered user share updates`);
    userSharesStore.pendingUpdates.forEach(({ userShares }) => {
      userShares.forEach(share => updateUserShare(share));
    });
    userSharesStore.pendingUpdates = [];
  }
};

const updateUserShare = (share) => {
  if (!userSharesStore.isInitialReceived) {
    userSharesStore.pendingUpdates.push({ userShares: [share] });
    return;
  }

  const existingShare = userSharesStore.userShares.get(share.poolId);
  const incomingUpdatedAt = new Date(share.updatedAt).getTime();

  if (existingShare) {
    const existingUpdatedAt = new Date(existingShare.updatedAt).getTime();
    if (incomingUpdatedAt <= existingUpdatedAt) {
      return;
    }

    userSharesStore.userShares.set(share.poolId, {
      poolId: share.poolId,
      shares: new BigNumber(share.shares).toString(),
      updatedAt: share.updatedAt,
    });
  } else if (share.poolId && new BigNumber(share.shares).gt(0)) {
    userSharesStore.userShares.set(share.poolId, {
      poolId: share.poolId,
      shares: new BigNumber(share.shares).toString(),
      updatedAt: share.updatedAt,
    });
  } else {
    console.warn(`Ignoring update for user share in pool ${share.poolId} with zero or negative shares`);
  }

  if (existingShare && new BigNumber(share.shares).isZero()) {
    userSharesStore.userShares.delete(share.poolId);
  }
};

const getUserShares = () => {
  return Array.from(userSharesStore.userShares.values());
};

const getUserShareByPoolId = (poolId) => {
  return userSharesStore.userShares.get(poolId);
};

const resetUserShares = () => {
  userSharesStore.userShares.clear();
  userSharesStore.isInitialReceived = false;
  userSharesStore.pendingUpdates = [];
  console.log('Reset user shares state due to disconnect or error');
};

export { userSharesStore, setInitialUserShares, updateUserShare, getUserShares, getUserShareByPoolId, resetUserShares };