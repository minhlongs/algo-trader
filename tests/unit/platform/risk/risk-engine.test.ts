/**
 * RiskEngine — Unit Tests
 *
 * Covers the orchestrator: constructor (no-arg redis default + explicit),
 * isEnabled, lazy service proxies for each method (delegation), the
 * feature-disabled early-return paths (disabledResponse / null / true /
 * {success:false}), and invalidateUserCache (which calls del on redis).
 *
 * Each sub-service (VaRService, etc.) is mocked wholesale to verify delegation
 * without exercising the underlying math — those have their own suites.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getRedisClient: vi.fn(),
  VaRService: vi.fn(function VaRService() { /* ctor placeholder */ }),
  CorrelationMatrixService: vi.fn(function CorrelationMatrixService() { /* ctor placeholder */ }),
  DrawdownMonitorService: vi.fn(function DrawdownMonitorService() { /* ctor placeholder */ }),
  AtrTrailingStopService: vi.fn(function AtrTrailingStopService() { /* ctor placeholder */ }),
  KellyPositionSizerService: vi.fn(function KellyPositionSizerService() { /* ctor placeholder */ }),
}));

vi.mock('../../../../src/redis', () => ({
  getRedisClient: mocks.getRedisClient,
}));

vi.mock('../../../../src/platform/risk/index', () => ({
  VaRService: mocks.VaRService,
  CorrelationMatrixService: mocks.CorrelationMatrixService,
  DrawdownMonitorService: mocks.DrawdownMonitorService,
  AtrTrailingStopService: mocks.AtrTrailingStopService,
  KellyPositionSizerService: mocks.KellyPositionSizerService,
}));

