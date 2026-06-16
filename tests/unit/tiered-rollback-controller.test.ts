/**
 * Unit Tests for Tiered Rollback Controller
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TieredRollbackController, RollbackLayer, RollbackState, getRollbackController } from '../../src/rollback/tiered-rollback-controller';

// Mock redis module
const mockRedisClient = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue('OK'),
  del: vi.fn().mockResolvedValue(1),
  hget: vi.fn().mockResolvedValue(null),
  publish: vi.fn().mockResolvedValue(1),
};

vi.mock('../../src/redis', () => ({
  getRedisClient: vi.fn(() => mockRedisClient),
}));

// Mock prometheus metrics
vi.mock('../../src/middleware/prometheus-metrics', () => ({
  setQwenKillSwitch: vi.fn(),
  setQwenDrawdownAutoDisabled: vi.fn(),
  setQwenPaperGateDaysRemaining: vi.fn(),
}));

// Mock getTracer and getMessageBus
vi.mock('../../src/utils/tracing', () => ({
  getTracer: vi.fn(() => ({
    startActiveSpan: vi.fn((name, fn) => fn({ setAttribute: vi.fn() })),
  })),
  getMessageBus: vi.fn(() => ({
    subscribe: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe('TieredRollbackController', () => {
  let controller: TieredRollbackController;
  const now = Date.now();
  const thirtyOneDaysAgo = now - 31 * 24 * 60 * 60 * 1000;

  function mockAllLayers(overrides: {
    signalsTs?: number | null;
    killActive?: string | null;
    disabled?: string | null;
    drawdownTier?: string | null;
    paperAgeMs?: string | null;
    liveEligible?: boolean;
  } = {}) {
    const signals = overrides.signalsTs ?? now;
    const kill = overrides.killActive ?? null;
    const disabled = overrides.disabled ?? null;
    const drawdown = overrides.drawdownTier ?? null;
    const paperAge = overrides.paperAgeMs ?? thirtyOneDaysAgo.toString();
    // Apply env
    if (overrides.liveEligible !== undefined) {
      if (overrides.liveEligible) process.env.QWEN_LIVE_ELIGIBLE = 'true';
      else delete process.env.QWEN_LIVE_ELIGIBLE;
    } else {
      process.env.QWEN_LIVE_ELIGIBLE = 'true';
    }

    mockRedisClient.get = vi.fn()
      .mockResolvedValueOnce(signals.toString())
      .mockResolvedValueOnce(kill)
      .mockResolvedValueOnce(disabled)
      .mockResolvedValueOnce(paperAge);
    mockRedisClient.hget = vi.fn().mockResolvedValue(drawdown);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment
    delete process.env.QWEN_KILL;
    delete process.env.QWEN_LIVE_ELIGIBLE;
    // Create fresh controller
    controller = new TieredRollbackController({
      signalsFreshnessThresholdMs: 7 * 60 * 60 * 1000,
      paperGateMinDays: 30,
    });
  });

  describe('getStatus', () => {

    it('should return ACTIVE when all layers clear', async () => {
      mockAllLayers({
        signalsTs: now,
        killActive: null,
        disabled: null,
        drawdownTier: null,
        paperAgeMs: thirtyOneDaysAgo.toString(),
        liveEligible: true,
      });

      const status = await controller.getStatus();

      expect(status.overall).toBe(RollbackState.ACTIVE);
      expect(status.blockingLayers).toHaveLength(0);
    });

    it('should return BLOCKED when L1 kill switch active', async () => {
      process.env.QWEN_KILL = '1';
      mockAllLayers({
        signalsTs: now,
        killActive: '1', // Redis also set
        disabled: null,
        drawdownTier: null,
        paperAgeMs: thirtyOneDaysAgo.toString(),
        liveEligible: true,
      });

      const status = await controller.getStatus();

      expect(status.overall).toBe(RollbackState.BLOCKED);
      expect(status.blockingLayers).toContain(RollbackLayer.L1_KILL);
    });

    it('should return BLOCKED when L2 swarm disabled', async () => {
      mockAllLayers({
        signalsTs: now,
        killActive: null,
        disabled: '1',
        drawdownTier: null,
        paperAgeMs: thirtyOneDaysAgo.toString(),
        liveEligible: true,
      });

      const status = await controller.getStatus();

      expect(status.overall).toBe(RollbackState.BLOCKED);
      expect(status.blockingLayers).toContain(RollbackLayer.L2_DISABLED);
    });

    it('should return HALTED when L3 drawdown HALT tier', async () => {
      mockAllLayers({
        signalsTs: now,
        killActive: null,
        disabled: null,
        drawdownTier: 'HALT',
        paperAgeMs: thirtyOneDaysAgo.toString(),
        liveEligible: true,
      });

      const status = await controller.getStatus();

      expect(status.overall).toBe(RollbackState.HALTED);
      expect(status.blockingLayers).toContain(RollbackLayer.L3_DRAWDOWN);
    });

    it('should return HALTED when L3 drawdown DAILY_PAUSE tier', async () => {
      mockAllLayers({
        signalsTs: now,
        killActive: null,
        disabled: null,
        drawdownTier: 'DAILY_PAUSE',
        paperAgeMs: thirtyOneDaysAgo.toString(),
        liveEligible: true,
      });

      const status = await controller.getStatus();

      expect(status.overall).toBe(RollbackState.HALTED);
      expect(status.blockingLayers).toContain(RollbackLayer.L3_DRAWDOWN);
    });

    it('should return RESTRICTED when L3 drawdown ALERT tier', async () => {
      mockAllLayers({
        signalsTs: now,
        killActive: null,
        disabled: null,
        drawdownTier: 'ALERT',
        paperAgeMs: thirtyOneDaysAgo.toString(),
        liveEligible: true,
      });

      const status = await controller.getStatus();

      expect(status.overall).toBe(RollbackState.RESTRICTED);
      expect(status.blockingLayers).toContain(RollbackLayer.L3_DRAWDOWN);
    });

    it('should return RESTRICTED when L3 drawdown REDUCE tier', async () => {
      mockAllLayers({
        signalsTs: now,
        killActive: null,
        disabled: null,
        drawdownTier: 'REDUCE',
        paperAgeMs: thirtyOneDaysAgo.toString(),
        liveEligible: true,
      });

      const status = await controller.getStatus();

      expect(status.overall).toBe(RollbackState.RESTRICTED);
      expect(status.blockingLayers).toContain(RollbackLayer.L3_DRAWDOWN);
    });

    it('should return BLOCKED when L3 drawdown HARD_STOP tier', async () => {
      mockAllLayers({
        signalsTs: now,
        killActive: null,
        disabled: null,
        drawdownTier: 'HARD_STOP',
        paperAgeMs: thirtyOneDaysAgo.toString(),
        liveEligible: true,
      });

      const status = await controller.getStatus();

      expect(status.overall).toBe(RollbackState.BLOCKED);
      expect(status.blockingLayers).toContain(RollbackLayer.L3_DRAWDOWN);
    });

    it('should return RESTRICTED when L4 paper gate not ready', async () => {
      mockAllLayers({
        signalsTs: now,
        killActive: null,
        disabled: null,
        drawdownTier: null,
        paperAgeMs: null, // no age recorded
        liveEligible: false, // not eligible
      });

      const status = await controller.getStatus();

      expect(status.overall).toBe(RollbackState.RESTRICTED);
      expect(status.blockingLayers).toContain(RollbackLayer.L4_PAPER_GATE);
    });

    it('should return HALTED when L0 signals loop stale', async () => {
      const staleTime = Date.now() - 8 * 60 * 60 * 1000; // 8 hours ago
      mockAllLayers({
        signalsTs: staleTime,
        killActive: null,
        disabled: null,
        drawdownTier: null,
        paperAgeMs: thirtyOneDaysAgo.toString(),
        liveEligible: true,
      });

      const status = await controller.getStatus();

      expect(status.overall).toBe(RollbackState.HALTED);
      expect(status.blockingLayers).toContain(RollbackLayer.L0_SIGNALS);
    });
  });

  describe('canTrade', () => {
    it('should return true when ACTIVE', async () => {
      mockAllLayers({
        signalsTs: now,
        killActive: null,
        disabled: null,
        drawdownTier: null,
        paperAgeMs: thirtyOneDaysAgo.toString(),
        liveEligible: true,
      });

      expect(await controller.canTrade()).toBe(true);
    });

    it('should return false when BLOCKED', async () => {
      process.env.QWEN_KILL = '1';
      mockAllLayers({
        signalsTs: now,
        killActive: '1',
        disabled: null,
        drawdownTier: null,
        paperAgeMs: thirtyOneDaysAgo.toString(),
        liveEligible: true,
      });

      expect(await controller.canTrade()).toBe(false);
    });

    it('should return false when HALTED', async () => {
      mockAllLayers({
        signalsTs: now,
        killActive: null,
        disabled: null,
        drawdownTier: 'HALT',
        paperAgeMs: thirtyOneDaysAgo.toString(),
        liveEligible: true,
      });

      expect(await controller.canTrade()).toBe(false);
    });

    it('should return false when RESTRICTED', async () => {
      mockAllLayers({
        signalsTs: now,
        killActive: null,
        disabled: null,
        drawdownTier: null,
        paperAgeMs: null,
        liveEligible: false,
      });

      expect(await controller.canTrade()).toBe(false);
    });
  });

  describe('getBlockingReasons', () => {
    it('should return array of reasons', async () => {
      process.env.QWEN_KILL = '1';
      mockAllLayers({
        signalsTs: now,
        killActive: '1',
        disabled: null,
        drawdownTier: null,
        paperAgeMs: thirtyOneDaysAgo.toString(),
        liveEligible: true,
      });

      const reasons = await controller.getBlockingReasons();

      expect(reasons.some(r => r.includes('L1_KILL'))).toBe(true);
    });
  });

  describe('admin controls', () => {
    it('kill should set env var and redis', async () => {
      mockRedisClient.get = vi.fn().mockResolvedValue(Date.now().toString());

      await controller.kill('test reason');

      expect(process.env.QWEN_KILL).toBe('1');
      expect(mockRedisClient.set).toHaveBeenCalledWith('qwen:kill:active', '1');
      expect(mockRedisClient.publish).toHaveBeenCalledWith(
        'rollback:event',
        expect.stringContaining('"action":"kill"')
      );
    });

    it('unkill should clear env var and redis', async () => {
      process.env.QWEN_KILL = '1';
      mockRedisClient.get = vi.fn().mockResolvedValue(Date.now().toString());

      await controller.unkill('test reason');

      expect(process.env.QWEN_KILL).toBe('0');
      expect(mockRedisClient.del).toHaveBeenCalledWith('qwen:kill:active');
    });

    it('disableSwarm should set redis flag', async () => {
      mockRedisClient.get = vi.fn().mockResolvedValue(Date.now().toString());

      await controller.disableSwarm('drawdown breach');

      expect(mockRedisClient.set).toHaveBeenCalledWith('qwen:disabled', '1');
    });

    it('enableSwarm should clear redis flag', async () => {
      mockRedisClient.get = vi.fn().mockResolvedValue(Date.now().toString());

      await controller.enableSwarm('recovery');

      expect(mockRedisClient.del).toHaveBeenCalledWith('qwen:disabled');
    });

    it('setPaperGateEligible should update redis', async () => {
      mockRedisClient.get = vi.fn()
        .mockResolvedValueOnce(Date.now().toString())
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      await controller.setPaperGateEligible(false, 'testing');

      expect(mockRedisClient.set).toHaveBeenCalledWith('qwen:paper:ineligible', '1');

      await controller.setPaperGateEligible(true, 'testing');
      expect(mockRedisClient.del).toHaveBeenCalledWith('qwen:paper:ineligible');
    });
  });

  describe('layer checks', () => {
    it('checkKillSwitch should read from env and redis', async () => {
      process.env.QWEN_KILL = '1';
      mockRedisClient.get = vi.fn().mockResolvedValue(null);

      const controller = new TieredRollbackController();
      const status = await (controller as any).checkKillSwitch();

      expect(status.active).toBe(true);
      expect(status.layer).toBe(RollbackLayer.L1_KILL);
    });

    it('checkSwarmDisabled should read from redis', async () => {
      mockRedisClient.get = vi.fn()
        .mockResolvedValueOnce('1'); // disabled flag

      const controller = new TieredRollbackController();
      const status = await (controller as any).checkSwarmDisabled();

      expect(status.active).toBe(true);
      expect(status.layer).toBe(RollbackLayer.L2_DISABLED);
    });

    it('checkDrawdownTier should identify blocking tiers', async () => {
      mockRedisClient.hget = vi.fn().mockResolvedValue('HALT');

      const controller = new TieredRollbackController();
      const status = await (controller as any).checkDrawdownTier();

      expect(status.active).toBe(true);
      expect(status.metadata?.tier).toBe('HALT');
    });

    it('checkPaperGate should respect QWEN_LIVE_ELIGIBLE', async () => {
      process.env.QWEN_LIVE_ELIGIBLE = 'false';
      mockRedisClient.get = vi.fn().mockResolvedValue(null);

      const controller = new TieredRollbackController();
      const status = await (controller as any).checkPaperGate();

      expect(status.active).toBe(true);
      expect(status.reason).toContain('Live eligibility not enabled');
    });
  });

  describe('caching', () => {
    it('should cache status for cacheTtlMs', async () => {
      const now = Date.now();
      mockAllLayers({
        signalsTs: now,
        killActive: null,
        disabled: null,
        drawdownTier: null,
        paperAgeMs: thirtyOneDaysAgo.toString(),
        liveEligible: true,
      });

      const controller = new TieredRollbackController();
      const status1 = await controller.getStatus();
      const status2 = await controller.getStatus();

      // Second call should use cache (redis not called again beyond the first batch)
      expect(mockRedisClient.get).toHaveBeenCalledTimes(4); // 4 gets on first call
      expect(status1).toBe(status2);
    });

    it('invalidateCache should force refresh', async () => {
      const now = Date.now();
      mockAllLayers({
        signalsTs: now,
        killActive: null,
        disabled: null,
        drawdownTier: null,
        paperAgeMs: thirtyOneDaysAgo.toString(),
        liveEligible: true,
      });

      const controller = new TieredRollbackController();
      await controller.getStatus();

      controller.invalidateCache();

      // Reset mock call count tracking
      (mockRedisClient.get as any).mockClear();

      await controller.getStatus();

      expect(mockRedisClient.get).toHaveBeenCalled();
    });
  });

  describe('singleton pattern', () => {
    it('getRollbackController should return singleton', () => {
      const instance1 = getRollbackController();
      const instance2 = getRollbackController();

      expect(instance1).toBe(instance2);
    });
  });
});
