import { BigNumber } from 'bignumber.js';

const poolStore = {
  pools: new Map(), // Store pool data by pool ID
  isInitialReceived: false, // Track if initial pool data is received
  pendingUpdates: [], // Buffer for updates before initial data
};

// Initialize pools with initial data
const setInitialPools = (pools) => {
  poolStore.pools.clear();
  pools.forEach(pool => {
    poolStore.pools.set(pool.id, {
      id: pool.id,
      reserveA: new BigNumber(pool.reserveA),
      reserveB: new BigNumber(pool.reserveB),
      totalShares: new BigNumber(pool.totalShares),
      activeLiquidityProviders: pool.activeLiquidityProviders || 0,
      runesCompliant: pool.runesCompliant || false,
      lpFeeRate: pool.lpFeeRate || 30,
      treasuryFeeRate: pool.treasuryFeeRate || 5,
      coinA: pool.coinA,
      coinB: pool.coinB,
      liquidityShares: pool.liquidityShares || [],
      updatedAt: pool.updatedAt,
    });
  });
  poolStore.isInitialReceived = true;
  console.log(`Initialized with ${pools.length} pools`);

  // Process buffered updates
  if (poolStore.pendingUpdates.length > 0) {
    console.log(`Processing ${poolStore.pendingUpdates.length} buffered pool updates`);
    poolStore.pendingUpdates.forEach(({ pools }) => {
      pools.forEach(pool => updatePool(pool));
    });
    poolStore.pendingUpdates = [];
  }
};

// Update a single pool
const updatePool = (pool) => {
  if (!poolStore.isInitialReceived) {
    console.log('Buffering pool update, initial data not yet received:', pool);
    poolStore.pendingUpdates.push({ pools: [pool] });
    return;
  }

  const existingPool = poolStore.pools.get(pool.id);
  const incomingUpdatedAt = new Date(pool.updatedAt).getTime();

  if (existingPool) {
    const existingUpdatedAt = new Date(existingPool.updatedAt).getTime();
    if (incomingUpdatedAt <= existingUpdatedAt) {
      console.log(`Skipping stale update for pool ${pool.id}`);
      return;
    }

    console.log(`Updating pool ${pool.id}:`, {
      reserveA: pool.reserveA,
      reserveB: pool.reserveB,
      totalShares: pool.totalShares,
      activeLiquidityProviders: pool.activeLiquidityProviders,
    });

    Object.assign(existingPool, {
      reserveA: new BigNumber(pool.reserveA),
      reserveB: new BigNumber(pool.reserveB),
      updatedAt: pool.updatedAt,
      ...(pool.totalShares !== undefined && { totalShares: new BigNumber(pool.totalShares) }),
      ...(pool.activeLiquidityProviders !== undefined && { activeLiquidityProviders: pool.activeLiquidityProviders }),
      ...(pool.runesCompliant !== undefined && { runesCompliant: pool.runesCompliant }),
      ...(pool.lpFeeRate !== undefined && { lpFeeRate: pool.lpFeeRate }),
      ...(pool.treasuryFeeRate !== undefined && { treasuryFeeRate: pool.treasuryFeeRate }),
      ...(pool.coinA && { coinA: pool.coinA }),
      ...(pool.coinB && { coinB: pool.coinB }),
      ...(pool.liquidityShares && {
        liquidityShares: pool.liquidityShares.reduce((acc, newShare) => {
          if (new BigNumber(newShare.shares).isZero()) {
            return acc.filter(share => share.id !== newShare.id);
          }
          const existingShareIndex = acc.findIndex(share => share.id === newShare.id);
          if (existingShareIndex >= 0) {
            acc[existingShareIndex] = newShare;
          } else {
            acc.push(newShare);
          }
          return acc;
        }, [...(existingPool.liquidityShares || [])]),
      }),
    });

    if (new BigNumber(existingPool.totalShares).isZero()) {
      console.log(`Removing pool ${pool.id} with zero totalShares`);
      poolStore.pools.delete(pool.id);
    }
  } else if (pool.coinA && pool.coinB && new BigNumber(pool.totalShares).gt(0)) {
    console.log(`Adding new pool ${pool.id}:`, pool);
    poolStore.pools.set(pool.id, {
      id: pool.id,
      reserveA: new BigNumber(pool.reserveA),
      reserveB: new BigNumber(pool.reserveB),
      totalShares: new BigNumber(pool.totalShares),
      runesCompliant: pool.runesCompliant || false,
      lpFeeRate: pool.lpFeeRate || 30,
      treasuryFeeRate: pool.treasuryFeeRate || 5,
      coinA: pool.coinA,
      coinB: pool.coinB,
      activeLiquidityProviders: pool.activeLiquidityProviders || 0,
      liquidityShares: pool.liquidityShares || [],
      updatedAt: pool.updatedAt,
    });
  } else {
    console.warn(`Ignoring update for unknown pool ${pool.id} without full data or zero totalShares`);
  }
};

// Get all pools
const getPools = () => {
  return Array.from(poolStore.pools.values());
};

// Get a specific pool by ID
const getPool = (poolId) => {
  return poolStore.pools.get(poolId);
};

// Reset store on disconnect or error
const resetPools = () => {
  poolStore.pools.clear();
  poolStore.isInitialReceived = false;
  poolStore.pendingUpdates = [];
  console.log('Reset pool state due to disconnect or error');
};

export { poolStore, setInitialPools, updatePool, getPools, getPool, resetPools };