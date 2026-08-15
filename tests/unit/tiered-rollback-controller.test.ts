/**
 * Unit Tests for Tiered Rollback Controller
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TieredRollbackController, RollbackLayer, RollbackState, getRollbackController } from '../../src/rollback/tiered-rollback-controller';

// Mock redis module
const mockRedisClient = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue('OK'),
  del: vi.fn().mockResolvedValue(1),
  publish: vi.fn().mockResolvedValue(1),
};

vi.mock('../../src/redis', () => ({
  getRedisClient: vi.fn(() => mockRedisClient),
}));

vi.mock('../../src/middleware/prometheus-metrics', () => ({
  setQwenKillSwitch: vi.fn(),
  setQwenDrawdownAutoDisabled: vi.fn(),
  setQwenPaperGateDaysRemaining: vi.fn(),
}));

vi.mock('../../src/shared/utils/tracing', () => ({
  getTracer: vi.fn(() => ({
    startActiveSpan: vi.fn((_name: string, fn: any) => fn({ setAttribute: vi.fn() })),
    startSpan: vi.fn(() => ({
      setAttribute: vi.fn(),
      recordException: vi.fn(),
      end: vi.fn(),
    })),
  })),
}));

vi.mock('../../src/shared/messaging/create-message-bus', () => ({
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
  } = {}) {
    const signals = 'signalsTs' in overrides ? overrides.signalsTs : now;
    const kill = 'killActive' in overrides ? overrides.killActive : null;
    const disabled = 'disabled' in overrides ? overrides.disabled : null;
    const drawdown = 'drawdownTier' in overrides ? overrides.drawdownTier : null;
    const paperAge = 'paperAgeMs' in overrides ? overrides.paperAgeMs : thirtyOneDaysAgo.toString();

    // Build lookup table for Redis get()
    const redisValues: Record<string, string | null> = {
      'Standard:signals:last_run_ts': signals !== null ? signals.toString() : '0',
      'Standard:kill:active': kill,
      'Standard:disabled': disabled,
      'qwen:drawdown:tier': drawdown,
      'Standard:paper:ineligible': null,
      'Standard:paper:first_trade_age_ms': paperAge,
    };
    mockRedisClient.get = vi.fn(async (key: string) => redisValues[key] ?? null);
    // Also clear env kill switch to avoid L1 activation
    delete process.env.Standard_KILL;
  }

  function activeLayers(status: { layers: Array<{ layer: string; active: boolean }> }) {
    return status.layers.filter(l => l.active);
  }

  function hasActiveLayer(status: { layers: Array<{ layer: string; active: boolean }> }, layer: string) {
    return status.layers.some(l => l.layer === layer && l.active);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.Standard_KILL;
    controller = new TieredRollbackController({
      signalStalenessMs: 5 * 60_000, // 5 min default
      paperGateMinDays: 30,
    });
  });

  describe('getStatus', () => {
    it('should return ACTIVE when all layers clear', async () => {
      mockAllLayers({ signalsTs: now, paperAgeMs: thirtyOneDaysAgo.toString() });
      const status = await controller.getStatus();
      console.log('LAYERS:', status.layers.map(l => `${l.layer}: active=${l.active} reason=${l.reason}`));
      expect(status.overall).toBe(RollbackState.ACTIVE);
      expect(activeLayers(status)).toHaveLength(0);
    });

    it('should return BLOCKED when L1 kill switch active (env)', async () => {
      mockAllLayers({ killActive: null });
      process.env.Standard_KILL = '1';
      const status = await controller.getStatus();
      expect(status.overall).toBe(RollbackState.BLOCKED);
      expect(hasActiveLayer(status, RollbackLayer.L1_KILL)).toBe(true);
    });

    it('should return BLOCKED when L1 kill switch active (Redis)', async () => {
      mockAllLayers({ killActive: '1' });
      const status = await controller.getStatus();
      expect(status.overall).toBe(RollbackState.BLOCKED);
      expect(hasActiveLayer(status, RollbackLayer.L1_KILL)).toBe(true);
    });

    it('should return HALTED when L2 swarm disabled', async () => {
      mockAllLayers({ disabled: '1' });
      const status = await controller.getStatus();
      expect(status.overall).toBe(RollbackState.HALTED);
      expect(hasActiveLayer(status, RollbackLayer.L2_DISABLED)).toBe(true);
    });

    it('should return RESTRICTED when L3 drawdown ALERT tier', async () => {
      mockAllLayers({ drawdownTier: 'ALERT' });
      const status = await controller.getStatus();
      expect(status.overall).toBe(RollbackState.RESTRICTED);
      expect(hasActiveLayer(status, RollbackLayer.L3_DRAWDOWN)).toBe(true);
    });

    it('should return HALTED when L3 drawdown HALT tier', async () => {
      mockAllLayers({ drawdownTier: 'HALT' });
      const status = await controller.getStatus();
      expect(status.overall).toBe(RollbackState.HALTED);
      expect(hasActiveLayer(status, RollbackLayer.L3_DRAWDOWN)).toBe(true);
    });

    it('should return RESTRICTED when L4 paper gate not ready (no age)', async () => {
      mockAllLayers({ paperAgeMs: null });
      const status = await controller.getStatus();
      expect(status.overall).toBe(RollbackState.RESTRICTED);
      expect(hasActiveLayer(status, RollbackLayer.L4_PAPER_GATE)).toBe(true);
    });

    it('should return BLOCKED when L0 signals loop stale', async () => {
      const staleTime = now - 8 * 60 * 60 * 1000; // 8 hours ago
      mockAllLayers({ signalsTs: staleTime });
      const status = await controller.getStatus();
      expect(status.overall).toBe(RollbackState.BLOCKED);
      expect(hasActiveLayer(status, RollbackLayer.L0_SIGNALS)).toBe(true);
    });
  });

  describe('admin controls', () => {
    it('kill should set Redis key and env', async () => {
      await controller.kill('test');
      expect(mockRedisClient.set).toHaveBeenCalledWith('Standard:kill:active', '1');
    });

    it('unkill should clear Redis key', async () => {
      await controller.unkill('test');
      expect(mockRedisClient.del).toHaveBeenCalledWith('Standard:kill:active');
    });

    it('disableSwarm should set Redis key', async () => {
      await controller.disableSwarm('manual');
      expect(mockRedisClient.set).toHaveBeenCalledWith('Standard:disabled', '1');
    });

    it('enableSwarm should clear Redis key', async () => {
      await controller.enableSwarm('manual');
      expect(mockRedisClient.del).toHaveBeenCalledWith('Standard:disabled');
    });
  });

  describe('paper gate', () => {
    it('setPaperGateEligible(true) should clear ineligible key', async () => {
      await controller.setPaperGateEligible(true, 'test');
      expect(mockRedisClient.del).toHaveBeenCalledWith('Standard:paper:ineligible');
    });

    it('setPaperGateEligible(false) should set ineligible key', async () => {
      await controller.setPaperGateEligible(false, 'test');
      expect(mockRedisClient.set).toHaveBeenCalledWith('Standard:paper:ineligible', '1');
    });
  });

  describe('cache', () => {
    it('should cache status and skip re-fetch within window', async () => {
      mockAllLayers({ signalsTs: Date.now() });
      await controller.getStatus();
      mockAllLayers({ signalsTs: Date.now(), disabled: '1' });
      const status = await controller.getStatus();
      expect(status.overall).toBe(RollbackState.ACTIVE);
    });

    it('should refetch after cache expires', async () => {
      mockAllLayers({ signalsTs: Date.now() });
      await controller.getStatus();
      (controller as any).lastCacheTime -= 60_000;
      mockAllLayers({ signalsTs: Date.now(), disabled: '1' });
      const status = await controller.getStatus();
      expect(status.overall).toBe(RollbackState.HALTED);
    });
  });

  describe('getEffectiveSeverity', () => {
    it('should prioritize drawdown tier for L3', async () => {
      mockAllLayers({ drawdownTier: 'HALT' });
      const status = await controller.getStatus();
      expect(status.overall).toBe(RollbackState.HALTED);
    });

    it('should return RESTRICTED for ALERT/REDUCE tier', async () => {
      mockAllLayers({ drawdownTier: 'REDUCE' });
      const status = await controller.getStatus();
      expect(status.overall).toBe(RollbackState.RESTRICTED);
    });
  });

  describe('evaluateAllLayers', () => {
    it('should call all layer evaluators', async () => {
      mockAllLayers();
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
