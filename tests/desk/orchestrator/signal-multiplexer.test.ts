import { describe, it, expect } from 'vitest';
import {
  UnifiedTradeIntentSchema,
  SyntheticFillSchema,
  type UnifiedTradeIntent,
} from '../../../src/desk/orchestrator/orchestrator-types';
import { SignalNormalizer, mapVenue } from '../../../src/desk/orchestrator/signal-normalizer';
import { PrioritySignalQueue } from '../../../src/desk/orchestrator/priority-signal-queue';
import { ConflictResolver } from '../../../src/desk/orchestrator/conflict-resolver';
import { InternalCrossingEngine } from '../../../src/desk/orchestrator/internal-crossing-engine';

function makeIntent(p: Partial<UnifiedTradeIntent> = {}): UnifiedTradeIntent {
  return {
    intentId: p.intentId ?? `intent-${Math.random().toString(36).slice(2, 7)}`,
    engineId: p.engineId ?? 'alpha-lab', symbol: p.symbol ?? 'BTC/USDT',
    venue: p.venue ?? 'binance', side: p.side ?? 'BUY', quantity: p.quantity ?? 1.0,
    price: p.price ?? 50000, urgency: p.urgency ?? 'MEDIUM',
    expectedEdgeBps: p.expectedEdgeBps ?? 20, expectedSharpe: p.expectedSharpe ?? 2.0,
    timeToExpiryMs: p.timeToExpiryMs ?? 60000, expiresAt: p.expiresAt ?? (Date.now() + 60000),
    orderType: p.orderType ?? 'LIMIT', isRiskReducing: p.isRiskReducing ?? false,
    metadata: p.metadata,
  };
}

describe('SignalNormalizer', () => {
  const norm = new SignalNormalizer();

  it('normalizes arbitrage opportunities with legs and spread models', () => {
    const spreadOpp = { id: 's1', buyExchange: 'binance', sellExchange: 'bybit', buyPrice: 100, sellPrice: 102, spread: 2, spreadPercent: 0.02, timestamp: Date.now(), latency: 10 };
    const spreadIntents = norm.normalizeArbitrage(spreadOpp, 2.5);
    expect(spreadIntents).toHaveLength(2);
    expect(spreadIntents[0].side).toBe('BUY');
    expect(spreadIntents[1].side).toBe('SELL');
    spreadIntents.forEach((i) => expect(UnifiedTradeIntentSchema.parse(i)).toBeDefined());

    const legIntents = norm.normalizeArbitrage({ id: 'e1', legs: [{ symbol: 'ETH/USDT', venue: 'polymarket_clob', side: 'buy', price: 2000, amount: 1 }] });
    expect(legIntents).toHaveLength(1);
    expect(legIntents[0].venue).toBe('polymarket_clob');
  });

  it('normalizes MARL quote proposals and limit orders', () => {
    const qp = { agentId: 'a1', symbol: 'BTC/USDT', venue: 'binance', bidPrice: 49900, bidSize: 0.5, askPrice: 50100, askSize: 0.5, reservationPrice: 50000, bidSpread: 100, askSpread: 100, confidence: 0.9, timestamp: Date.now() };
    expect(norm.normalizeMarlQuote(qp)).toHaveLength(2);

    const hedgeOrder = { orderId: 'h1', agentId: 'a1', symbol: 'BTC/USDT', venue: 'bybit', side: 'sell' as const, type: 'market' as const, price: 50000, amount: 0.5, filledAmount: 0, remainingAmount: 0.5, status: 'PENDING' as const, createdAt: Date.now(), updatedAt: Date.now() };
    const hedge = norm.normalizeMarlOrder(hedgeOrder, true);
    expect(hedge.urgency).toBe('HIGH');
    expect(hedge.isRiskReducing).toBe(true);
  });

  it('normalizes AMM quotes, rebalance orders, and basket arbitrage', () => {
    const tsq = { outcomeId: 'out-1', bidPrice: 0.48, askPrice: 0.52, bidSize: 100, askSize: 100, spreadBps: 400, skewOffset: 0, timestamp: Date.now() };
    expect(norm.normalizeAmmQuote(tsq, 'TRUMP-WIN')).toHaveLength(2);

    const reb = { rebalanceId: 'r1', venue: 'amm_cpmm', outcomeId: 'out-1', side: 'BUY' as const, targetQuantity: 50, limitPrice: 0.50, urgency: 'HIGH' as const, reason: 'skew' };
    const rebIntent = norm.normalizeAmmRebalance(reb);
    expect(rebIntent.isRiskReducing).toBe(true);
    expect(rebIntent.urgency).toBe('HIGH');

    const ammArb = { id: 'arb-1', marketId: 'm1', conditionId: 'c1', type: 'OVERPRICED_BASKET' as const, legs: [{ outcomeIndex: 0, outcomeSymbol: 'YES', action: 'SELL' as const, price: 0.55, size: 10, venue: 'CLOB' as const }], grossEdge: 0.1, estimatedFeesUsdc: 0.01, estimatedGasUsd: 0.02, netEdge: 0.07, netProfitUsd: 7, maxExecutableSets: 10, timestampMs: Date.now() };
    expect(norm.normalizeAmmArbitrage(ammArb)[0].venue).toBe('polymarket_clob');
  });

  it('normalizes Alpha-Lab AI and trade signals and maps venues', () => {
    const ai = { strategyId: 's1', direction: 'BUY' as const, confidence: 0.88, expectancy: 0.03, regime: 'TRENDING' as const, timestamp: Date.now() };
    expect(norm.normalizeAlphaSignal(ai, 1.2).side).toBe('BUY');
    expect(mapVenue('binance-futures')).toBe('binance');
    expect(mapVenue('polymarket')).toBe('polymarket_clob');
    expect(mapVenue('amm_lmsr')).toBe('amm_lmsr');
  });
});

