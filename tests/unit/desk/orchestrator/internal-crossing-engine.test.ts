import { describe, it, expect, vi } from 'vitest';
import {
  InternalCrossingEngine,
  type CrossingOptions,
} from '../../../../src/desk/orchestrator/internal-crossing-engine';
import type { UnifiedTradeIntent } from '../../../../src/desk/orchestrator/orchestrator-types';

describe('InternalCrossingEngine Tier 1/2/3 Conflict Resolution', () => {
  const engine = new InternalCrossingEngine();

  const makeIntent = (
    id: string,
    side: 'BUY' | 'SELL',
    qty: number,
    price: number | undefined,
    opts: Partial<UnifiedTradeIntent> = {}
  ): UnifiedTradeIntent => ({
    intentId: id,
    engineId: opts.engineId ?? 'arbitrage',
    symbol: opts.symbol ?? 'BTC/USDT',
    venue: opts.venue ?? 'binance',
    side,
    quantity: qty,
    price,
    urgency: opts.urgency ?? 'MEDIUM',
    expectedEdgeBps: opts.expectedEdgeBps ?? 20,
    expectedSharpe: opts.expectedSharpe ?? 1.5,
    timeToExpiryMs: 1000,
    expiresAt: Date.now() + 1000,
    orderType: opts.orderType ?? 'LIMIT',
    isRiskReducing: opts.isRiskReducing ?? false,
    metadata: opts.metadata,
  });

  describe('computeConviction & determineMidPrice', () => {
    it('computes conviction with custom strategy weights and floor bounds', () => {
      const intent = makeIntent('i-1', 'BUY', 1, 50000, {
        engineId: 'marl',
        expectedEdgeBps: 0, // tests Math.max(1, 0)
        expectedSharpe: 0, // tests Math.max(0.1, 0)
      });

      const convCustom = engine.computeConviction(intent, { marl: 0.5 });
      expect(convCustom).toBe(0.5 * 1 * 0.1);

      const convDefault = engine.computeConviction(intent);
      expect(convDefault).toBe(0.25 * 1 * 0.1);
    });

    it('determines mid price with provider if valid', () => {
      const buy = makeIntent('b-1', 'BUY', 1, 50000);
      const sell = makeIntent('s-1', 'SELL', 1, 50100);

      const providerValid = vi.fn().mockReturnValue(50055);
      expect(engine.determineMidPrice(buy, sell, providerValid)).toBe(50055);

      const providerInvalid = vi.fn().mockReturnValue(0);
      expect(engine.determineMidPrice(buy, sell, providerInvalid)).toBe(50050);

      const providerUndefined = vi.fn().mockReturnValue(undefined);
      expect(engine.determineMidPrice(buy, sell, providerUndefined)).toBe(50050);
    });

    it('determines mid price with single price or missing price fallback', () => {
      const buyWithPrice = makeIntent('b-2', 'BUY', 1, 50000);
      const sellNoPrice = makeIntent('s-2', 'SELL', 1, undefined);
      expect(engine.determineMidPrice(buyWithPrice, sellNoPrice)).toBe(50000);

      const buyNoPrice = makeIntent('b-3', 'BUY', 1, undefined);
      const sellWithPrice = makeIntent('s-3', 'SELL', 1, 50200);
      expect(engine.determineMidPrice(buyNoPrice, sellWithPrice)).toBe(50200);

      expect(engine.determineMidPrice(buyNoPrice, sellNoPrice)).toBeUndefined();
    });
  });

  describe('resolvePair: Tier 1 Internal Crossing', () => {
    it('executes Tier 1 crossing with equal quantities', () => {
      const buy = makeIntent('b-cross-1', 'BUY', 2.0, 50000);
      const sell = makeIntent('s-cross-1', 'SELL', 2.0, 49900);

      const res = engine.resolvePair(buy, sell);
      expect(res.resolutionType).toBe('TIER_1_CROSS');
      expect(res.matchedQuantity).toBe(2.0);
      expect(res.midPrice).toBe(49950);
      expect(res.syntheticFills).toHaveLength(2);
      expect(res.syntheticFills[0].side).toBe('BUY');
      expect(res.syntheticFills[1].side).toBe('SELL');
      expect(res.syntheticFills[0].fee).toBe(0);
      expect(res.residualIntents).toHaveLength(0);
      expect(res.rejectedIntents).toHaveLength(0);
    });

    it('executes Tier 1 crossing with buy residual quantity', () => {
      const buy = makeIntent('b-cross-2', 'BUY', 3.5, 50000);
      const sell = makeIntent('s-cross-2', 'SELL', 1.5, 49800);

      const res = engine.resolvePair(buy, sell);
      expect(res.matchedQuantity).toBe(1.5);
      expect(res.residualIntents).toHaveLength(1);
      expect(res.residualIntents[0].intentId).toBe('b-cross-2');
      expect(res.residualIntents[0].quantity).toBe(2.0);
    });

    it('executes Tier 1 crossing with sell residual quantity', () => {
      const buy = makeIntent('b-cross-3', 'BUY', 1.0, 50000);
      const sell = makeIntent('s-cross-3', 'SELL', 2.5, 49800);

      const res = engine.resolvePair(buy, sell);
      expect(res.matchedQuantity).toBe(1.0);
      expect(res.residualIntents).toHaveLength(1);
      expect(res.residualIntents[0].intentId).toBe('s-cross-3');
      expect(res.residualIntents[0].quantity).toBe(1.5);
    });

    it('respects requirePriceOverlap when buy price < sell price (no cross)', () => {
      const buy = makeIntent('b-no-overlap', 'BUY', 1.0, 49000);
      const sell = makeIntent('s-no-overlap', 'SELL', 1.0, 51000);

      const options: CrossingOptions = { requirePriceOverlap: true };
      const res = engine.resolvePair(buy, sell, options);
      // Fails Tier 1 overlap requirement, falls through to Tier 3
      expect(res.resolutionType).toBe('TIER_3_PORTFOLIO_CONVICTION');
    });

    it('allows crossing when requirePriceOverlap is true but one intent lacks price', () => {
      const buy = makeIntent('b-no-price', 'BUY', 1.0, undefined);
      const sell = makeIntent('s-with-price', 'SELL', 1.0, 50000);

      const options: CrossingOptions = { requirePriceOverlap: true };
      const res = engine.resolvePair(buy, sell, options);
      expect(res.resolutionType).toBe('TIER_1_CROSS');
      expect(res.midPrice).toBe(50000);
    });
  });

  describe('resolvePair: Tier 2 Risk Supremacy', () => {
    it('gives supremacy to risk-reducing buy intent when Tier 1 is disabled', () => {
      const buy = makeIntent('b-risk-red', 'BUY', 1.0, 50000, { isRiskReducing: true });
      const sell = makeIntent('s-spec', 'SELL', 1.0, 50000, { isRiskReducing: false });

      const res = engine.resolvePair(buy, sell, { allowTier1Crossing: false });
      expect(res.resolutionType).toBe('TIER_2_RISK_SUPREMACY');
      expect(res.residualIntents).toHaveLength(1);
      expect(res.residualIntents[0].intentId).toBe('b-risk-red');
      expect(res.rejectedIntents).toHaveLength(1);
      expect(res.rejectedIntents[0].intentId).toBe('s-spec');
      expect(res.rejectedIntents[0].reason).toBe('OVERRIDDEN_BY_RISK_REDUCING_SUPREMACY');
    });

    it('gives supremacy to risk-reducing sell intent when Tier 1 is disabled', () => {
      const buy = makeIntent('b-spec', 'BUY', 1.0, 50000, { isRiskReducing: false });
      const sell = makeIntent('s-risk-red', 'SELL', 1.0, 50000, { isRiskReducing: true });

      const res = engine.resolvePair(buy, sell, { allowTier1Crossing: false });
      expect(res.resolutionType).toBe('TIER_2_RISK_SUPREMACY');
      expect(res.residualIntents[0].intentId).toBe('s-risk-red');
      expect(res.rejectedIntents[0].intentId).toBe('b-spec');
    });
  });

  describe('resolvePair: Tier 3 Conviction Arbitration', () => {
    it('resolves in favor of sell intent when conviction is higher', () => {
      const buy = makeIntent('b-low-conv', 'BUY', 1.0, 50000, {
        engineId: 'alpha-lab',
        expectedEdgeBps: 10,
        expectedSharpe: 1.0,
      });
      const sell = makeIntent('s-high-conv', 'SELL', 1.0, 50000, {
        engineId: 'arbitrage',
        expectedEdgeBps: 50,
        expectedSharpe: 2.5,
      });

      const res = engine.resolvePair(buy, sell, { allowTier1Crossing: false });
      expect(res.resolutionType).toBe('TIER_3_PORTFOLIO_CONVICTION');
      expect(res.residualIntents[0].intentId).toBe('s-high-conv');
      expect(res.rejectedIntents[0].intentId).toBe('b-low-conv');
    });

    it('breaks ties in favor of HIGH urgency intent', () => {
      const buy = makeIntent('b-tie-med', 'BUY', 1.0, 50000, {
        expectedEdgeBps: 20,
        expectedSharpe: 2.0,
        urgency: 'MEDIUM',
      });
      const sell = makeIntent('s-tie-high', 'SELL', 1.0, 50000, {
        expectedEdgeBps: 20,
        expectedSharpe: 2.0,
        urgency: 'HIGH',
      });

      const res = engine.resolvePair(buy, sell, { allowTier1Crossing: false });
      expect(res.resolutionType).toBe('TIER_3_PORTFOLIO_CONVICTION');
      expect(res.residualIntents[0].intentId).toBe('s-tie-high');
    });

    it('resolves in favor of buy intent when buy has higher conviction or equal fallback', () => {
      const buy = makeIntent('b-higher', 'BUY', 1.0, 50000, {
        expectedEdgeBps: 40,
        expectedSharpe: 2.0,
      });
      const sell = makeIntent('s-lower', 'SELL', 1.0, 50000, {
        expectedEdgeBps: 10,
        expectedSharpe: 1.0,
      });

      const res = engine.resolvePair(buy, sell, { allowTier1Crossing: false });
      expect(res.residualIntents[0].intentId).toBe('b-higher');
      expect(res.rejectedIntents[0].intentId).toBe('s-lower');
    });
  });

  describe('resolveAll', () => {
    it('processes batch of conflicting and non-conflicting intents', () => {
      const buyBtc = makeIntent('b-btc', 'BUY', 1.0, 50000, { symbol: 'BTC/USDT' });
      const sellBtc = makeIntent('s-btc', 'SELL', 1.0, 50000, { symbol: 'BTC/USDT' });
      const buyEth = makeIntent('b-eth', 'BUY', 5.0, 3000, { symbol: 'ETH/USDT' });

      const batch = engine.resolveAll([buyBtc, sellBtc, buyEth]);
      expect(batch.results).toHaveLength(1);
      expect(batch.results[0].resolutionType).toBe('TIER_1_CROSS');
      expect(batch.nonConflicting).toHaveLength(1);
      expect(batch.nonConflicting[0].symbol).toBe('ETH/USDT');
    });
  });
});