vi.mock('../../../../src/shared/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { RiskEngine } from '../../../../src/platform/risk/risk-engine';

describe('RiskEngine', () => {
  let fakeRedis: { del: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    fakeRedis = { del: vi.fn().mockResolvedValue(1) };
    vi.clearAllMocks();
    mocks.getRedisClient.mockReturnValue(fakeRedis);
  });

  function makeEngine(featureEnabled = true) {
    return new RiskEngine(fakeRedis as never, featureEnabled);
  }

  it('uses getRedisClient() when no redis is passed', () => {
    mocks.getRedisClient.mockReturnValue(fakeRedis);
    const engine = new RiskEngine();
    expect(mocks.getRedisClient).toHaveBeenCalled();
  });

  it('isEnabled returns the feature flag state', () => {
    expect(makeEngine(true).isEnabled()).toBe(true);
    expect(makeEngine(false).isEnabled()).toBe(false);
  });

  describe('feature enabled = true (delegation)', () => {
    it('computeVaR delegates to VaRService.compute', async () => {
      const svc = { compute: vi.fn().mockResolvedValue({ success: true, data: null }) };
      mocks.VaRService.mockImplementation(function () { return svc; });

      const engine = makeEngine(true);
      const res = await engine.computeVaR({} as never, 'u1');
      expect(svc.compute).toHaveBeenCalled();
      expect(res).toEqual({ success: true, data: null });
    });

    it('computeVaRWithIntervals delegates to VaRService.computeWithIntervals', async () => {
      const svc = { computeWithIntervals: vi.fn().mockResolvedValue({ success: true }) };
      mocks.VaRService.mockImplementation(function () { return svc; });

      const engine = makeEngine(true);
      const res = await engine.computeVaRWithIntervals({} as never, 'u1');
      expect(svc.computeWithIntervals).toHaveBeenCalled();
      expect(res).toEqual({ success: true });
    });

    it('computeCorrelation delegates to CorrelationMatrixService.compute', async () => {
      const svc = { compute: vi.fn().mockResolvedValue({ success: true }) };
      mocks.CorrelationMatrixService.mockImplementation(function () { return svc; });

      const engine = makeEngine(true);
      const res = await engine.computeCorrelation({} as never, 'u1');
      expect(svc.compute).toHaveBeenCalled();
    });

    it('recordTrade delegates to DrawdownMonitorService.recordTrade', async () => {
      const svc = { recordTrade: vi.fn().mockResolvedValue({ current: 0.1 }) };
      mocks.DrawdownMonitorService.mockImplementation(function () { return svc; });

      const engine = makeEngine(true);
      const res = await engine.recordTrade(50);
      expect(svc.recordTrade).toHaveBeenCalledWith(50);
      expect(res).toEqual({ current: 0.1 });
    });

    it('getDrawdownStatus delegates to DrawdownMonitorService.getStatus', async () => {
      const svc = { getStatus: vi.fn().mockResolvedValue({ status: 'ok' }) };
      mocks.DrawdownMonitorService.mockImplementation(function () { return svc; });

      const engine = makeEngine(true);
      const res = await engine.getDrawdownStatus('u1');
      expect(svc.getStatus).toHaveBeenCalledWith('u1');
      expect(res).toEqual({ status: 'ok' });
    });

    it('checkDrawdownAlerts delegates to DrawdownMonitorService.checkAndAlert', async () => {
      const svc = { checkAndAlert: vi.fn().mockResolvedValue({ alerts: ['a'] }) };
      mocks.DrawdownMonitorService.mockImplementation(function () { return svc; });

      const engine = makeEngine(true);
      const res = await engine.checkDrawdownAlerts('u1', { daily: 0.1, total: 0.3 });
      expect(svc.checkAndAlert).toHaveBeenCalledWith('u1', { dailyThreshold: 0.1, totalThreshold: 0.3 });
      expect(res).toEqual({ alerts: ['a'] });
    });

    it('checkDrawdownAlerts with no thresholds passes undefined', async () => {
      const svc = { checkAndAlert: vi.fn().mockResolvedValue({ alerts: [] }) };
      mocks.DrawdownMonitorService.mockImplementation(function () { return svc; });

      const engine = makeEngine(true);
      await engine.checkDrawdownAlerts('u1');
      expect(svc.checkAndAlert).toHaveBeenCalledWith('u1', { dailyThreshold: undefined, totalThreshold: undefined });
    });

    it('canTrade delegates to DrawdownMonitorService.canTrade', async () => {
      const svc = { canTrade: vi.fn().mockResolvedValue(true) };
      mocks.DrawdownMonitorService.mockImplementation(function () { return svc; });

      const engine = makeEngine(true);
      const res = await engine.canTrade();
      expect(svc.canTrade).toHaveBeenCalled();
      expect(res).toBe(true);
    });

    it('computeAtrStop delegates to AtrTrailingStopService.compute', () => {
      const svc = { compute: vi.fn().mockReturnValue({ success: true }) };
      mocks.AtrTrailingStopService.mockImplementation(function () { return svc; });

      const engine = makeEngine(true);
      const res = engine.computeAtrStop({} as never);
      expect(svc.compute).toHaveBeenCalled();
      expect(res).toEqual({ success: true });
    });

    it('updateAtrState delegates to AtrTrailingStopService.updatePositionState', async () => {
      const svc = { updatePositionState: vi.fn().mockResolvedValue(undefined) };
      mocks.AtrTrailingStopService.mockImplementation(function () { return svc; });

      const engine = makeEngine(true);
      await engine.updateAtrState('u1', 'BTC', {} as never);
      expect(svc.updatePositionState).toHaveBeenCalledWith('u1', 'BTC', {} as never);
    });

    it('getAtrState delegates to AtrTrailingStopService.getPositionState', async () => {
      const svc = { getPositionState: vi.fn().mockResolvedValue({ stop: 1 }) };
      mocks.AtrTrailingStopService.mockImplementation(function () { return svc; });

      const engine = makeEngine(true);
      const res = await engine.getAtrState('u1', 'BTC');
      expect(svc.getPositionState).toHaveBeenCalledWith('u1', 'BTC');
      expect(res).toEqual({ stop: 1 });
    });

    it('clearAtrState delegates to AtrTrailingStopService.clearPositionState', async () => {
      const svc = { clearPositionState: vi.fn().mockResolvedValue(undefined) };
      mocks.AtrTrailingStopService.mockImplementation(function () { return svc; });

      const engine = makeEngine(true);
      await engine.clearAtrState('u1', 'BTC');
      expect(svc.clearPositionState).toHaveBeenCalledWith('u1', 'BTC');
    });

    it('calculateKelly delegates to KellyPositionSizerService.calculate', () => {
      const svc = { calculate: vi.fn().mockReturnValue({ success: true }) };
      mocks.KellyPositionSizerService.mockImplementation(function () { return svc; });

      const engine = makeEngine(true);
      const res = engine.calculateKelly({} as never, 'u1');
      expect(svc.calculate).toHaveBeenCalledWith({} as never, 'u1');
      expect(res).toEqual({ success: true });
    });

    it('kellyFromTradeHistory delegates to KellyPositionSizerService.fromTradeHistory', async () => {
      const svc = { fromTradeHistory: vi.fn().mockResolvedValue({ kelly: 0.5 }) };
      mocks.KellyPositionSizerService.mockImplementation(function () { return svc; });

      const engine = makeEngine(true);
      const res = await engine.kellyFromTradeHistory('u1', [0.1, -0.05], 10000);
      expect(svc.fromTradeHistory).toHaveBeenCalledWith('u1', [0.1, -0.05], 10000, 0);
      expect(res).toEqual({ kelly: 0.5 });
    });

    it('kellyFromTradeHistory passes explicit correlation arg', async () => {
      const svc = { fromTradeHistory: vi.fn().mockResolvedValue({}) };
      mocks.KellyPositionSizerService.mockImplementation(function () { return svc; });

      const engine = makeEngine(true);
      await engine.kellyFromTradeHistory('u1', [0.1], 10000, 0.3);
      expect(svc.fromTradeHistory).toHaveBeenCalledWith('u1', [0.1], 10000, 0.3);
    });

    it('invalidateUserCache calls all service invalidates and redis.del', async () => {
      const varSvc = { invalidate: vi.fn().mockResolvedValue(undefined) };
      const corrSvc = { invalidate: vi.fn().mockResolvedValue(undefined) };
      mocks.VaRService.mockImplementation(function () { return varSvc; });
      mocks.CorrelationMatrixService.mockImplementation(function () { return corrSvc; });

      const engine = makeEngine(true);
      await engine.invalidateUserCache('u1');

      expect(varSvc.invalidate).toHaveBeenCalledWith('u1');
      expect(corrSvc.invalidate).toHaveBeenCalledWith('u1');
      expect(fakeRedis.del).toHaveBeenCalledWith('risk:drawdown:u1');
      expect(fakeRedis.del).toHaveBeenCalledWith('risk:alerts:u1');
    });
  });

  describe('feature enabled = false (short-circuit)', () => {
    it('computeVaR returns disabledResponse', async () => {
      const engine = makeEngine(false);
      const res = await engine.computeVaR({} as never, 'u1');
      expect(res).toEqual({ success: false, error: 'ENABLE_RISK_ENGINE is disabled', data: null });
    });

    it('computeVaRWithIntervals returns disabledResponse', async () => {
      const engine = makeEngine(false);
      expect(await engine.computeVaRWithIntervals({} as never, 'u1')).toHaveProperty('success', false);
    });

    it('computeCorrelation returns disabledResponse', async () => {
      const engine = makeEngine(false);
      expect(await engine.computeCorrelation({} as never, 'u1')).toHaveProperty('success', false);
    });

    it('recordTrade returns null', async () => {
      const engine = makeEngine(false);
      expect(await engine.recordTrade(50)).toBeNull();
    });

    it('getDrawdownStatus returns disabledResponse', async () => {
      const engine = makeEngine(false);
      expect(await engine.getDrawdownStatus('u1')).toHaveProperty('success', false);
    });

    it('checkDrawdownAlerts returns empty alerts, not throttled', async () => {
      const engine = makeEngine(false);
      expect(await engine.checkDrawdownAlerts('u1')).toEqual({ alerts: [], throttled: false });
    });

    it('canTrade returns true (fail-open when disabled)', async () => {
      const engine = makeEngine(false);
      expect(await engine.canTrade()).toBe(true);
    });

    it('computeAtrStop returns failure stub', () => {
      const engine = makeEngine(false);
      expect(engine.computeAtrStop({} as never)).toEqual({ success: false, data: null, computedMs: 0 });
    });

    it('updateAtrState returns null', async () => {
      const engine = makeEngine(false);
      expect(await engine.updateAtrState('u1', 'BTC', {} as never)).toBeNull();
    });

    it('getAtrState returns null', async () => {
      const engine = makeEngine(false);
      expect(await engine.getAtrState('u1', 'BTC')).toBeNull();
    });

    it('clearAtrState returns undefined', async () => {
      const engine = makeEngine(false);
      expect(await engine.clearAtrState('u1', 'BTC')).toBeUndefined();
    });

    it('calculateKelly returns disabledResponse', () => {
      const engine = makeEngine(false);
      expect(engine.calculateKelly({} as never)).toHaveProperty('success', false);
    });

    it('kellyFromTradeHistory returns disabledResponse', async () => {
      const engine = makeEngine(false);
      expect(await engine.kellyFromTradeHistory('u1', [0.1], 10000)).toHaveProperty('success', false);
    });
  });
});