describe('PrioritySignalQueue & Backpressure Shedding', () => {
  it('computes composite priority correctly and ranks intents', () => {
    const q = new PrioritySignalQueue(50);
    const low = makeIntent({ urgency: 'LOW', expectedEdgeBps: 5, expectedSharpe: 1.0 });
    const med = makeIntent({ urgency: 'MEDIUM', expectedEdgeBps: 20, expectedSharpe: 2.0 });
    const high = makeIntent({ urgency: 'HIGH', expectedEdgeBps: 50, expectedSharpe: 3.0 });
    const hedge = makeIntent({ urgency: 'HIGH', isRiskReducing: true, expectedEdgeBps: 10 });
    [low, high, med, hedge].forEach((i) => q.enqueue(i));

    expect(q.dequeue()?.intentId).toBe(hedge.intentId);
    expect(q.dequeue()?.intentId).toBe(high.intentId);
    expect(q.dequeue()?.intentId).toBe(med.intentId);
    expect(q.dequeue()?.intentId).toBe(low.intentId);
  });

  it('sheds lowest-priority items at capacity while strictly protecting risk-reducing and HIGH urgency', () => {
    const q = new PrioritySignalQueue(3);
    const [p1, p2, p3] = [5, 10, 15].map((e, idx) =>
      makeIntent({ intentId: `p${idx + 1}`, urgency: 'LOW', expectedEdgeBps: e, isRiskReducing: false })
    );
    [p1, p2, p3].forEach((p) => q.enqueue(p));
    expect(q.size()).toBe(3);

    const p4 = makeIntent({ intentId: 'p4', urgency: 'MEDIUM', expectedEdgeBps: 30 });
    expect(q.enqueue(p4)).toBe(true);
    expect(q.size()).toBe(3);
    expect(q.getStatus().shedCount).toBe(1);
    expect(q.getAll().map((i) => i.intentId)).not.toContain('p1');

    q.enqueue(makeIntent({ intentId: 'high-1', urgency: 'HIGH' }));
    q.enqueue(makeIntent({ intentId: 'hedge-1', isRiskReducing: true, urgency: 'LOW' }));
    expect(q.size()).toBe(3);
    const ids = q.getAll().map((i) => i.intentId);
    expect(ids).toContain('high-1');
    expect(ids).toContain('hedge-1');
  });
});

describe('ConflictResolver', () => {
  const resolver = new ConflictResolver();

  it('detects opposing buy/sell pairs on identical instruments', () => {
    const buy = makeIntent({ symbol: 'BTC/USDT', side: 'BUY' });
    const sell = makeIntent({ symbol: 'BTC/USDT', side: 'SELL' });
    const other = makeIntent({ symbol: 'ETH/USDT', side: 'BUY' });
    expect(resolver.hasOpposition(buy, sell)).toBe(true);
    expect(resolver.hasOpposition(buy, other)).toBe(false);

    const pairs = resolver.findOpposingPairs([buy, sell, other]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].buyIntent.intentId).toBe(buy.intentId);
    expect(pairs[0].sellIntent.intentId).toBe(sell.intentId);

    const nonConflicting = resolver.extractNonConflictingIntents([buy, sell, other]);
    expect(nonConflicting).toHaveLength(1);
    expect(nonConflicting[0].symbol).toBe('ETH/USDT');
  });
});

