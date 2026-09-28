/**
 * Mock Conflict Resolver Fixture
 * 3-Tier resolution: internal crossing, risk supremacy, portfolio weight conviction
 */

import type {
  UnifiedTradeIntent,
  ResolutionResult,
  SyntheticFill,
  EngineId,
} from './harness-types';

export class MockConflictResolver {
  public detectConflicts(intents: readonly UnifiedTradeIntent[]): Array<[UnifiedTradeIntent, UnifiedTradeIntent]> {
    const pairs: Array<[UnifiedTradeIntent, UnifiedTradeIntent]> = [];
    const buys = intents.filter((i) => i.side === 'BUY');
    const sells = intents.filter((i) => i.side === 'SELL');

    for (const buy of buys) {
      for (const sell of sells) {
        if (buy.symbol === sell.symbol && buy.intentId !== sell.intentId) {
          pairs.push([buy, sell]);
        }
      }
    }
    return pairs;
  }

  public resolveTier1Crossing(
    buy: UnifiedTradeIntent,
    sell: UnifiedTradeIntent,
    midPrice: number
  ): ResolutionResult {
    const matchQty = Math.min(buy.quantity, sell.quantity);
    const now = Date.now();

    const syntheticFills: SyntheticFill[] = [
      {
        fillId: `fill-buy-${now}`,
        intentId: buy.intentId,
        engineId: buy.engineId,
        symbol: buy.symbol,
        venue: buy.venue,
        side: 'BUY',
        quantity: matchQty,
        price: midPrice,
        fee: 0,
        slippage: 0,
        timestamp: now,
      },
      {
        fillId: `fill-sell-${now}`,
        intentId: sell.intentId,
        engineId: sell.engineId,
        symbol: sell.symbol,
        venue: sell.venue,
        side: 'SELL',
        quantity: matchQty,
        price: midPrice,
        fee: 0,
        slippage: 0,
        timestamp: now,
      },
    ];

    const residualIntents: UnifiedTradeIntent[] = [];
    if (buy.quantity > sell.quantity) {
      residualIntents.push({ ...buy, quantity: buy.quantity - matchQty });
    } else if (sell.quantity > buy.quantity) {
      residualIntents.push({ ...sell, quantity: sell.quantity - matchQty });
    }

    return {
      resolutionType: 'TIER_1_CROSS',
      matchedQuantity: matchQty,
      midPrice,
      syntheticFills,
      residualIntents,
      rejectedIntents: [],
      reason: `Internal cross executed at mid-price ${midPrice} with zero fee/slippage`,
    };
  }

  public resolveTier2RiskSupremacy(
    buy: UnifiedTradeIntent,
    sell: UnifiedTradeIntent
  ): ResolutionResult {
    const buyRisk = buy.isRiskReducing;
    const sellRisk = sell.isRiskReducing;

    if (buyRisk && !sellRisk) {
      return {
        resolutionType: 'TIER_2_RISK_SUPREMACY',
        matchedQuantity: 0,
        syntheticFills: [],
        residualIntents: [buy],
        rejectedIntents: [{ intentId: sell.intentId, engineId: sell.engineId, reason: 'Superseded by risk-reducing intent' }],
        reason: 'Risk-reducing intent took priority over speculative intent',
      };
    }

    if (sellRisk && !buyRisk) {
      return {
        resolutionType: 'TIER_2_RISK_SUPREMACY',
        matchedQuantity: 0,
        syntheticFills: [],
        residualIntents: [sell],
        rejectedIntents: [{ intentId: buy.intentId, engineId: buy.engineId, reason: 'Superseded by risk-reducing intent' }],
        reason: 'Risk-reducing intent took priority over speculative intent',
      };
    }

    return {
      resolutionType: 'NO_CONFLICT',
      matchedQuantity: 0,
      syntheticFills: [],
      residualIntents: [buy, sell],
      rejectedIntents: [],
      reason: 'Both intents share same risk profile; cannot resolve under Tier 2',
    };
  }

  public resolveTier3Conviction(
    buy: UnifiedTradeIntent,
    sell: UnifiedTradeIntent,
    weights: Record<EngineId, number>
  ): ResolutionResult {
    const buyConviction = (weights[buy.engineId] ?? 0.25) * buy.expectedEdgeBps * Math.max(0.1, buy.expectedSharpe);
    const sellConviction = (weights[sell.engineId] ?? 0.25) * sell.expectedEdgeBps * Math.max(0.1, sell.expectedSharpe);

    const winner = buyConviction >= sellConviction ? buy : sell;
    const loser = buyConviction >= sellConviction ? sell : buy;

    return {
      resolutionType: 'TIER_3_PORTFOLIO_CONVICTION',
      matchedQuantity: 0,
      syntheticFills: [],
      residualIntents: [winner],
      rejectedIntents: [{ intentId: loser.intentId, engineId: loser.engineId, reason: 'Arbitrated by portfolio weight conviction' }],
      reason: `Engine ${winner.engineId} won conviction arbitration (${winner === buy ? buyConviction.toFixed(1) : sellConviction.toFixed(1)} vs ${winner === buy ? sellConviction.toFixed(1) : buyConviction.toFixed(1)})`,
    };
  }
}
