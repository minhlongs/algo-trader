/**
 * Multi-Source Signal Normalizer
 * Ingests & normalizes trade intents across all 4 trading engines:
 * Arbitrage, MARL Market Making, Prediction Market AMM, and Alpha-Lab.
 */

import type { ArbitrageOpportunity as SpreadArbOpp } from '../arbitrage/spread-detector-types';
import type { ArbitrageOpportunity as EngineArbOpp } from '../arbitrage/engine/arbitrage-engine-types';
import type { QuoteProposal } from '../marl/types/marl-types';
import type { MarlLimitOrder } from '../marl/types/marl-execution-types';
import type { TwoSidedQuote, RebalanceOrder } from '../amm/types/liquidity-types';
import type { ArbitrageOpportunity as AmmArbOpp } from '../amm/types/arbitrage-types';
import type { AISignal } from '../strategies/ai-signal-adapter-types';
import type { TradeSignal } from '../execution/paper-position-types';
import type { UnifiedTradeIntent, VenueId } from './orchestrator-types';

export function mapVenue(raw?: string): VenueId {
  if (!raw) return 'binance';
  const l = raw.toLowerCase();
  if (l.includes('binance')) return 'binance';
  if (l.includes('bybit')) return 'bybit';
  if (l.includes('clob') || l.includes('polymarket')) return 'polymarket_clob';
  if (l.includes('lmsr')) return 'amm_lmsr';
  if (l.includes('cpmm') || l.includes('amm')) return 'amm_cpmm';
  return 'binance';
}

function makeIntent(
  id: string, engine: 'arbitrage' | 'marl' | 'amm' | 'alpha-lab',
  symbol: string, venue: VenueId, side: 'BUY' | 'SELL', qty: number,
  price: number | undefined, urgency: 'HIGH' | 'MEDIUM' | 'LOW',
  edgeBps: number, sharpe: number, expiryMs: number,
  orderType: 'MARKET' | 'LIMIT' | 'IOC' | 'TWO_SIDED_QUOTE' | 'MULTI_LEG_BUNDLE',
  riskReducing: boolean, meta?: Record<string, unknown>
): UnifiedTradeIntent {
  const now = Date.now();
  return {
    intentId: id, engineId: engine, symbol, venue, side, quantity: qty,
    price, urgency, expectedEdgeBps: edgeBps, expectedSharpe: sharpe,
    timeToExpiryMs: expiryMs, expiresAt: now + expiryMs,
    orderType, isRiskReducing: riskReducing, metadata: meta,
  };
}

export class SignalNormalizer {
  public normalizeArbitrage(opp: SpreadArbOpp | EngineArbOpp, defaultQty = 1.0): UnifiedTradeIntent[] {
    const eOpp = opp as EngineArbOpp;
    if (eOpp.legs && eOpp.legs.length > 0) {
      return eOpp.legs.map((leg, i) => makeIntent(
        `arb-${opp.id}-leg-${i}`, 'arbitrage', leg.symbol, mapVenue(leg.venue || leg.exchange),
        leg.side.toUpperCase() === 'BUY' ? 'BUY' : 'SELL', leg.amount, leg.price,
        'HIGH', eOpp.netProfitBps ?? 30, 2.5, 500, 'IOC', false, { oppId: opp.id, leg: i }
      ));
    }
    const sOpp = opp as SpreadArbOpp;
    const sym = sOpp.symbol || eOpp.symbol || 'BTC/USDT';
    const edge = eOpp.netProfitBps ?? Math.round((sOpp.spreadPercent ?? 0.005) * 10000);
    const qty = eOpp.tradeSize || eOpp.amount || defaultQty;
    return [
      makeIntent(`arb-${opp.id}-buy`, 'arbitrage', sym, mapVenue(sOpp.buyExchange || eOpp.buyVenue),
        'BUY', qty, sOpp.buyPrice ?? eOpp.buyPrice, 'HIGH', edge, 2.5, 500, 'IOC', false),
      makeIntent(`arb-${opp.id}-sell`, 'arbitrage', sym, mapVenue(sOpp.sellExchange || eOpp.sellVenue),
        'SELL', qty, sOpp.sellPrice ?? eOpp.sellPrice, 'HIGH', edge, 2.5, 500, 'IOC', false),
    ];
  }