describe('InternalCrossingEngine (3-Tier Resolution)', () => {
  const engine = new InternalCrossingEngine();

  it('Tier 1: executes internal netting with 0 fees, 0 slippage, and forwards net residuals', () => {
    const buy = makeIntent({ intentId: 'b1', engineId: 'alpha-lab', side: 'BUY', quantity: 2.0, price: 50100 });
    const sell = makeIntent({ intentId: 's1', engineId: 'marl', side: 'SELL', quantity: 1.5, price: 49900 });
    const res = engine.resolvePair(buy, sell);

    expect(res.resolutionType).toBe('TIER_1_CROSS');
    expect(res.matchedQuantity).toBe(1.5);
    expect(res.midPrice).toBe(50000);
    expect(res.syntheticFills).toHaveLength(2);
    res.syntheticFills.forEach((f) => {
      expect(SyntheticFillSchema.parse(f)).toBeDefined();
      expect(f.fee).toBe(0);
      expect(f.slippage).toBe(0);
    });
    expect(res.residualIntents).toHaveLength(1);
    expect(res.residualIntents[0].quantity).toBe(0.5);
    expect(res.residualIntents[0].side).toBe('BUY');
  });

  it('Tier 2: enforces risk-reducing supremacy over speculative alpha', () => {
    const alphaBuy = makeIntent({ intentId: 'a1', engineId: 'alpha-lab', side: 'BUY', isRiskReducing: false });
    const marlHedge = makeIntent({ intentId: 'm1', engineId: 'marl', side: 'SELL', isRiskReducing: true });
    const res = engine.resolvePair(alphaBuy, marlHedge, { allowTier1Crossing: false });

    expect(res.resolutionType).toBe('TIER_2_RISK_SUPREMACY');
    expect(res.residualIntents[0].intentId).toBe('m1');
    expect(res.rejectedIntents[0].intentId).toBe('a1');
    expect(res.rejectedIntents[0].reason).toBe('OVERRIDDEN_BY_RISK_REDUCING_SUPREMACY');
  });

  it('Tier 3: arbitrates opposing speculative intents via portfolio conviction weights', () => {
    const buy = makeIntent({ intentId: 'b1', engineId: 'alpha-lab', side: 'BUY', expectedEdgeBps: 20, expectedSharpe: 2.0, isRiskReducing: false });
    const sell = makeIntent({ intentId: 's1', engineId: 'marl', side: 'SELL', expectedEdgeBps: 80, expectedSharpe: 2.0, isRiskReducing: false });
    const res = engine.resolvePair(buy, sell, {
      allowTier1Crossing: false,
      strategyWeights: { 'alpha-lab': 0.20, marl: 0.50 },
    });

    expect(res.resolutionType).toBe('TIER_3_PORTFOLIO_CONVICTION');
    expect(res.residualIntents[0].intentId).toBe('s1');
    expect(res.rejectedIntents[0].intentId).toBe('b1');
    expect(res.rejectedIntents[0].reason).toBe('CONFLICT_RESOLVED_BY_PORTFOLIO_WEIGHT');
  });

  it('resolves batch conflicts preserving non-conflicting intents', () => {
    const b1 = makeIntent({ intentId: 'b1', symbol: 'BTC/USDT', side: 'BUY', quantity: 1, price: 50000 });
    const s1 = makeIntent({ intentId: 's1', symbol: 'BTC/USDT', side: 'SELL', quantity: 1, price: 50000 });
    const solo = makeIntent({ intentId: 'solo', symbol: 'SOL/USDT', side: 'BUY', quantity: 10 });
    const { results, nonConflicting } = engine.resolveAll([b1, s1, solo]);
    expect(results).toHaveLength(1);
    expect(results[0].resolutionType).toBe('TIER_1_CROSS');
    expect(nonConflicting).toHaveLength(1);
    expect(nonConflicting[0].intentId).toBe('solo');
  });
});
