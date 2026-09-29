/**
 * Mock Trading Engines & Intent Generators Fixture
 * Generates realistic signals matching Arbitrage, MARL, AMM, and Alpha-Lab
 */

import type {
  UnifiedTradeIntent,
  IntentPriority,
  MockVenueBook,
  EngineId,
} from './harness-types';

export function createArbitrageIntent(
  overrides?: Partial<UnifiedTradeIntent>
): UnifiedTradeIntent {
  const now = Date.now();
  return {
    intentId: `arb-${now}-${Math.random().toString(36).slice(2, 7)}`,
    engineId: 'arbitrage',
    symbol: 'BTC/USDT',
    venue: 'binance',
    side: 'BUY',
    quantity: 1.0,
    price: 65000,
    urgency: 'HIGH',
    expectedEdgeBps: 45,
    expectedSharpe: 2.8,
    timeToExpiryMs: 500,
    expiresAt: now + 500,
    orderType: 'IOC',
    isRiskReducing: false,
    ...overrides,
  };
}

export function createMarlIntent(
  overrides?: Partial<UnifiedTradeIntent>
): UnifiedTradeIntent {
  const now = Date.now();
  const isHedge = overrides?.isRiskReducing ?? false;
  return {
    intentId: `marl-${now}-${Math.random().toString(36).slice(2, 7)}`,
    engineId: 'marl',
    symbol: 'BTC/USDT',
    venue: isHedge ? 'binance' : 'polymarket_clob',
    side: isHedge ? 'SELL' : 'BUY',
    quantity: 0.5,
    price: 65000,
    urgency: isHedge ? 'HIGH' : 'LOW',
    expectedEdgeBps: isHedge ? 10 : 25,
    expectedSharpe: isHedge ? 1.2 : 2.1,
    timeToExpiryMs: isHedge ? 200 : 3600000,
    expiresAt: now + (isHedge ? 200 : 3600000),
    orderType: isHedge ? 'MARKET' : 'TWO_SIDED_QUOTE',
    isRiskReducing: isHedge,
    ...overrides,
  };
}

export function createAmmIntent(
  overrides?: Partial<UnifiedTradeIntent>
): UnifiedTradeIntent {
  const now = Date.now();
  return {
    intentId: `amm-${now}-${Math.random().toString(36).slice(2, 7)}`,
    engineId: 'amm',
    symbol: 'ETH/USDT',
    venue: 'amm_cpmm',
    side: 'BUY',
    quantity: 5.0,
    price: 3500,
    urgency: 'MEDIUM',
    expectedEdgeBps: 30,
    expectedSharpe: 1.8,
    timeToExpiryMs: 10000,
    expiresAt: now + 10000,
    orderType: 'LIMIT',
    isRiskReducing: false,
    ...overrides,
  };
}

export function createAlphaLabIntent(
  overrides?: Partial<UnifiedTradeIntent>
): UnifiedTradeIntent {
  const now = Date.now();
  return {
    intentId: `alpha-${now}-${Math.random().toString(36).slice(2, 7)}`,
    engineId: 'alpha-lab',
    symbol: 'BTC/USDT',
    venue: 'bybit',
    side: 'BUY',
    quantity: 0.25,
    price: 65000,
    urgency: 'LOW',
    expectedEdgeBps: 80,
    expectedSharpe: 2.2,
    timeToExpiryMs: 86400000,
    expiresAt: now + 86400000,
    orderType: 'MARKET',
    isRiskReducing: false,
    ...overrides,
  };
}

export function createBatchIntents(
  count: number,
  engine: EngineId = 'arbitrage',
  isRiskReducing = false
): UnifiedTradeIntent[] {
  const creators: Record<EngineId, (o?: Partial<UnifiedTradeIntent>) => UnifiedTradeIntent> = {
    arbitrage: createArbitrageIntent,
    marl: createMarlIntent,
    amm: createAmmIntent,
    'alpha-lab': createAlphaLabIntent,
  };

  const factory = creators[engine] || createArbitrageIntent;
  return Array.from({ length: count }, (_, i) =>
    factory({
      intentId: `batch-${engine}-${i}`,
      quantity: 1 + (i % 5) * 0.1,
      isRiskReducing,
      urgency: isRiskReducing ? 'HIGH' : i % 3 === 0 ? 'HIGH' : i % 2 === 0 ? 'MEDIUM' : 'LOW',
    })
  );
}

export function calculateMockPriority(
  intent: UnifiedTradeIntent,
  now = Date.now()
): IntentPriority {
  const urgencyScore = intent.urgency === 'HIGH' ? 1000 : intent.urgency === 'MEDIUM' ? 100 : 10;
  const riskReductionBoost = intent.isRiskReducing ? 500 : 0;
  const edgeScore = Math.max(0, Math.min(50, intent.expectedEdgeBps / 10));
  const sharpeScore = Math.max(0, Math.min(50, intent.expectedSharpe * 10));

  const remainingMs = intent.expiresAt > 0 ? Math.max(0, intent.expiresAt - now) : intent.timeToExpiryMs;
  const maxHorizonMs = 86_400_000;
  const expiryScore = Math.max(0, Math.min(50, 50 * (1 - remainingMs / maxHorizonMs)));

  const compositePriority = urgencyScore + riskReductionBoost + edgeScore + sharpeScore + expiryScore;
  return { urgencyScore, edgeScore, sharpeScore, expiryScore, riskReductionBoost, compositePriority };
}

export function createMockVenueBooks(): MockVenueBook[] {
  const now = Date.now();
  return [
    {
      venueId: 'binance',
      symbol: 'BTC/USDT',
      bids: [{ price: 64990, quantity: 10 }, { price: 64980, quantity: 15 }],
      asks: [{ price: 65010, quantity: 10 }, { price: 65020, quantity: 15 }],
      takerFeeBps: 5,
      makerFeeBps: 1,
      gasCostUsd: 0,
      timestamp: now,
    },
    {
      venueId: 'bybit',
      symbol: 'BTC/USDT',
      bids: [{ price: 64995, quantity: 8 }, { price: 64985, quantity: 12 }],
      asks: [{ price: 65005, quantity: 8 }, { price: 65015, quantity: 12 }],
      takerFeeBps: 6,
      makerFeeBps: 1.5,
      gasCostUsd: 0,
      timestamp: now,
    },
    {
      venueId: 'polymarket_clob',
      symbol: 'BTC/USDT',
      bids: [{ price: 64980, quantity: 20 }],
      asks: [{ price: 65020, quantity: 20 }],
      takerFeeBps: 0,
      makerFeeBps: 0,
      gasCostUsd: 0.15,
      timestamp: now,
    },
  ];
}
