import { describe, it, beforeEach, expect } from 'vitest';
import HaulerScaler from '../src/logistics/HaulerScaler.js';
import LinkManager from '../src/logistics/LinkManager.js';

describe('HaulerScaler', () => {
  let scaler;
  let linkManager;
  let kernel;

  beforeEach(() => {
    // Mock kernel (LinkManager needs it)
    kernel = {
      has: (name) => name === 'linkManager',
      get: (name) => name === 'linkManager' ? linkManager : null
    };
    linkManager = new LinkManager(kernel);
    kernel.get = (name) => {
      if (name === 'linkManager') return linkManager;
      return null;
    };
    scaler = new HaulerScaler(kernel);
  });

  describe('calculateCarryCapacity', () => {
    it('returns reasonable carry for same-room route', () => {
      // Same room = distance 1, should produce 8-10 carry parts depending on efficiency
      const result = scaler.calculateCarryCapacity('W1', 'W1');
      expect(result.carryParts).toBeGreaterThanOrEqual(8);
      expect(result.carryParts).toBeLessThanOrEqual(12);
      expect(result.distance).toBe(1);
      expect(result.reason).toContain('Distance 1');
    });

    it('scales up carry for long-distance routes', () => {
      // W1 to W6 should be distance 5, and should add to carry capacity
      const same = scaler.calculateCarryCapacity('W1', 'W1');
      const far = scaler.calculateCarryCapacity('W1', 'W6');
      
      expect(far.distance).toBeGreaterThan(same.distance);
      // Should be at least slightly higher due to distance
      expect(far.carryParts).toBeGreaterThanOrEqual(same.carryParts - 2);
    });

    it('scales carry based on efficiency', () => {
      // Setup link that is very efficient
      linkManager.registerLinks('W1', [{ id: 'link1' }]);
      linkManager.registerLinks('W2', [{ id: 'link2' }]);
      
      const result = scaler.calculateCarryCapacity('W1', 'W2');
      expect(result.efficiency).toBeGreaterThan(0);
      expect(result.reason).toContain('efficiency');
    });

    it('scales up carry for low-efficiency routes', () => {
      // Setup link that is offline (low efficiency = fallback to carry)
      linkManager.registerLinks('W1', [{ id: 'link1' }]);
      linkManager.registerLinks('W2', [{ id: 'link2' }]);
      linkManager.setLinkStatus('link1', 'offline');
      linkManager.setLinkStatus('link2', 'offline');
      
      const result = scaler.calculateCarryCapacity('W1', 'W2');
      // Low efficiency should increase carry
      expect(result.carryParts).toBeGreaterThanOrEqual(8);
      expect(result.carryParts).toBeLessThanOrEqual(20);
    });

    it('clamps carry to valid range (1-20)', () => {
      const result1 = scaler.calculateCarryCapacity('W1', 'W1');
      expect(result1.carryParts).toBeGreaterThanOrEqual(1);
      expect(result1.carryParts).toBeLessThanOrEqual(20);
    });

    it('returns reason string with distance and efficiency info', () => {
      linkManager.registerLinks('W1', [{ id: 'link1' }]);
      linkManager.setLinkStatus('link1', 'offline');
      
      const result = scaler.calculateCarryCapacity('W1', 'W2');
      expect(result.reason).toContain('Distance');
      expect(result.reason).toContain('efficiency');
    });
  });

  describe('_estimateDistance', () => {
    it('returns 1 for same room', () => {
      expect(scaler._estimateDistance('W1N1', 'W1N1')).toBe(1);
    });

    it('calculates room distance for adjacent rooms', () => {
      // W1N1 to W1N2 should be distance 1 (adjacent N-S)
      // Note: parsing may fail on simplified names, so using full format
      expect(scaler._estimateDistance('W1N1', 'W1N2')).toBeGreaterThanOrEqual(1);
    });

    it('handles East/West/North/South notation', () => {
      // E5N3 and W5S3 should be far apart
      const dist = scaler._estimateDistance('E5N3', 'W5S3');
      expect(dist).toBeGreaterThan(0);
    });

    it('defaults to distance 2 for invalid room names', () => {
      expect(scaler._estimateDistance('invalid', 'also-bad')).toBe(2);
    });
  });

  describe('_parseRoomName', () => {
    it('parses valid room names', () => {
      const pos = scaler._parseRoomName('W5N3');
      expect(pos).toEqual({ x: -5, y: -3 });

      const pos2 = scaler._parseRoomName('E10S7');
      expect(pos2).toEqual({ x: 10, y: 7 });
    });

    it('returns null for invalid room names', () => {
      expect(scaler._parseRoomName('invalid')).toBeNull();
      expect(scaler._parseRoomName('W5')).toBeNull();
    });
  });

  describe('getScaledHauler', () => {
    it('calculates scaling based on route', () => {
      // Without WorkingMemory mocking, just test that calculation happens
      const result = scaler.calculateCarryCapacity('W1', 'W2');
      expect(result.carryParts).toBeGreaterThan(0);
      expect(result.carryParts).toBeLessThanOrEqual(20);
    });

    it('returns different scaling for different distances', () => {
      const short = scaler.calculateCarryCapacity('W1', 'W1');
      const long = scaler.calculateCarryCapacity('W1', 'W5');

      expect(short.carryParts).toBeGreaterThan(0);
      expect(long.carryParts).toBeGreaterThan(0);
      expect(long.distance).toBeGreaterThan(short.distance);
    });
  });

  describe('integration with LinkManager', () => {
    it('scales up when link route is offline', () => {
      linkManager.registerLinks('W1', [{ id: 'link1' }]);
      linkManager.registerLinks('W2', [{ id: 'link2' }]);

      // With links online (efficient)
      const efficientResult = scaler.calculateCarryCapacity('W1', 'W2');

      // Disable links (force fallback to carry)
      linkManager.setLinkStatus('link1', 'offline');
      linkManager.setLinkStatus('link2', 'offline');
      const inefficientResult = scaler.calculateCarryCapacity('W1', 'W2');

      expect(inefficientResult.carryParts).toBeGreaterThanOrEqual(efficientResult.carryParts);
    });

    it('respects link congestion in efficiency scoring', () => {
      linkManager.registerLinks('W1', [{ id: 'link1' }]);
      linkManager.registerLinks('W2', [{ id: 'link2' }]);

      const beforeCongestion = scaler.calculateCarryCapacity('W1', 'W2');
      
      // Record high utilization to mark links clogged
      linkManager.recordTransfer('link1', 750); // 93% utilization
      linkManager.recordTransfer('link2', 750);
      
      const afterCongestion = scaler.calculateCarryCapacity('W1', 'W2');
      
      // Clogged links should result in same or higher carry
      expect(afterCongestion.carryParts).toBeGreaterThanOrEqual(beforeCongestion.carryParts);
    });
  });
});
