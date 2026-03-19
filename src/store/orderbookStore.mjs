const orderbookStore = {
  books: new Map(), // pair -> { bids: [[price, qty], ...], asks: [[price, qty], ...] }
  isInitialReceived: false,
  pendingUpdates: [],
  userOrders: [], // User's open CLOB orders (across all pairs)
};

// Initialize all order books with initial data
const setInitialOrderBooks = (books) => {
  orderbookStore.books.clear();
  for (const [pair, depth] of Object.entries(books)) {
    orderbookStore.books.set(pair, {
      bids: depth.bids || [],
      asks: depth.asks || [],
    });
  }
  orderbookStore.isInitialReceived = true;

  // Process buffered updates
  if (orderbookStore.pendingUpdates.length > 0) {
    orderbookStore.pendingUpdates.forEach(({ pair, bids, asks }) => {
      updateOrderBook(pair, bids, asks);
    });
    orderbookStore.pendingUpdates = [];
  }
};

// Update a single order book
const updateOrderBook = (pair, bids, asks) => {
  if (!orderbookStore.isInitialReceived) {
    orderbookStore.pendingUpdates.push({ pair, bids, asks });
    return;
  }
  orderbookStore.books.set(pair, {
    bids: bids || [],
    asks: asks || [],
  });
};

// Get all order books as a plain object { [pair]: { bids, asks } }
const getAllOrderBooks = () => {
  const result = {};
  for (const [pair, depth] of orderbookStore.books) {
    result[pair] = depth;
  }
  return result;
};

// Get a specific order book by pair
const getOrderBook = (pair) => {
  return orderbookStore.books.get(pair) || { bids: [], asks: [] };
};

// Get all pairs with active order books
const getOrderBookPairs = () => {
  return [...orderbookStore.books.keys()];
};

// Set user's open orders (received on connect)
const setUserOrders = (orders) => {
  orderbookStore.userOrders = orders || [];
};

// Update a single user order (from order_updated event)
const updateUserOrder = (data) => {
  if (data.refresh) {return;} // caller should refetch
  const order = data.order;
  if (!order) {return;}
  const idx = orderbookStore.userOrders.findIndex((o) => o.id === order.id);
  if (idx >= 0) {
    orderbookStore.userOrders[idx] = { ...orderbookStore.userOrders[idx], ...order };
  } else {
    orderbookStore.userOrders.unshift(order);
  }
};

// Get user's open orders
const getUserOrders = () => orderbookStore.userOrders;

// Reset store on disconnect or error
const resetOrderBooks = () => {
  orderbookStore.books.clear();
  orderbookStore.isInitialReceived = false;
  orderbookStore.pendingUpdates = [];
  orderbookStore.userOrders = [];
};

export {
  orderbookStore,
  setInitialOrderBooks,
  updateOrderBook,
  getAllOrderBooks,
  getOrderBook,
  getOrderBookPairs,
  setUserOrders,
  updateUserOrder,
  getUserOrders,
  resetOrderBooks,
};
