/**
 * StrategyLoader Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { StrategyLoader, getStrategyLoader, strategyLoader } from '../loader';

describe('StrategyLoader', () => {
  let loader: StrategyLoader;

  beforeEach(() => {
    loader = new StrategyLoader();
  });

  describe('singleton', () => {
    it('should return the same instance from getInstance', () => {
      const a = StrategyLoader.getInstance();
      const b = StrategyLoader.getInstance();
      expect(a).toBe(b);
    });

    it('should return the same instance from exported singleton', () => {
      expect(strategyLoader).toBe(StrategyLoader.getInstance());
    });

    it('should return same instance from getStrategyLoader', () => {
      expect(getStrategyLoader()).toBe(StrategyLoader.getInstance());
    });

    it('should return same instance across multiple calls', () => {
      expect(getStrategyLoader()).toBe(getStrategyLoader());
    });
  });

  describe('loadStrategy', () => {
    it('should return null for unregistered strategy', async () => {
      const result = await loader.loadStrategy('non-existent');
      expect(result).toBeNull();
    });

    it('should return registered strategy', async () => {
      const info = { id: 'sma-crossover', name: 'SMA Crossover', version: '1.0.0', parameters: { period: 20 } };
      await loader.registerStrategy(info);
      const result = await loader.loadStrategy('sma-crossover');
      expect(result).toEqual(info);
    });
  });

  describe('registerStrategy', () => {
    it('should register and overwrite strategies with same id', async () => {
      const info1 = { id: 'test', name: 'Original', version: '1.0', parameters: {} };
      const info2 = { id: 'test', name: 'Updated', version: '2.0', parameters: { newParam: true } };
      await loader.registerStrategy(info1);
      await loader.registerStrategy(info2);
      const result = await loader.loadStrategy('test');
      expect(result?.name).toBe('Updated');
    });

    it('should accept strategies with empty parameters', async () => {
      const info = { id: 'empty-params', name: 'No Params', version: '1.0', parameters: {} };
      await loader.registerStrategy(info);
      const result = await loader.loadStrategy('empty-params');
      expect(result?.parameters).toEqual({});
    });
  });

  describe('unloadStrategy', () => {
    it('should return true when strategy was removed', async () => {
      await loader.registerStrategy({ id: 'removable', name: 'Temp', version: '1.0', parameters: {} });
      const result = await loader.unloadStrategy('removable');
      expect(result).toBe(true);
      expect(await loader.loadStrategy('removable')).toBeNull();
    });

    it('should return false for non-existent strategy', async () => {
      const result = await loader.unloadStrategy('does-not-exist');
      expect(result).toBe(false);
    });
  });

  describe('listStrategies', () => {
    it('should return empty array when no strategies registered', async () => {
      const list = await loader.listStrategies();
      expect(list).toHaveLength(0);
    });

    it('should list all registered strategies', async () => {
      await loader.registerStrategy({ id: 'a', name: 'Strategy A', version: '1.0', parameters: {} });
      await loader.registerStrategy({ id: 'b', name: 'Strategy B', version: '2.0', parameters: { x: 1 } });
      const list = await loader.listStrategies();
      expect(list).toHaveLength(2);
      expect(list.map((s) => s.id).sort()).toEqual(['a', 'b']);
    });
  });

  describe('instance isolation', () => {
    it('should not share state between fresh instances', async () => {
      const loader1 = new StrategyLoader();
      const loader2 = new StrategyLoader();
      await loader1.registerStrategy({ id: 'isolated', name: 'Isolated', version: '1.0', parameters: {} });
      const result2 = await loader2.loadStrategy('isolated');
      expect(result2).toBeNull();
    });
  });
});
