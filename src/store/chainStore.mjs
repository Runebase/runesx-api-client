const chainStore = {
  chains: new Map(), // Store chain data by name (lowercase)
  isInitialReceived: false,
  pendingUpdates: [],
};

const setInitialChains = (chains) => {
  chainStore.chains.clear();
  chains.forEach(chain => {
    chainStore.chains.set(chain.name.toLowerCase(), {
      id: chain.id,
      name: chain.name,
      blockchainId: chain.blockchainId,
      requiredConfirmations: chain.requiredConfirmations,
      hasMemo: chain.hasMemo,
      status: chain.status,
      chainType: chain.chainType,
      nativeTicker: chain.nativeTicker,
      explorerTxUrl: chain.explorerTxUrl,
      updatedAt: chain.updatedAt,
    });
  });
  chainStore.isInitialReceived = true;

  if (chainStore.pendingUpdates.length > 0) {
    chainStore.pendingUpdates.forEach(({ chains }) => {
      chains.forEach(chain => updateChain(chain));
    });
    chainStore.pendingUpdates = [];
  }
};

const updateChain = (chain) => {
  if (!chainStore.isInitialReceived) {
    chainStore.pendingUpdates.push({ chains: [chain] });
    return;
  }

  const key = chain.name.toLowerCase();
  const existingChain = chainStore.chains.get(key);
  const incomingUpdatedAt = new Date(chain.updatedAt).getTime();

  if (existingChain) {
    const existingUpdatedAt = new Date(existingChain.updatedAt).getTime();
    if (incomingUpdatedAt <= existingUpdatedAt) {
      return;
    }

    chainStore.chains.set(key, {
      ...existingChain,
      blockchainId: chain.blockchainId,
      requiredConfirmations: chain.requiredConfirmations,
      hasMemo: chain.hasMemo,
      status: chain.status,
      chainType: chain.chainType,
      nativeTicker: chain.nativeTicker,
      explorerTxUrl: chain.explorerTxUrl,
      updatedAt: chain.updatedAt,
    });
  } else if (chain.name && chain.status) {
    chainStore.chains.set(key, {
      id: chain.id,
      name: chain.name,
      blockchainId: chain.blockchainId,
      requiredConfirmations: chain.requiredConfirmations,
      hasMemo: chain.hasMemo,
      status: chain.status,
      chainType: chain.chainType,
      nativeTicker: chain.nativeTicker,
      explorerTxUrl: chain.explorerTxUrl,
      updatedAt: chain.updatedAt,
    });
  } else {
    console.warn(`Ignoring update for unknown chain ${chain.name} with incomplete data`);
  }
};

const getChains = () => {
  return Array.from(chainStore.chains.values());
};

const getChainByName = (name) => {
  return chainStore.chains.get(name.toLowerCase());
};

const resetChains = () => {
  chainStore.chains.clear();
  chainStore.isInitialReceived = false;
  chainStore.pendingUpdates = [];
};

export { chainStore, setInitialChains, updateChain, getChains, getChainByName, resetChains };
