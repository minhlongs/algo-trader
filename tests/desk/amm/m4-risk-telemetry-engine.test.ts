import { describe, expect, it } from 'vitest';
import {
  AmmAuditLogger,
  AmmEngine,
  AmmMetricsRecorder,
  AmmRiskGuard,
  DrawdownBreaker,
  KellyPositionSizer,
  MultiTokenPoolConfig,
  RiskContext,
  TradeIntent,
} from '../../../src/desk/amm';

describe('Milestone 4 — Pre-Trade Risk Gates, Telemetry, Audit Logger & Master Engine', () => {
  describe('AmmRiskGuard & Pre-Trade Gates', () => {
    const defaultContext: RiskContext = {
      portfolioCapitalUsd: 100_000,
      portfolioEquityUsd: 100_000,
      peakDailyEquityUsd: 100_000,
      currentDailyEquityUsd: 100_000,
      currentDailyDrawdown: 0.0,
      venueLatencyMs: 25,
      currentPoolExposureUsd: 10_000,
      maxPoolExposureLimitUsd: 50_000,
      openOrdersCount: 0,
    };

    it('approves compliant trades within Quarter-Kelly, drawdown, and exposure limits', () => {
      const intent: TradeIntent = {
        poolId: 'pool-test-1',
        notionalUsd: 2_500, // 2.5% of equity (well below 5% Kelly cap)
        venueLatencyMs: 30,
      };
      const verdict = AmmRiskGuard.evaluatePreTrade(intent, defaultContext);
      expect(verdict.allowed).toBe(true);
      expect(verdict.verdict).toBe('APPROVED');
      expect(verdict.allowedNotionalUsd).toBe(2_500);
    });

    it('rejects trade when exceeding 5% Quarter-Kelly cap', () => {
      const intent: TradeIntent = {
        poolId: 'pool-test-1',
        notionalUsd: 6_000, // 6% > 5% of 100k
      };
      const verdict = AmmRiskGuard.evaluatePreTrade(intent, defaultContext);
      expect(verdict.allowed).toBe(false);
      expect(verdict.verdict).toBe('REJECTED');
      expect(verdict.rejectionCode).toBe('KELLY_CAP_EXCEEDED');
      expect(verdict.allowedNotionalUsd).toBe(5_000);
    });

    it('rejects trade when venue latency exceeds threshold (500ms)', () => {
      const intent: TradeIntent = {
        poolId: 'pool-test-1',
        notionalUsd: 1_000,
        venueLatencyMs: 650,
      };
      const verdict = AmmRiskGuard.evaluatePreTrade(intent, defaultContext);
      expect(verdict.allowed).toBe(false);
      expect(verdict.rejectionCode).toBe('LATENCY_SPIKE_EXCEEDED');
    });

    it('rejects trade when daily drawdown breaches 15% threshold', () => {
      const breachedContext: RiskContext = {
        ...defaultContext,
        currentDailyDrawdown: 0.16,
      };
      const intent: TradeIntent = { poolId: 'pool-test-1', notionalUsd: 500 };
      const verdict = AmmRiskGuard.evaluatePreTrade(intent, breachedContext);
      expect(verdict.allowed).toBe(false);
      expect(verdict.rejectionCode).toBe('DAILY_DRAWDOWN_BREACH');
    });
  });

  describe('KellyPositionSizer & DrawdownBreaker', () => {
    it('calculates Quarter-Kelly position fraction bounded by 5% cap', () => {
      const sizing = KellyPositionSizer.calculateQuarterKelly({
        winProbability: 0.60,
        netOdds: 1.0,
        portfolioCapital: 100_000,
        maxQuarterFraction: 0.05,
      });
      // f* = (0.6*2 - 1)/1 = 0.20 -> quarter Kelly = 0.05
      expect(sizing.quarterKellyFraction).toBeCloseTo(0.05, 4);
      expect(sizing.cappedFraction).toBe(0.05);
      expect(sizing.recommendedSizeUsd).toBe(5_000);
    });

    it('tracks equity drawdown and trips circuit breaker at 15%', () => {
      const breaker = new DrawdownBreaker(100_000, 0.15);
      breaker.updateCapital(105_000); // new peak
      expect(breaker.isTripped()).toBe(false);

      breaker.updateCapital(90_000); // 14.28% drawdown
      expect(breaker.isTripped()).toBe(false);

      breaker.updateCapital(88_000); // 16.19% drawdown -> TRIPPED
      expect(breaker.isTripped()).toBe(true);

      breaker.resetPeak(90_000);
      expect(breaker.isTripped()).toBe(false);
    });
  });

  describe('AmmMetricsRecorder & AmmAuditLogger', () => {
    it('records telemetry and formats Prometheus export text', () => {
      const metrics = new AmmMetricsRecorder();
      metrics.recordTrade(5000, 150);
      metrics.setLiquidityDepth(250000);
      metrics.setVpinToxicity(0.18);
      metrics.setActivePoolsCount(3);

      const snapshot = metrics.getSnapshot();
      expect(snapshot.tradeVolumeUsd).toBe(5000);
      expect(snapshot.arbitragePnlUsd).toBe(150);
      expect(snapshot.liquidityDepthUsd).toBe(250000);
      expect(snapshot.vpinToxicity).toBe(0.18);

      const prom = metrics.exportPrometheusMetrics();
      expect(prom).toContain('amm_liquidity_depth_usd 250000.00');
      expect(prom).toContain('amm_arbitrage_pnl_usd 150.0000');
    });

    it('maintains verifiable SHA-256 HMAC cryptographic audit chain', () => {
      const logger = new AmmAuditLogger('test-secret');
      logger.logEvent('POOL_INITIALIZED', { poolId: 'p1' });
      logger.logEvent('TRADE_EXECUTED', { poolId: 'p1', volume: 1000 });
      logger.logEvent('BASKET_ARBITRAGE_DETECTED', { spread: 0.05 });

      const chain = logger.getChain();
      expect(chain.length).toBe(3);
      expect(chain[0].prevHash).toBe('0'.repeat(64));
      expect(chain[1].prevHash).toBe(chain[0].hash);
      expect(chain[2].prevHash).toBe(chain[1].hash);

      const verification = logger.verifyChain();
      expect(verification.valid).toBe(true);
      expect(verification.totalRecords).toBe(3);
    });

    it('detects tampering or corruption in audit hash chain', () => {
      const logger = new AmmAuditLogger('test-secret');
      logger.logEvent('POOL_INITIALIZED', { poolId: 'p1' });
      logger.logEvent('TRADE_EXECUTED', { poolId: 'p1', volume: 1000 });

      // Mutate private chain to simulate adversarial tampering
      const chain = logger.getChain() as unknown as { hash: string }[];
      chain[0].hash = 'tampered-hash-0000000000000000000000000000000000000000000000000000';

      const verification = logger.verifyChain();
      expect(verification.valid).toBe(false);
      expect(verification.failedIndex).toBe(0);
    });
  });

  describe('AmmEngine (Master Facade)', () => {
    it('registers pool, passes risk check, executes trade, and logs audit events', () => {
      const engine = new AmmEngine();
      const poolConfig: MultiTokenPoolConfig = {
        poolId: 'engine-pool-1',
        model: 'LMSR',
        outcomes: [
          { index: 0, symbol: 'A', name: 'Outcome A', tokenId: 'tok-a' },
          { index: 1, symbol: 'B', name: 'Outcome B', tokenId: 'tok-b' },
        ],
        collateralToken: 'USDC',
        initialCollateral: 10000,
        feeBps: 20,
        lmsrB: 1000,
      };

      const pool = engine.registerPool(poolConfig);
      expect(engine.getPool('engine-pool-1')).toBe(pool);

      const riskCtx: RiskContext = {
        portfolioCapitalUsd: 100_000,
        currentPoolExposureUsd: 5_000,
        venueLatencyMs: 15,
      };

      const tradeRes = engine.executeTrade(
        { poolId: 'engine-pool-1', outcomeIndex: 0, action: 'BUY', amount: 500 },
        riskCtx
      );

      expect(tradeRes.success).toBe(true);
      expect(tradeRes.result).toBeDefined();
      expect(tradeRes.result!.outputAmount).toBeGreaterThan(0);

      // Verify audit chain
      const auditResult = engine.getAuditLogger().verifyChain();
      expect(auditResult.valid).toBe(true);
      expect(engine.getAuditLogger().getChain().length).toBeGreaterThanOrEqual(3);

      engine.shutdown();
      expect(engine.isActive()).toBe(false);
    });
  });
});
