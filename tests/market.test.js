import { describe, it, expect, beforeEach } from 'vitest';
import MarketManager from '../src/economy/MarketManager.js';

describe('MarketManager', () => {
  let wm;
  let mm;
  let kernel;

  beforeEach(() => {
    wm = { _c: {}, list: (col) => Object.values(wm._c[col] || {}), set: (col, obj) => { if (!wm._c[col]) wm._c[col] = {}; wm._c[col][obj.id] = obj; }, get: (col, id) => (wm._c[col] || {})[id] || null };
    kernel = { has: (n) => n === 'workingMemory', get: (n) => n === 'workingMemory' ? wm : null };
    mm = new MarketManager(kernel);
  });

  it('records price and calculates average', () => {
    mm.recordPrice('energy', 0.5, 100);
    mm.recordPrice('energy', 0.6, 50);
    mm.recordPrice('energy', 0.55, 75);
    const avg = mm.getAveragePrice('energy');
    expect(avg).toBeCloseTo(0.55, 2);
  });

  it('detects arbitrage opportunities', () => {
    const arb = mm.detectArbitrage('energy', 0.5, 0.6); // 20% margin
    expect(arb).not.toBeNull();
    expect(arb.profitRatio).toBeGreaterThan(0.05); // above 5% threshold

    const noArb = mm.detectArbitrage('energy', 0.5, 0.52); // 4% margin
    expect(noArb).toBeNull();
  });

  it('creates buy order and persists', () => {
    const orderId = mm.createBuyOrder('energy', 1000, 0.5, 'W1');
    expect(orderId).toBeDefined();
    const order = mm.orders[orderId];
    expect(order.type).toBe('buy');
    expect(order.amount).toBe(1000);
    expect(order.status).toBe('pending');
    const persisted = wm.get('market_orders', orderId);
    expect(persisted).not.toBeNull();
  });

  it('creates sell order and persists', () => {
    const orderId = mm.createSellOrder('energy', 500, 0.6, 'W1');
    expect(orderId).toBeDefined();
    const order = mm.orders[orderId];
    expect(order.type).toBe('sell');
    expect(order.amount).toBe(500);
    const persisted = wm.get('market_orders', orderId);
    expect(persisted).not.toBeNull();
  });

  it('executes order and records actual price/amount', () => {
    const orderId = mm.createBuyOrder('energy', 1000, 0.5, 'W1');
    const result = mm.executeOrder(orderId, 0.48, 1000);
    expect(result).toBe(true);
    expect(mm.orders[orderId].status).toBe('executed');
    expect(mm.orders[orderId].actualPrice).toBe(0.48);
    expect(mm.orders[orderId].actualAmount).toBe(1000);
  });

  it('cancels order', () => {
    const orderId = mm.createBuyOrder('energy', 1000, 0.5, 'W1');
    const result = mm.cancelOrder(orderId);
    expect(result).toBe(true);
    expect(mm.orders[orderId].status).toBe('cancelled');
  });

  it('lists orders by type and status', () => {
    mm.createBuyOrder('energy', 1000, 0.5, 'W1');
    mm.createSellOrder('energy', 500, 0.6, 'W1');
    const buyOrders = mm.listOrders('buy');
    expect(buyOrders.length).toBe(1);
    const allOrders = mm.listOrders();
    expect(allOrders.length).toBe(2);
  });

  it('estimates profit', () => {
    const profit = mm.estimateProfit('energy', 0.5, 0.6, 1000);
    expect(profit).toBe(100); // (0.6 - 0.5) * 1000
  });

  it('returns price statistics', () => {
    mm.recordPrice('energy', 0.5);
    mm.recordPrice('energy', 0.6);
    mm.recordPrice('energy', 0.55);
    const stats = mm.getPriceStats('energy');
    expect(stats.avg).toBeCloseTo(0.55, 2);
    expect(stats.min).toBe(0.5);
    expect(stats.max).toBe(0.6);
    expect(stats.latest).toBe(0.55);
  });
});