  public normalizeMarlQuote(p: QuoteProposal): UnifiedTradeIntent[] {
    const v = mapVenue(p.venue);
    const edge = Math.max(5, Math.round(((p.askPrice - p.bidPrice) / (p.reservationPrice || p.bidPrice)) * 5000));
    const shp = Math.max(1.0, p.confidence * 2.0);
    const now = p.timestamp || Date.now();
    return [
      makeIntent(`marl-${p.agentId}-bid-${now}`, 'marl', p.symbol, v, 'BUY', p.bidSize, p.bidPrice, 'LOW', edge, shp, 2000, 'LIMIT', false),
      makeIntent(`marl-${p.agentId}-ask-${now}`, 'marl', p.symbol, v, 'SELL', p.askSize, p.askPrice, 'LOW', edge, shp, 2000, 'LIMIT', false),
    ];
  }

  public normalizeMarlOrder(o: MarlLimitOrder, isHedge = false): UnifiedTradeIntent {
    const isMkt = o.type === 'market';
    const isIoc = o.type === 'ioc';
    const riskRed = isHedge || isMkt || isIoc;
    const urgency = riskRed ? 'HIGH' : 'MEDIUM';
    const expMs = riskRed ? 500 : 5000;
    const oType = isMkt ? 'MARKET' : isIoc ? 'IOC' : 'LIMIT';
    return makeIntent(`marl-${o.orderId}`, 'marl', o.symbol, mapVenue(o.venue),
      o.side === 'buy' ? 'BUY' : 'SELL', o.remainingAmount > 0 ? o.remainingAmount : o.amount,
      isMkt ? undefined : o.price, urgency, riskRed ? 15 : 25, riskRed ? 2.5 : 1.8, expMs, oType, riskRed, { agentId: o.agentId });
  }

  public normalizeAmmQuote(q: TwoSidedQuote, symbol: string, venue: VenueId = 'amm_cpmm'): UnifiedTradeIntent[] {
    const now = q.timestamp || Date.now();
    return [
      makeIntent(`amm-quote-${q.outcomeId}-bid-${now}`, 'amm', symbol, venue, 'BUY', q.bidSize, q.bidPrice, 'LOW', q.spreadBps, 1.5, 5000, 'TWO_SIDED_QUOTE', false),
      makeIntent(`amm-quote-${q.outcomeId}-ask-${now}`, 'amm', symbol, venue, 'SELL', q.askSize, q.askPrice, 'LOW', q.spreadBps, 1.5, 5000, 'TWO_SIDED_QUOTE', false),
    ];
  }

  public normalizeAmmRebalance(r: RebalanceOrder): UnifiedTradeIntent {
    const expMs = r.urgency === 'HIGH' ? 1000 : r.urgency === 'MEDIUM' ? 5000 : 15000;
    return makeIntent(`amm-reb-${r.rebalanceId}`, 'amm', r.outcomeId, mapVenue(r.venue),
      r.side, r.targetQuantity, r.limitPrice, r.urgency, 30, 2.0, expMs, 'LIMIT', true, { reason: r.reason });
  }

  public normalizeAmmArbitrage(opp: AmmArbOpp): UnifiedTradeIntent[] {
    return opp.legs.map((leg) => makeIntent(
      `amm-arb-${opp.id}-leg-${leg.outcomeIndex}`, 'amm', leg.outcomeSymbol,
      leg.venue === 'CLOB' ? 'polymarket_clob' : 'amm_cpmm', leg.action,
      leg.size, leg.price, 'HIGH', Math.max(10, Math.round(opp.netEdge * 10000)),
      3.0, 1000, 'MULTI_LEG_BUNDLE', false, { oppId: opp.id, conditionId: opp.conditionId }
    ));
  }

  public normalizeAlphaSignal(s: AISignal, qty = 1.0, venue: VenueId = 'binance'): UnifiedTradeIntent {
    const dir = (s.direction ?? s.action ?? 'BUY') as 'BUY' | 'SELL';
    const expMs = (s.expectedHoldingPeriod ?? 24) * 3600 * 1000;
    return makeIntent(`alpha-${s.signalId || s.strategyId || Date.now()}`, 'alpha-lab',
      s.symbol || 'BTC/USDT', venue, dir, qty, undefined, s.confidence >= 0.85 ? 'MEDIUM' : 'LOW',
      Math.max(10, Math.round(s.expectancy * 10000)), Math.max(1.0, (s.calibratedConfidence ?? s.confidence) * 2.5),
      expMs, 'LIMIT', false, { strategyId: s.strategyId, regime: s.regime });
  }

  public normalizeTradeSignal(s: TradeSignal, venue: VenueId = 'binance'): UnifiedTradeIntent {
    return makeIntent(`alpha-trade-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      'alpha-lab', s.symbol, venue, s.side === 'buy' ? 'BUY' : 'SELL', s.quantity,
      s.price, 'MEDIUM', 25, 1.5, 3600 * 1000, s.price ? 'LIMIT' : 'MARKET', false);
  }
}
