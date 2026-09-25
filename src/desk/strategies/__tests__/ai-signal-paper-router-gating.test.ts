import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AISignalPaperRouter } from '../ai-signal-paper-router';
import { AISignalAdapter, type AISignal } from '../ai-signal-adapter';
import { RegimeAwareKelly } from '../../risk/regime-aware-kelly';
import { TieredDrawdownBreaker } from '../../risk/tiered-drawdown-breaker';
import { PaperExecutor } from '../../execution/paper-executor';

// Set VITEST_POOL_ID to ensure temporary persistence files are isolated in tmpdir
process.env.VITEST_POOL_ID = '1';

describe('AISignalPaperRouter Gating & Sizing', () => {
  let adapter: AISignalAdapter;
  let regimeKelly: RegimeAwareKelly;
  let paperExecutor: PaperExecutor;
  let router: AISignalPaperRouter;

  const createSignal = (overrides: Partial<AISignal> = {}): AISignal => ({
    strategyId: 'alpha-wf-breakout-101',
    signalId: 'sig-breakout-001',
    direction: 'BUY',
    action: 'BUY',
    symbol: 'BTC/USDT',
    confidence: 0.80,
    expectancy: 0.04,
    regime: 'TREND_UP',
    timestamp: Date.now(),
    ...overrides,
  });

  beforeEach(async () => {
    adapter = new AISignalAdapter({
      confidenceThreshold: 0.70,
      minExpectancy: 0.02,
      regimeFilter: ['TREND_UP', 'RANGE', 'LOW_VOLATILITY'],
    });

    regimeKelly = new RegimeAwareKelly({
      kelly: { kellyFraction: 0.25, maxPositionFraction: 0.05 },
      regimeMultipliers: {},
      unknownRegimeMultiplier: 0.75,
    });

    paperExecutor = new PaperExecutor({
      initialBalance: 10_000,
      slippagePercent: 0.001, // 10 bps
      feePercent: 0.001,      // 10 bps
      simulateFillRate: 1.0,  // deterministic fill for unit tests
    });

    await paperExecutor.start(10_000, true);

    router = new AISignalPaperRouter({
      adapter,
      regimeKelly,
      paperExecutor,
      defaultSymbol: 'BTC/USDT',
      strictMaxCap: true,
    });
  });

  afterEach(async () => {
    await paperExecutor.stop();
  });

  describe('Signal Validation Gate', () => {
    it('rejects signal when confidence is below threshold', async () => {
      const signal = createSignal({ confidence: 0.65 });
      const outcome = await router.routeSignal(signal, 50_000);

      expect(outcome.status).toBe('REJECTED');
      expect(outcome.validation.valid).toBe(false);
      expect(outcome.reason).toContain('Confidence');
      expect(router.getFillRecords()).toHaveLength(0);
    });

    it('rejects signal when expectancy is below minimum threshold', async () => {
      const signal = createSignal({ expectancy: 0.01 });
      const outcome = await router.routeSignal(signal, 50_000);

      expect(outcome.status).toBe('REJECTED');
      expect(outcome.validation.valid).toBe(false);
      expect(outcome.reason).toContain('Expectancy');
      expect(router.getFillRecords()).toHaveLength(0);
    });

    it('rejects signal when regime is not in permitted whitelist', async () => {
      const signal = createSignal({ regime: 'HIGH_VOLATILITY' });
      const outcome = await router.routeSignal(signal, 50_000);

      expect(outcome.status).toBe('REJECTED');
      expect(outcome.validation.valid).toBe(false);
      expect(outcome.reason).toContain('Regime');
      expect(router.getFillRecords()).toHaveLength(0);
    });
  });

  describe('Drawdown Breaker Protection', () => {
    it('blocks BUY order when drawdown breaker is in REDUCE tier', async () => {
      const breaker = new TieredDrawdownBreaker(10_000, {
        alertThreshold: 0.05,
        reduceThreshold: 0.10,
      });
      breaker.reset(10_000);
      breaker.update(8_800); // 12% DD -> REDUCE tier

      const routerWithBreaker = new AISignalPaperRouter({
        adapter,
        regimeKelly,
        paperExecutor,
        drawdownBreaker: breaker,
      });

      const signal = createSignal({ regime: 'TREND_UP' });
      const outcome = await routerWithBreaker.routeSignal(signal, 50_000);

      expect(outcome.status).toBe('REJECTED');
      expect(outcome.reason).toContain('Circuit breaker active');
      expect(routerWithBreaker.getFillRecords()).toHaveLength(0);
    });
  });

  describe('Position Sizing & SHOCK Regime', () => {
    it('enforces ZERO_SIZE status when market drops into SHOCK regime', async () => {
      const permissiveAdapter = new AISignalAdapter({
        confidenceThreshold: 0.5,
        minExpectancy: 0.01,
        regimeFilter: [], // accepts all regimes into sizing
      });

      const shockRouter = new AISignalPaperRouter({
        adapter: permissiveAdapter,
        regimeKelly,
        paperExecutor,
      });

      const signal = createSignal({ regime: 'SHOCK', confidence: 0.90, expectancy: 0.10 });
      const outcome = await shockRouter.routeSignal(signal, 50_000);

      expect(outcome.status).toBe('ZERO_SIZE');
      expect(outcome.reason).toContain('SHOCK');
      expect(outcome.tradeSignal?.quantity).toBe(0);
      expect(shockRouter.getFillRecords()).toHaveLength(0);
    });

    it('enforces 5% maximum portfolio equity cap on BUY orders', async () => {
      const signal = createSignal({ regime: 'TREND_UP', confidence: 0.95, expectancy: 0.20 });
      const outcome = await router.routeSignal(signal, 50_000);

      expect(outcome.status).toBe('FILLED');
      const orderQty = outcome.tradeSignal!.quantity;
      const orderValue = orderQty * 50_000;

      // 5% of $10,000 = $500
      expect(orderValue).toBeLessThanOrEqual(500.01);
    });
  });
});
