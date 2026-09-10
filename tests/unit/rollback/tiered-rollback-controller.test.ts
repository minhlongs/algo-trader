/**
 * Unit tests for TieredRollbackController
 *
 * Mocks Redis, the 5 evaluators (L0-L4), the message bus, and logger.
 * Exercises getStatus() cache + severity thresholds, isTradingAllowed(),
 * admin controls (kill/unkill/disable/enable/acknowledge/paperGate),
 * subscribeCrossInstanceUpdates() (disabled/success/throw), and the
 * getRollbackController() singleton.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { RedisClientType } from '../../../src/redis';
import type { RollbackLayer, RollbackConfig, RollbackStatus } from '../../../src/rollback/rollback-types';
import { RollbackState } from '../../../src/rollback/rollback-types';

// ---------------------------------------------------------------------------
// Hoisted mutable mocks — tests override per-case.
// ---------------------------------------------------------------------------
const {
  mockRedis,
  mockEvaluators,
  mockBus,
  mockLogger,
} = vi.hoisted(() => {
  const redis = {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    publish: vi.fn(),
  } as unknown as RedisClientType;

  return {
    mockRedis: redis,
    mockEvaluators: {
      checkSignalsLoopHealth: vi.fn(),
      checkKillSwitch: vi.fn(),
      checkSwarmDisabled: vi.fn(),
      checkDrawdownTier: vi.fn(),
      checkPaperGate: vi.fn(),
    },
    mockBus: {
      subscribe: vi.fn(),
    },
    mockLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  };
});

vi.mock('../../../src/redis', () => ({
  getRedisClient: () => mockRedis,
}));

vi.mock('../../../src/shared/utils/logger', () => ({
  logger: mockLogger,
}));

vi.mock('../../../src/shared/messaging/create-message-bus', () => ({
  getMessageBus: () => mockBus,
}));

vi.mock('../../../src/rollback/rollback-evaluators', () => ({
  checkSignalsLoopHealth: mockEvaluators.checkSignalsLoopHealth,
  checkKillSwitch: mockEvaluators.checkKillSwitch,
  checkSwarmDisabled: mockEvaluators.checkSwarmDisabled,
  checkDrawdownTier: mockEvaluators.checkDrawdownTier,
  checkPaperGate: mockEvaluators.checkPaperGate,
}));

import { TieredRollbackController, getRollbackController } from '../../../src/rollback/tiered-rollback-controller';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function layerResult(layer: RollbackLayer, active: boolean, metadata?: Record<string, unknown>) {
  return { layer, active, reason: active ? `${layer} active` : undefined, metadata };
}

const DEFAULT_CONFIG: RollbackConfig = {
  enableCrossInstanceSync: true,
  signalStalenessMs: 5 * 60_000,
  signalErrorRateThreshold: 0.5,
  paperGateMinDays: 30,
};

function allInactive() {
  mockEvaluators.checkSignalsLoopHealth.mockResolvedValue(layerResult('L0_SIGNALS' as RollbackLayer, false));
  mockEvaluators.checkKillSwitch.mockResolvedValue(layerResult('L1_KILL' as RollbackLayer, false));
  mockEvaluators.checkSwarmDisabled.mockResolvedValue(layerResult('L2_DISABLED' as RollbackLayer, false));
  mockEvaluators.checkDrawdownTier.mockResolvedValue(layerResult('L3_DRAWDOWN' as RollbackLayer, false));
  mockEvaluators.checkPaperGate.mockResolvedValue(layerResult('L4_PAPER_GATE' as RollbackLayer, false));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('TieredRollbackController', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    originalEnv = process.env;
    process.env = { ...originalEnv };
    delete process.env.Standard_KILL;
    allInactive();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ── Construction ────────────────────────────────────────────────────────

  it('constructs with default config when none provided', () => {
    const ctrl = new TieredRollbackController();
    expect(ctrl).toBeInstanceOf(TieredRollbackController);
  });

  it('constructs with partial config merged over defaults', () => {
    const ctrl = new TieredRollbackController({ paperGateMinDays: 14 });
    expect(ctrl).toBeInstanceOf(TieredRollbackController);
  });

  // ── getStatus() — cache + severity thresholds (lines 31-47) ─────────────

  describe('getStatus()', () => {
    it('returns ACTIVE when no layers are active (severity 0)', async () => {
      const ctrl = new TieredRollbackController(DEFAULT_CONFIG);
      const status = await ctrl.getStatus();
      expect(status.overall).toBe(RollbackState.ACTIVE);
      expect(status.layers).toHaveLength(5);
      expect(status.lastChecked).toBeGreaterThan(0);
    });

    it('returns RESTRICTED when only L4 (severity 1) is active', async () => {
      mockEvaluators.checkPaperGate.mockResolvedValue(layerResult('L4_PAPER_GATE' as RollbackLayer, true));
      const ctrl = new TieredRollbackController(DEFAULT_CONFIG);
      const status = await ctrl.getStatus();
      expect(status.overall).toBe(RollbackState.RESTRICTED);
    });

    it('returns RESTRICTED when L3 base tier (severity 2) is active', async () => {
      mockEvaluators.checkDrawdownTier.mockResolvedValue(layerResult('L3_DRAWDOWN' as RollbackLayer, true));
      const ctrl = new TieredRollbackController(DEFAULT_CONFIG);
      const status = await ctrl.getStatus();
      expect(status.overall).toBe(RollbackState.RESTRICTED);
    });

    it('returns HALTED when L3 HALT (severity 3) is active', async () => {
      mockEvaluators.checkDrawdownTier.mockResolvedValue(
        layerResult('L3_DRAWDOWN' as RollbackLayer, true, { tier: 'HALT' }),
      );
      const ctrl = new TieredRollbackController(DEFAULT_CONFIG);
      const status = await ctrl.getStatus();
      expect(status.overall).toBe(RollbackState.HALTED);
    });

    it('returns BLOCKED when L3 HARD_STOP (severity 4) is active', async () => {
      mockEvaluators.checkDrawdownTier.mockResolvedValue(
        layerResult('L3_DRAWDOWN' as RollbackLayer, true, { tier: 'HARD_STOP' }),
      );
      const ctrl = new TieredRollbackController(DEFAULT_CONFIG);
      const status = await ctrl.getStatus();
      expect(status.overall).toBe(RollbackState.BLOCKED);
    });

    it('returns BLOCKED when L1_KILL (severity 4) is active', async () => {
      mockEvaluators.checkKillSwitch.mockResolvedValue(layerResult('L1_KILL' as RollbackLayer, true));
      const ctrl = new TieredRollbackController(DEFAULT_CONFIG);
      const status = await ctrl.getStatus();
      expect(status.overall).toBe(RollbackState.BLOCKED);
    });

    it('returns BLOCKED when L0_SIGNALS (severity 5) is active', async () => {
      mockEvaluators.checkSignalsLoopHealth.mockResolvedValue(layerResult('L0_SIGNALS' as RollbackLayer, true));
      const ctrl = new TieredRollbackController(DEFAULT_CONFIG);
      const status = await ctrl.getStatus();
      expect(status.overall).toBe(RollbackState.BLOCKED);
    });

    it('picks the highest-severity active layer when multiple are active', async () => {
      mockEvaluators.checkPaperGate.mockResolvedValue(layerResult('L4_PAPER_GATE' as RollbackLayer, true));
      mockEvaluators.checkKillSwitch.mockResolvedValue(layerResult('L1_KILL' as RollbackLayer, true));
      const ctrl = new TieredRollbackController(DEFAULT_CONFIG);
      const status = await ctrl.getStatus();
      // L1_KILL severity 4 > L4 severity 1 → BLOCKED
      expect(status.overall).toBe(RollbackState.BLOCKED);
    });

    it('caches the status and returns the same object on a second call (cache hit)', async () => {
      const ctrl = new TieredRollbackController(DEFAULT_CONFIG);
      const first = await ctrl.getStatus();
      const second = await ctrl.getStatus();
      // Same reference → cache was hit, evaluators called only once
      expect(second).toBe(first);
      expect(mockEvaluators.checkSignalsLoopHealth).toHaveBeenCalledTimes(1);
    });

    it('refreshes after cache is invalidated', async () => {
      const ctrl = new TieredRollbackController(DEFAULT_CONFIG);
      await ctrl.getStatus();
      // Invalidate via an admin action
      await ctrl.kill('test');
      await ctrl.getStatus();
      // Evaluators called twice: once before kill, once after invalidation
      expect(mockEvaluators.checkSignalsLoopHealth).toHaveBeenCalledTimes(2);
    });
  });

  // ── isTradingAllowed() (line 50) ────────────────────────────────────────

  describe('isTradingAllowed()', () => {
    it('returns true when overall state is ACTIVE', async () => {
      const ctrl = new TieredRollbackController(DEFAULT_CONFIG);
      expect(await ctrl.isTradingAllowed()).toBe(true);
    });

    it('returns false when overall state is not ACTIVE', async () => {
      mockEvaluators.checkKillSwitch.mockResolvedValue(layerResult('L1_KILL' as RollbackLayer, true));
      const ctrl = new TieredRollbackController(DEFAULT_CONFIG);
      expect(await ctrl.isTradingAllowed()).toBe(false);
    });
  });

  // ── kill() / unkill() (lines 54-68) ─────────────────────────────────────

  describe('kill / unkill', () => {
    it('kill() sets env + redis + publishes event + invalidates cache', async () => {
      const ctrl = new TieredRollbackController(DEFAULT_CONFIG);
      await ctrl.kill('manual test');
      expect(process.env.Standard_KILL).toBe('1');
      expect(mockRedis.set).toHaveBeenCalledWith('Standard:kill:active', '1');
      expect(mockRedis.publish).toHaveBeenCalledWith(
        'rollback:event',
        expect.stringContaining('"layer":"L1_KILL"'),
      );
      expect(mockRedis.publish).toHaveBeenCalledWith(
        'rollback:event',
        expect.stringContaining('"action":"kill"'),
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[Rollback] Kill switch activated',
        { reason: 'manual test' },
      );
    });

    it('unkill() clears env + redis + publishes event', async () => {
      const ctrl = new TieredRollbackController(DEFAULT_CONFIG);
      await ctrl.unkill('resolved');
      expect(process.env.Standard_KILL).toBe('0');
      expect(mockRedis.del).toHaveBeenCalledWith('Standard:kill:active');
      expect(mockRedis.publish).toHaveBeenCalledWith(
        'rollback:event',
        expect.stringContaining('"action":"unkill"'),
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        '[Rollback] Kill switch deactivated',
        { reason: 'resolved' },
      );
    });
  });

  // ── disableSwarm() / enableSwarm() (lines 70-82) ────────────────────────

  describe('disableSwarm / enableSwarm', () => {
    it('disableSwarm() sets redis + publishes event', async () => {
      const ctrl = new TieredRollbackController(DEFAULT_CONFIG);
      await ctrl.disableSwarm('maintenance');
      expect(mockRedis.set).toHaveBeenCalledWith('Standard:disabled', '1');
      expect(mockRedis.publish).toHaveBeenCalledWith(
        'rollback:event',
        expect.stringContaining('"layer":"L2_DISABLED"'),
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[Rollback] Swarm disabled',
        { reason: 'maintenance' },
      );
    });

    it('enableSwarm() clears redis + publishes event', async () => {
      const ctrl = new TieredRollbackController(DEFAULT_CONFIG);
      await ctrl.enableSwarm('back online');
      expect(mockRedis.del).toHaveBeenCalledWith('Standard:disabled');
      expect(mockRedis.publish).toHaveBeenCalledWith(
        'rollback:event',
        expect.stringContaining('"action":"enable"'),
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        '[Rollback] Swarm re-enabled',
        { reason: 'back online' },
      );
    });
  });

  // ── acknowledge() (lines 84-87) ─────────────────────────────────────────

  describe('acknowledge()', () => {
    it('publishes to rollback:ack channel', async () => {
      const ctrl = new TieredRollbackController(DEFAULT_CONFIG);
      await ctrl.acknowledge('L1_KILL' as RollbackLayer, 'seen');
      expect(mockRedis.publish).toHaveBeenCalledWith(
        'rollback:ack',
        expect.stringContaining('"layer":"L1_KILL"'),
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        '[Rollback] Acknowledged',
        { layer: 'L1_KILL', reason: 'seen' },
      );
    });
  });

  // ── setPaperGateEligible() (lines 89-95) ────────────────────────────────

  describe('setPaperGateEligible()', () => {
    it('clears redis key when eligible=true', async () => {
      const ctrl = new TieredRollbackController(DEFAULT_CONFIG);
      await ctrl.setPaperGateEligible(true, 'graduated');
      expect(mockRedis.del).toHaveBeenCalledWith('Standard:paper:ineligible');
      expect(mockRedis.set).not.toHaveBeenCalledWith('Standard:paper:ineligible', '1');
      expect(mockRedis.publish).toHaveBeenCalledWith(
        'rollback:event',
        expect.stringContaining('"action":"eligible"'),
      );
    });

    it('sets redis key when eligible=false', async () => {
      const ctrl = new TieredRollbackController(DEFAULT_CONFIG);
      await ctrl.setPaperGateEligible(false, 'reverted');
      expect(mockRedis.set).toHaveBeenCalledWith('Standard:paper:ineligible', '1');
      expect(mockRedis.publish).toHaveBeenCalledWith(
        'rollback:event',
        expect.stringContaining('"action":"ineligible"'),
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        '[Rollback] Paper gate eligibility updated',
        { eligible: false, reason: 'reverted' },
      );
    });
  });

  // ── subscribeCrossInstanceUpdates() (lines 97-106) ──────────────────────

  describe('subscribeCrossInstanceUpdates()', () => {
    it('returns early when enableCrossInstanceSync is false (line 98)', async () => {
      const ctrl = new TieredRollbackController({ ...DEFAULT_CONFIG, enableCrossInstanceSync: false });
      await ctrl.subscribeCrossInstanceUpdates();
      expect(mockBus.subscribe).not.toHaveBeenCalled();
    });

    it('subscribes to rollback.state and sets subscriptionReady (line 104)', async () => {
      mockBus.subscribe.mockResolvedValue(undefined);
      const ctrl = new TieredRollbackController(DEFAULT_CONFIG);
      await ctrl.subscribeCrossInstanceUpdates();
      expect(mockBus.subscribe).toHaveBeenCalledWith('rollback.state', expect.any(Function));
    });

    it('invalidates cache when a cross-instance message arrives', async () => {
      mockBus.subscribe.mockImplementation(async (_topic: string, handler: (env: any) => void) => {
        // Simulate an incoming message
        handler({ payload: {} });
      });
      const ctrl = new TieredRollbackController(DEFAULT_CONFIG);
      // Prime the cache
      await ctrl.getStatus();
      const callsBefore = mockEvaluators.checkSignalsLoopHealth.mock.calls.length;
      // Subscribe triggers a message → invalidates cache
      await ctrl.subscribeCrossInstanceUpdates();
      // Next getStatus() should re-evaluate
      await ctrl.getStatus();
      expect(mockEvaluators.checkSignalsLoopHealth.mock.calls.length).toBeGreaterThan(callsBefore);
    });

    it('catches when message bus throws and logs debug (line 105)', async () => {
      mockBus.subscribe.mockRejectedValue(new Error('bus down'));
      const ctrl = new TieredRollbackController(DEFAULT_CONFIG);
      // Should not throw
      await expect(ctrl.subscribeCrossInstanceUpdates()).resolves.toBeUndefined();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        '[Rollback] Message bus not available — cross-instance sync disabled',
      );
    });
  });

  // ── getRollbackController() singleton (lines 111-115) ───────────────────

  describe('getRollbackController()', () => {
    it('returns a new controller on first call', () => {
      const ctrl = getRollbackController(DEFAULT_CONFIG);
      expect(ctrl).toBeInstanceOf(TieredRollbackController);
    });

    it('returns the same instance on subsequent calls', () => {
      const first = getRollbackController(DEFAULT_CONFIG);
      const second = getRollbackController(DEFAULT_CONFIG);
      expect(second).toBe(first);
    });

    it('ignores config on subsequent calls (singleton)', () => {
      const first = getRollbackController(DEFAULT_CONFIG);
      const second = getRollbackController({ ...DEFAULT_CONFIG, paperGateMinDays: 99 });
      expect(second).toBe(first);
    });
  });
});
