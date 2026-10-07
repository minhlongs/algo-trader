/**
 * Real-Time Cross-Venue Arbitrage Detector
 * Calculates cross-venue spreads with fee hurdles, gas costs, slippage, and unhedged timeout guardrails.
 */

import { logger } from '../../../shared/utils/logger';

export type VenueId = 'binance' | 'polymarket' | 'hyperliquid';

export interface VenueQuote {
  venue: VenueId;
  symbol: string;
  bestBid: number;
  bestBidQty: number;
  bestAsk: number;
  bestAskQty: number;
  timestamp?: number;
}

export interface VenueFeeConfig {
  takerFeeRate: number; // e.g., 0.00075 for 7.5 bps
  gasCostUsd: number; // Fixed or estimated gas cost in USD
  slippageBps: number; // Estimated slippage in bps
}

export interface CrossVenueArbConfig {
  minNetProfitBps: number; // e.g. 15 bps
  minNetProfitUsd: number; // e.g. $1.00
  unhedgedTimeoutMs: number; // Hard guardrail <= 250ms
  fees: Record<VenueId, VenueFeeConfig>;
}

export interface CrossVenueArbOpportunity {
  id: string;
  buyVenue: VenueId;
  sellVenue: VenueId;
  symbol: string;
  buyPrice: number;
  sellPrice: number;
  maxVolume: number;
  grossSpreadBps: number;
  totalFrictionUsd: number;
  netProfitUsd: number;
  netSpreadBps: number;
  isViable: boolean;
  timestamp: number;
}

export interface UnhedgedGuardrailResult {
  triggered: boolean;
  elapsedMs: number;
  timeoutLimitMs: number;
  action: 'NONE' | 'EMERGENCY_UNWIND';
  reason?: string;
}

export const DEFAULT_ARB_CONFIG: CrossVenueArbConfig = {
  minNetProfitBps: 15,
  minNetProfitUsd: 0.5,
  unhedgedTimeoutMs: 250,
  fees: {
    binance: { takerFeeRate: 0.00075, gasCostUsd: 0, slippageBps: 2 },
    hyperliquid: { takerFeeRate: 0.00035, gasCostUsd: 0, slippageBps: 2 },
    polymarket: { takerFeeRate: 0.02, gasCostUsd: 0.02, slippageBps: 5 },
  },
};

export class CrossVenueArbDetector {
  private readonly config: CrossVenueArbConfig;

  constructor(config?: Partial<CrossVenueArbConfig>) {
    this.config = {
      ...DEFAULT_ARB_CONFIG,
      ...config,
      unhedgedTimeoutMs: Math.min(config?.unhedgedTimeoutMs ?? DEFAULT_ARB_CONFIG.unhedgedTimeoutMs, 250),
      fees: { ...DEFAULT_ARB_CONFIG.fees, ...config?.fees },
    };
  }

  evaluatePair(quoteA: VenueQuote, quoteB: VenueQuote, maxNotionalUsd = 1000): CrossVenueArbOpportunity[] {
    const opps: CrossVenueArbOpportunity[] = [];
    const opp1 = this.calculateOpportunity(quoteA, quoteB, maxNotionalUsd);
    if (opp1) opps.push(opp1);
    const opp2 = this.calculateOpportunity(quoteB, quoteA, maxNotionalUsd);
    if (opp2) opps.push(opp2);
    return opps;
  }

  private calculateOpportunity(buyQuote: VenueQuote, sellQuote: VenueQuote, maxNotionalUsd: number): CrossVenueArbOpportunity | null {
    const buyPrice = buyQuote.bestAsk;
    const sellPrice = sellQuote.bestBid;
    if (buyPrice <= 0 || sellPrice <= 0) return null;

    const maxVolume = Math.min(
      buyQuote.bestAskQty,
      sellQuote.bestBidQty,
      maxNotionalUsd / buyPrice,
    );
    if (maxVolume <= 0) return null;

    const notionalUsd = buyPrice * maxVolume;
    const buyFeeCfg = this.config.fees[buyQuote.venue] ?? { takerFeeRate: 0.001, gasCostUsd: 0, slippageBps: 5 };
    const sellFeeCfg = this.config.fees[sellQuote.venue] ?? { takerFeeRate: 0.001, gasCostUsd: 0, slippageBps: 5 };

    const buyFeeUsd = notionalUsd * buyFeeCfg.takerFeeRate;
    const sellFeeUsd = sellPrice * maxVolume * sellFeeCfg.takerFeeRate;
    const gasTotalUsd = buyFeeCfg.gasCostUsd + sellFeeCfg.gasCostUsd;
    const slippageUsd = notionalUsd * ((buyFeeCfg.slippageBps + sellFeeCfg.slippageBps) / 10000);
    const totalFrictionUsd = buyFeeUsd + sellFeeUsd + gasTotalUsd + slippageUsd;

    const grossProfitUsd = (sellPrice - buyPrice) * maxVolume;
    const netProfitUsd = grossProfitUsd - totalFrictionUsd;
    const grossSpreadBps = ((sellPrice - buyPrice) / buyPrice) * 10000;
    const netSpreadBps = notionalUsd > 0 ? (netProfitUsd / notionalUsd) * 10000 : 0;
    const isViable = netSpreadBps >= this.config.minNetProfitBps && netProfitUsd >= this.config.minNetProfitUsd;

    return {
      id: `${buyQuote.venue}-${sellQuote.venue}-${Date.now()}`,
      buyVenue: buyQuote.venue,
      sellVenue: sellQuote.venue,
      symbol: buyQuote.symbol,
      buyPrice,
      sellPrice,
      maxVolume,
      grossSpreadBps,
      totalFrictionUsd,
      netProfitUsd,
      netSpreadBps,
      isViable,
      timestamp: Date.now(),
    };
  }

  evaluateUnhedgedRisk(leg1FilledTime: number, leg2FilledTime?: number, currentTime = Date.now()): UnhedgedGuardrailResult {
    const elapsedMs = leg2FilledTime !== undefined ? leg2FilledTime - leg1FilledTime : currentTime - leg1FilledTime;
    const isTimeout = elapsedMs > this.config.unhedgedTimeoutMs;

    if (isTimeout) {
      logger.warn(`[CrossVenueArb] Unhedged leg timeout exceeded: ${elapsedMs}ms > ${this.config.unhedgedTimeoutMs}ms. Triggering auto-unwind.`);
      return {
        triggered: true,
        elapsedMs,
        timeoutLimitMs: this.config.unhedgedTimeoutMs,
        action: 'EMERGENCY_UNWIND',
        reason: `Leg 2 fill delayed by ${elapsedMs}ms (threshold: ${this.config.unhedgedTimeoutMs}ms)`,
      };
    }

    return {
      triggered: false,
      elapsedMs,
      timeoutLimitMs: this.config.unhedgedTimeoutMs,
      action: 'NONE',
    };
  }
}
