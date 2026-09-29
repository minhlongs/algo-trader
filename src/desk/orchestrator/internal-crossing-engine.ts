/**
 * Internal Crossing Engine
 * 3-Tier conflict resolution: Tier 1 internal crossing (0 fee/slippage),
 * Tier 2 risk supremacy, Tier 3 portfolio weight conviction arbitration.
 */

import { logger } from '../../shared/utils/logger';
import { ConflictResolver } from './conflict-resolver';
import type {
  EngineId,
  ResolutionResult,
  SyntheticFill,
  UnifiedTradeIntent,
  VenueId,
} from './orchestrator-types';

export interface CrossingOptions {
  readonly midPriceProvider?: (symbol: string, venue?: VenueId) => number | undefined;
  readonly strategyWeights?: Partial<Record<EngineId, number>>;
  readonly allowTier1Crossing?: boolean;
  readonly requirePriceOverlap?: boolean;
}

export class InternalCrossingEngine {
  private readonly conflictResolver: ConflictResolver;

  constructor(conflictResolver = new ConflictResolver()) {
    this.conflictResolver = conflictResolver;
  }

  public computeConviction(intent: UnifiedTradeIntent, weights?: Partial<Record<EngineId, number>>): number {
    const w = weights?.[intent.engineId] ?? 0.25;
    return w * Math.max(1, intent.expectedEdgeBps) * Math.max(0.1, intent.expectedSharpe);
  }

  public determineMidPrice(
    buy: UnifiedTradeIntent, sell: UnifiedTradeIntent,
    provider?: (symbol: string, venue?: VenueId) => number | undefined
  ): number | undefined {
    if (provider) {
      const p = provider(buy.symbol, buy.venue);
      if (p !== undefined && p > 0) return p;
    }
    if (buy.price && sell.price) return (buy.price + sell.price) / 2;
    return buy.price ?? sell.price;
  }

  public resolvePair(
    buy: UnifiedTradeIntent, sell: UnifiedTradeIntent, options: CrossingOptions = {}
  ): ResolutionResult {
    const allowCrossing = options.allowTier1Crossing ?? true;
    const midPrice = this.determineMidPrice(buy, sell, options.midPriceProvider);
    const overlap = !options.requirePriceOverlap || (!buy.price || !sell.price || buy.price >= sell.price);

    if (allowCrossing && midPrice !== undefined && midPrice > 0 && overlap) {
      return this.executeTier1Crossing(buy, sell, midPrice);
    }
    if (buy.isRiskReducing !== sell.isRiskReducing) {
      return this.executeTier2RiskSupremacy(buy, sell);
    }
    return this.executeTier3Arbitration(buy, sell, options.strategyWeights);
  }

  public executeTier1Crossing(
    buy: UnifiedTradeIntent, sell: UnifiedTradeIntent, midPrice: number
  ): ResolutionResult {
    const matchedQty = Math.min(buy.quantity, sell.quantity);
    const now = Date.now();
    const makeFill = (intent: UnifiedTradeIntent, side: 'BUY' | 'SELL'): SyntheticFill => ({
      fillId: `synth-fill-${intent.intentId}-${now}`, intentId: intent.intentId,
      engineId: intent.engineId, symbol: intent.symbol, venue: intent.venue,
      side, quantity: matchedQty, price: midPrice, fee: 0, slippage: 0, timestamp: now,
    });
    const fills: SyntheticFill[] = [makeFill(buy, 'BUY'), makeFill(sell, 'SELL')];

    const residuals: UnifiedTradeIntent[] = [];
    if (buy.quantity > matchedQty) {
      residuals.push({ ...buy, quantity: Number((buy.quantity - matchedQty).toFixed(8)) });
    } else if (sell.quantity > matchedQty) {
      residuals.push({ ...sell, quantity: Number((sell.quantity - matchedQty).toFixed(8)) });
    }

    logger.info('Tier 1 Internal Netting executed', { symbol: buy.symbol, matchedQty, midPrice });
    return {
      resolutionType: 'TIER_1_CROSS', matchedQuantity: matchedQty, midPrice,
      syntheticFills: fills, residualIntents: residuals, rejectedIntents: [],
      reason: 'Matched internally at mid-market price with zero fee and zero slippage',
    };
  }

  public executeTier2RiskSupremacy(
    buy: UnifiedTradeIntent, sell: UnifiedTradeIntent
  ): ResolutionResult {
    const winner = buy.isRiskReducing ? buy : sell;
    const loser = buy.isRiskReducing ? sell : buy;
    logger.warn('Tier 2 Risk Supremacy triggered', { winnerId: winner.intentId, loserId: loser.intentId });
    return {
      resolutionType: 'TIER_2_RISK_SUPREMACY', matchedQuantity: 0,
      syntheticFills: [], residualIntents: [winner],
      rejectedIntents: [{
        intentId: loser.intentId, engineId: loser.engineId,
        reason: 'OVERRIDDEN_BY_RISK_REDUCING_SUPREMACY',
      }],
      reason: `Risk-reducing intent from ${winner.engineId} overrides speculative intent from ${loser.engineId}`,
    };
  }

  public executeTier3Arbitration(
    buy: UnifiedTradeIntent, sell: UnifiedTradeIntent, weights?: Partial<Record<EngineId, number>>
  ): ResolutionResult {
    const cBuy = this.computeConviction(buy, weights);
    const cSell = this.computeConviction(sell, weights);
    const sellWins = cSell > cBuy || (cSell === cBuy && sell.urgency === 'HIGH' && buy.urgency !== 'HIGH');
    const winner = sellWins ? sell : buy;
    const loser = sellWins ? buy : sell;

    logger.info('Tier 3 Conviction Arbitration resolved', { winnerId: winner.intentId, loserId: loser.intentId });
    return {
      resolutionType: 'TIER_3_PORTFOLIO_CONVICTION', matchedQuantity: 0,
      syntheticFills: [], residualIntents: [winner],
      rejectedIntents: [{
        intentId: loser.intentId, engineId: loser.engineId,
        reason: 'CONFLICT_RESOLVED_BY_PORTFOLIO_WEIGHT',
      }],
      reason: `Portfolio weight conviction: ${winner.engineId} (${Math.max(cBuy, cSell).toFixed(2)}) > ${loser.engineId} (${Math.min(cBuy, cSell).toFixed(2)})`,
    };
  }

  public resolveAll(
    intents: readonly UnifiedTradeIntent[], options: CrossingOptions = {}
  ): { results: ResolutionResult[]; nonConflicting: UnifiedTradeIntent[] } {
    const pairs = this.conflictResolver.findOpposingPairs(intents);
    const results = pairs.map((pair) => this.resolvePair(pair.buyIntent, pair.sellIntent, options));
    const nonConflicting = this.conflictResolver.extractNonConflictingIntents(intents);
    return { results, nonConflicting };
  }
}
