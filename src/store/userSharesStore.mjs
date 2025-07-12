import { BigNumber } from 'bignumber.js';

const userSharesStore = {
  userShares: new Map(), // Store user shares by poolId
  isInitialReceived: false, // Track if initial shares data is received
  pendingUpdates: [], // Buffer for updates before initial data
};

// Initialize user shares with initial data
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

  // Process buffered updates
  if (userSharesStore.pendingUpdates.length > 0) {
    console.log(`Processing ${userSharesStore.pendingUpdates.length} buffered user share updates`);
    userSharesStore.pendingUpdates.forEach(({ userShares }) => {
      userShares.forEach(share => updateUserShare(share));
    });
    userSharesStore.pendingUpdates = [];
  }
};

// Update a single user share
const updateUserShare = (share) => {
  if (!userSharesStore.isInitialReceived) {
    console.log('Buffering user share update, initial data not yet received:', share);
    userSharesStore.pendingUpdates.push({ userShares: [share] });
    return;
  }

  const existingShare = userSharesStore.userShares.get(share.poolId);
  const incomingUpdatedAt = new Date(share.updatedAt).getTime();

  if (existingShare) {
    const existingUpdatedAt = new Date(existingShare.updatedAt).getTime();
    if (incomingUpdatedAt <= existingUpdatedAt) {
      console.log(`Skipping stale update for user share in pool ${share.poolId}`);
      return;
    }

    console.log(`Updating user share for pool ${share.poolId}:`, {
      shares: share.shares,
      updatedAt: share.updatedAt,
    });

    userSharesStore.userShares.set(share.poolId, {
      poolId: share.poolId,
      shares: new BigNumber(share.shares).toString(),
      updatedAt: share.updatedAt,
    });
  } else if (share.poolId && new BigNumber(share.shares).gt(0)) {
    console.log(`Adding new user share for pool ${share.poolId}:`, share);
    userSharesStore.userShares.set(share.poolId, {
      poolId: share.poolId,
      shares: new BigNumber(share.shares).toString(),
      updatedAt: share.updatedAt,
    });
  } else {
    console.warn(`Ignoring update for user share in pool ${share.poolId} with zero or negative shares`);
  }

  // Remove shares with zero or negative values
  if (existingShare && new BigNumber(share.shares).isZero()) {
    console.log(`Removing user share for pool ${share.poolId} with zero shares`);
    userSharesStore.userShares.delete(share.poolId);
  }
};

// Get all user shares
const getUserShares = () => {
  return Array.from(userSharesStore.userShares.values());
};

// Get a specific user share by poolId
const getUserShareByPoolId = (poolId) => {
  return userSharesStore.userShares.get(poolId);
};

// Reset store on disconnect or error
const resetUserShares = () => {
  userSharesStore.userShares.clear();
  userSharesStore.isInitialReceived = false;
  userSharesStore.pendingUpdates = [];
  console.log('Reset user shares state due to disconnect or error');
};

export { userSharesStore, setInitialUserShares, updateUserShare, getUserShares, getUserShareByPoolId, resetUserShares };