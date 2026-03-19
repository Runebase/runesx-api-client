// src/store/exchangeConfigStore.mjs
// Exchange configuration received from the backend via socket.
// Keeps fee rates, depth limits, etc. in sync without hardcoding.

const exchangeConfigStore = {
  clobFees: {
    takerFeeRate: '0.002', // sensible default until backend config arrives
    makerFeeRate: '0.001',
    maxFillBatch: 50,
    maxFillTotal: 500,
  },
};

const setExchangeConfig = (config) => {
  const { clobFees } = config;
  if (clobFees) {
    if (clobFees.takerFeeRate !== null && clobFees.takerFeeRate !== undefined) {
      exchangeConfigStore.clobFees.takerFeeRate = clobFees.takerFeeRate;
    }
    if (clobFees.makerFeeRate !== null && clobFees.makerFeeRate !== undefined) {
      exchangeConfigStore.clobFees.makerFeeRate = clobFees.makerFeeRate;
    }
    if (clobFees.maxFillBatch !== null && clobFees.maxFillBatch !== undefined) {
      exchangeConfigStore.clobFees.maxFillBatch = clobFees.maxFillBatch;
    }
    if (clobFees.maxFillTotal !== null && clobFees.maxFillTotal !== undefined) {
      exchangeConfigStore.clobFees.maxFillTotal = clobFees.maxFillTotal;
    }
  }
};

const getClobFees = () => exchangeConfigStore.clobFees;

const resetExchangeConfig = () => {
  exchangeConfigStore.clobFees = {
    takerFeeRate: '0.002',
    makerFeeRate: '0.001',
    maxFillBatch: 50,
    maxFillTotal: 500,
  };
};

export {
  exchangeConfigStore,
  setExchangeConfig,
  getClobFees,
  resetExchangeConfig,
};
