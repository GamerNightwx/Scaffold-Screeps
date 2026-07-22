export default class MarketManager {
  constructor(kernel) {
    this.kernel = kernel;
    this.wm = kernel && kernel.has && kernel.has('workingMemory') ? kernel.get('workingMemory') : null;
    this.orders = {}; // orderId -> { resource, type (buy/sell), amount, price, roomName, status, createdAt }
    this.priceHistory = {}; // resource -> [{ price, tick, volume }] (rolling window)
    this.maxPriceHistory = 100; // keep last N price points
    this.arbitrageThreshold = 0.05; // 5% profit threshold for arbitrage detection
  }

  _nowTick() {
    return (typeof Game !== 'undefined' && Game.time) ? Game.time : Date.now();
  }

  // Track a price observation (sell or buy order from market)
  recordPrice(resource, price, volume = 1) {
    if (!this.priceHistory[resource]) {
      this.priceHistory[resource] = [];
    }
    this.priceHistory[resource].push({ price, tick: this._nowTick(), volume });
    // truncate history
    if (this.priceHistory[resource].length > this.maxPriceHistory) {
      this.priceHistory[resource].shift();
    }
  }

  // Calculate average price for a resource (simple moving average)
  getAveragePrice(resource) {
    const history = this.priceHistory[resource];
    if (!history || history.length === 0) return 0;
    const sum = history.reduce((acc, h) => acc + h.price, 0);
    return sum / history.length;
  }

  // Detect arbitrage opportunities (price difference > threshold)
  detectArbitrage(resource, buyPrice, sellPrice) {
    if (buyPrice <= 0 || sellPrice <= 0) return null;
    const margin = (sellPrice - buyPrice) / buyPrice;
    if (margin > this.arbitrageThreshold) {
      return { resource, buyPrice, sellPrice, margin, profitRatio: margin };
    }
    return null;
  }

  // Create a buy order
  createBuyOrder(resource, amount, maxPrice, roomName) {
    const orderId = `order-buy-${Math.random().toString(36).slice(2,9)}`;
    const order = {
      id: orderId,
      resource,
      type: 'buy',
      amount,
      price: maxPrice,
      roomName,
      status: 'pending',
      createdAt: this._nowTick()
    };
    this.orders[orderId] = order;
    // persist to WM
    if (this.wm && typeof this.wm.set === 'function') {
      try {
        this.wm.set('market_orders', { id: orderId, data: order });
      } catch (e) { /* ignore */ }
    }
    return orderId;
  }

  // Create a sell order
  createSellOrder(resource, amount, minPrice, roomName) {
    const orderId = `order-sell-${Math.random().toString(36).slice(2,9)}`;
    const order = {
      id: orderId,
      resource,
      type: 'sell',
      amount,
      price: minPrice,
      roomName,
      status: 'pending',
      createdAt: this._nowTick()
    };
    this.orders[orderId] = order;
    // persist to WM
    if (this.wm && typeof this.wm.set === 'function') {
      try {
        this.wm.set('market_orders', { id: orderId, data: order });
      } catch (e) { /* ignore */ }
    }
    return orderId;
  }

  // Execute (fulfill) an order
  executeOrder(orderId, actualPrice = null, actualAmount = null) {
    const order = this.orders[orderId];
    if (!order) return false;
    order.status = 'executed';
    order.executedAt = this._nowTick();
    order.actualPrice = actualPrice || order.price;
    order.actualAmount = actualAmount || order.amount;
    // persist
    if (this.wm && typeof this.wm.set === 'function') {
      try {
        this.wm.set('market_orders', { id: orderId, data: order });
      } catch (e) { /* ignore */ }
    }
    return true;
  }

  // Cancel an order
  cancelOrder(orderId) {
    const order = this.orders[orderId];
    if (!order) return false;
    order.status = 'cancelled';
    order.cancelledAt = this._nowTick();
    // persist
    if (this.wm && typeof this.wm.set === 'function') {
      try {
        this.wm.set('market_orders', { id: orderId, data: order });
      } catch (e) { /* ignore */ }
    }
    return true;
  }

  // List all orders of a type
  listOrders(type = null, status = null) {
    return Object.values(this.orders).filter(o => {
      if (type && o.type !== type) return false;
      if (status && o.status !== status) return false;
      return true;
    });
  }

  // Estimate profit margin for resource given buy/sell prices
  estimateProfit(resource, buyPrice, sellPrice, amount) {
    if (buyPrice <= 0 || sellPrice <= 0 || amount <= 0) return 0;
    const cost = buyPrice * amount;
    const revenue = sellPrice * amount;
    return revenue - cost;
  }

  // Get price statistics for a resource
  getPriceStats(resource) {
    const history = this.priceHistory[resource];
    if (!history || history.length === 0) return { avg: 0, min: 0, max: 0, latest: 0 };
    const prices = history.map(h => h.price);
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const latest = prices[prices.length - 1];
    return { avg, min, max, latest };
  }
}
