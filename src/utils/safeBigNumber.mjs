// src/utils/safeBigNumber.mjs
// Isolated BigNumber constructor aligned with the backend's SafeBigNumber
// (runesx-api/src/utils/safeBigNumber.mjs). Uses the same DECIMAL_PLACES=40
// and EXPONENTIAL_AT=[-100, 100] configuration to ensure estimation arithmetic
// matches backend financial calculations.
import BigNumber from 'bignumber.js';

export const SafeBigNumber = BigNumber.clone({
  DECIMAL_PLACES: 40,
  EXPONENTIAL_AT: [-100, 100],
});
