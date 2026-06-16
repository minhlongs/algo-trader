/**
 * Unit Tests for Memory Pressure Handler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Create mock Redis client
const mockRedisClient = {
  hset: vi.fn().mockResolvedValue(1),
  setex: vi.fn().mockResolvedValue(1),
  publish: vi.fn().mockResolvedValue(1),
  get: vi.fn().mockResolvedValue(null),
};

// Mock the redis module
vi.mock('../../src/redis', () => ({
  getRedisClient: vi.fn(() => mockRedisClient),
}));

import { MemoryPressureHandler, PressureLevel, MemoryMetrics } from '../../src/utils/memory-pressure-handler';

// Mock performance.memory
const mockMemory = {
  rss: 50 * 1024 * 1024, // 50MB
  usedJSHeapSize: 30 * 1024 * 1024, // 30MB
  totalJSHeapSize: 60 * 1024 * 1024, // 60MB
  external: 5 * 1024 * 1024, // 5MB
};

describe('MemoryPressureHandler', () => {
  let handler: MemoryPressureHandler;

  beforeEach(() => {
    // Reset mock calls
    mockRedisClient.publish.mockClear();
    mockRedisClient.setex.mockClear();

    // Mock performance.memory for Cloudflare Workers environment
    vi.stubGlobal('performance', {
      memory: mockMemory,
    });

    handler = new MemoryPressureHandler();
    vi.useFakeTimers();
  });

  afterEach(() => {
    handler.stop();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('Constructor', () => {
    it('should use default configuration', () => {
      expect(handler['config'].warningThresholdMb).toBe(100);
      expect(handler['config'].criticalThresholdMb).toBe(115);
      expect(handler['config'].checkIntervalMs).toBe(5000);
      expect(handler['config'].autoCleanup).toBe(true);
    });

    it('should accept custom configuration', () => {
      const customHandler = new MemoryPressureHandler({
        warningThresholdMb: 80,
        criticalThresholdMb: 90,
        checkIntervalMs: 10000,
        autoCleanup: false,
      });

      expect(customHandler['config'].warningThresholdMb).toBe(80);
      expect(customHandler['config'].criticalThresholdMb).toBe(90);
      expect(customHandler['config'].autoCleanup).toBe(false);
    });
  });

  describe('start and stop', () => {
    it('should start monitoring', () => {
      expect(handler['intervalId']).toBeNull();
      handler.start();
      expect(handler['intervalId']).not.toBeNull();
    });

    it('should not start twice', () => {
      handler.start();
      const intervalId = handler['intervalId'];
      handler.start();
      expect(handler['intervalId']).toBe(intervalId);
    });

    it('should stop monitoring', () => {
      handler.start();
      expect(handler['intervalId']).not.toBeNull();

      handler.stop();
      expect(handler['intervalId']).toBeNull();
    });
  });

  describe('getMemoryMetrics', () => {
    it('should return performance memory in Worker environment', () => {
      const metrics = handler.getMemoryMetrics();

      expect(metrics.rss).toBe(mockMemory.rss);
      expect(metrics.heapUsed).toBe(mockMemory.usedJSHeapSize);
      expect(metrics.heapTotal).toBe(mockMemory.totalJSHeapSize);
      expect(metrics.limit).toBe(128 * 1024 * 1024);
    });

    it('should fallback to process.memoryUsage in Node.js when performance unavailable', () => {
      // Remove performance mock to trigger fallback
      // @ts-expect-error
      delete global.performance;

      const metrics = handler.getMemoryMetrics();

      // process.memoryUsage returns real values
      expect(metrics.rss).toBeGreaterThan(0);
      expect(metrics.heapUsed).toBeGreaterThan(0);
      expect(metrics.heapTotal).toBeGreaterThanOrEqual(metrics.heapUsed);
      expect(metrics.limit).toBe(128 * 1024 * 1024);
    });
  });

  describe('checkAndHandle', () => {
    it('should set normal pressure when below warning threshold', async () => {
      mockMemory.rss = 50 * 1024 * 1024; // 50MB

      await handler.checkAndHandle();

      expect(handler.getPressureLevel()).toBe('normal');
    });

    it('should set warning pressure when above warning threshold', async () => {
      mockMemory.rss = 110 * 1024 * 1024; // 110MB (above 100MB warning)

      await handler.checkAndHandle();

      expect(handler.getPressureLevel()).toBe('warning');
    });

    it('should set critical pressure when above critical threshold', async () => {
      mockMemory.rss = 130 * 1024 * 1024; // 130MB (above 115MB critical)

      await handler.checkAndHandle();

      expect(handler.getPressureLevel()).toBe('critical');
    });

    it('should record metrics to history', async () => {
      mockMemory.rss = 50 * 1024 * 1024;

      await handler.checkAndHandle();
      await handler.checkAndHandle();

      const summary = handler.getMemorySummary();
      expect(summary.historySize).toBe(2);
    });

    it('should limit history size to MAX_HISTORY_SIZE', async () => {
      mockMemory.rss = 50 * 1024 * 1024;

      // Run more than MAX_HISTORY_SIZE times
      for (let i = 0; i < 150; i++) {
        await handler.checkAndHandle();
      }

      const summary = handler.getMemorySummary();
      expect(summary.historySize).toBe(100); // MAX_HISTORY_SIZE
    });

    it('should call light cleanup on warning level when autoCleanup enabled', async () => {
      mockMemory.rss = 110 * 1024 * 1024;
      const cleanupSpy = vi.spyOn(handler as any, 'triggerLightCleanup');

      await handler.checkAndHandle();

      expect(cleanupSpy).toHaveBeenCalled();
    });

    it('should call critical cleanup on critical level', async () => {
      mockMemory.rss = 130 * 1024 * 1024;
      const cleanupSpy = vi.spyOn(handler as any, 'triggerCriticalCleanup');

      await handler.checkAndHandle();

      expect(cleanupSpy).toHaveBeenCalled();
    });

    it('should publish critical alert to Redis on critical pressure', async () => {
      mockMemory.rss = 130 * 1024 * 1024;

      await handler.checkAndHandle();

      expect(mockRedisClient.publish).toHaveBeenCalledWith(
        'memory-pressure',
        expect.stringContaining('"level":"critical"')
      );
    });
  });

  describe('getMemorySummary', () => {
    it('should return current metrics, level and history size', async () => {
      mockMemory.rss = 50 * 1024 * 1024;

      await handler.checkAndHandle();

      const summary = handler.getMemorySummary();

      expect(summary.metrics).toBeDefined();
      expect(summary.level).toBe('normal');
      expect(summary.historySize).toBeGreaterThan(0);
    });
  });

  describe('triggerCriticalCleanup', () => {
    it('should call default critical handler', async () => {
      const criticalHandlerSpy = vi.spyOn((handler as any).config, 'onCritical');

      await (handler as any).triggerCriticalCleanup();

      expect(criticalHandlerSpy).toHaveBeenCalled();
    });

    it('should publish memory-pressure alert to Redis', async () => {
      await (handler as any).triggerCriticalCleanup();

      expect(mockRedisClient.publish).toHaveBeenCalledWith(
        'memory-pressure',
        expect.any(String)
      );
    });
  });

  describe('triggerCleanup', () => {
    it('should set cleanup triggered flag in Redis', async () => {
      await (handler as any).triggerCleanup();

      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        'memory:cleanup:triggered',
        60,
        expect.any(String)
      );
    });
  });

  describe('getPressureLevel', () => {
    it('should return current pressure level', () => {
      expect(handler.getPressureLevel()).toBe('normal');
    });
  });
});

describe('MemoryMetrics Interface', () => {
  it('should match expected structure', () => {
    const metrics: MemoryMetrics = {
      rss: 1024,
      heapUsed: 512,
      heapTotal: 1024,
      external: 256,
      limit: 128 * 1024 * 1024,
    };

    expect(metrics.rss).toBeGreaterThan(0);
    expect(metrics.heapUsed).toBeLessThanOrEqual(metrics.heapTotal);
    expect(metrics.limit).toBe(134217728); // 128MB
  });
});

describe('PressureLevel Type', () => {
  it('should accept valid pressure levels', () => {
    const levels: PressureLevel[] = ['normal', 'warning', 'critical'];

    expect(levels).toContain('normal');
    expect(levels).toContain('warning');
    expect(levels).toContain('critical');
  });
});
