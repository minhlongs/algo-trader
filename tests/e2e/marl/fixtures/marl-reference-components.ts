/**
 * Reference Components & Behavioral Simulators for
 * MARL Market-Making & Delta-Neutral Liquidity Engine.
 *
 * Implements exact mathematical formulas, contracts, state machines, and
 * invariants specified in PROJECT.md and spec_miner_survey_1/handoff.md.
 */

import { createHmac } from 'crypto';
import type {
  ReservationPriceInput,
  OptimalQuotesInput,
  OptimalQuotesResult,
  AvellanedaStoikovConfig,
  MarlObservationVector,
  MarlAction,
  MarlStepResult,
  MarlOrderBook,
  MarlOrderBookLevel,
  QuoteProposal,
  AgentObservation,
  ReplayStepResult,
  ReplayFillEvent,
  LiveStreamAdapterConfig,
  PortfolioDeltaSnapshot,
  VenuePositionDelta,
  DeltaHedgeConfig,
  HedgeOrderRequest,
  HedgeExecutionReport,
  CompensatoryUnwindResult,
  TradeTick,
  VolumeBucket,
  ToxicityMetricsSnapshot,
  SweepDetectionResult,
  AdverseSelectionConfig,
  MarlRiskConfig,
  MarlRiskEvaluationResult,
  MarlTelemetryRecorders,
  MarlAuditAction,
  MarlAuditPayload,
  MarlAuditRecord,
  UnifiedMarlEngineConfig,
} from './marl-contracts';

// ============================================================================
// Feature 1: Avellaneda-Stoikov Reservation Price
// r(s, q, t) = s - q * gamma * sigma^2 * (T - t)
// ============================================================================
export function calculateReservationPrice(input: ReservationPriceInput): number {
  const { midPrice, inventory, gamma, sigma, timeToHorizonSec } = input;
  const tau = Math.max(0, timeToHorizonSec);
  const skew = inventory * gamma * Math.pow(sigma, 2) * tau;
  return midPrice - skew;
}

// ============================================================================
// Feature 2: Optimal Spreads & Quote Placement
// delta_a = -q * gamma * sigma^2 * tau + (1/kappa) * ln(1 + gamma/kappa)
// delta_b = +q * gamma * sigma^2 * tau + (1/kappa) * ln(1 + gamma/kappa)
// ============================================================================
export function calculateOptimalSpreadBase(gamma: number, kappa: number): number {
  if (kappa <= 0 || gamma <= 0) return 0.02;
  return (1 / kappa) * Math.log(1 + gamma / kappa);
}

export function quantizeToTick(price: number, tickSize: number): number {
  if (tickSize <= 0) return price;
  const factor = 1 / tickSize;
  return Math.round(price * factor) / factor;
}

export function calculateOptimalQuotes(input: OptimalQuotesInput): OptimalQuotesResult {
  const {
    midPrice,
    inventory,
    gamma,
    sigma,
    timeToHorizonSec,
    kappa,
    tickSize = 0.01,
    minSpread = 0.02,
    maxSpread = 0.20,
    minPrice = 0.01,
    maxPrice = 0.99,
  } = input;

  const tau = Math.max(0, timeToHorizonSec);
  const reservationPrice = calculateReservationPrice({
    midPrice,
    inventory,
    gamma,
    sigma,
    timeToHorizonSec: tau,
  });

  const halfSpreadBase = calculateOptimalSpreadBase(gamma, kappa);
  const invSkew = inventory * gamma * Math.pow(sigma, 2) * tau;

  const rawDeltaA = -invSkew + halfSpreadBase;
  const rawDeltaB = invSkew + halfSpreadBase;

  const rawAsk = midPrice + rawDeltaA;
  const rawBid = midPrice - rawDeltaB;

  let bid = quantizeToTick(rawBid, tickSize);
  let ask = quantizeToTick(rawAsk, tickSize);
  let clamped = false;

  // Min / max spread enforcement
  let spread = ask - bid;
  if (spread < minSpread) {
    clamped = true;
    const diff = minSpread - spread;
    bid = quantizeToTick(bid - diff / 2, tickSize);
    ask = quantizeToTick(ask + diff / 2, tickSize);
  } else if (spread > maxSpread) {
    clamped = true;
    const excess = spread - maxSpread;
    bid = quantizeToTick(bid + excess / 2, tickSize);
    ask = quantizeToTick(ask - excess / 2, tickSize);
  }

  // Boundary clamping [minPrice, maxPrice]
  if (bid < minPrice) {
    bid = minPrice;
    clamped = true;
  }
  if (ask > maxPrice) {
    ask = maxPrice;
    clamped = true;
  }
  if (bid > maxPrice - tickSize) {
    bid = quantizeToTick(maxPrice - tickSize, tickSize);
    clamped = true;
  }
  if (ask < minPrice + tickSize) {
    ask = quantizeToTick(minPrice + tickSize, tickSize);
    clamped = true;
  }

  // Non-crossing guarantee: ask >= bid + tickSize
  if (ask <= bid) {
    clamped = true;
    if (bid + tickSize <= maxPrice) {
      ask = quantizeToTick(bid + tickSize, tickSize);
    } else {
      bid = quantizeToTick(ask - tickSize, tickSize);
    }
  }

  bid = Number(bid.toFixed(4));
  ask = Number(ask.toFixed(4));
  const resPrice = Number(reservationPrice.toFixed(4));

  return {
    reservationPrice: resPrice,
    bidPrice: bid,
    askPrice: ask,
    bidSpread: Number((midPrice - bid).toFixed(4)),
    askSpread: Number((ask - midPrice).toFixed(4)),
    totalSpread: Number((ask - bid).toFixed(4)),
    rawBidPrice: Number(rawBid.toFixed(4)),
    rawAskPrice: Number(rawAsk.toFixed(4)),
    clamped,
  };
}

// ============================================================================
// Feature 3: Polymarket Quote Formatter & Clamps
// ============================================================================
export class PolymarketQuoteFormatter {
  constructor(
    private readonly tickSize: number = 0.01,
    private readonly minPrice: number = 0.01,
    private readonly maxPrice: number = 0.99,
  ) {}

  public formatAndClamp(
    rawBid: number,
    rawAsk: number,
    midPrice: number,
  ): { bidPrice: number; askPrice: number; clamped: boolean } {
    let bid = quantizeToTick(rawBid, this.tickSize);
    let ask = quantizeToTick(rawAsk, this.tickSize);
    let clamped = false;

    if (bid < this.minPrice) {
      bid = this.minPrice;
      clamped = true;
    }
    if (ask > this.maxPrice) {
      ask = this.maxPrice;
      clamped = true;
    }

    if (bid >= midPrice) {
      bid = quantizeToTick(midPrice - this.tickSize, this.tickSize);
      clamped = true;
    }
    if (ask <= midPrice) {
      ask = quantizeToTick(midPrice + this.tickSize, this.tickSize);
      clamped = true;
    }

    if (ask <= bid) {
      clamped = true;
      ask = quantizeToTick(bid + this.tickSize, this.tickSize);
      if (ask > this.maxPrice) {
        ask = this.maxPrice;
        bid = quantizeToTick(ask - this.tickSize, this.tickSize);
      }
    }

    return {
      bidPrice: Number(bid.toFixed(4)),
      askPrice: Number(ask.toFixed(4)),
      clamped,
    };
  }
}

// ============================================================================
// Feature 4: Multi-Agent POMDP Quoting Environment
// 24-D normalized observation vector, 5-D action space, reward function
// ============================================================================
export class MultiAgentPOMDPEnv {
  private currentStep = 0;
  private inventory = 0;
  private cash = 10_000;
  private midPrice = 0.50;
  private realizedPnl = 0;
  private totalQuotesPosted = 0;
  private totalFills = 0;
  private maxInventory = 1_000;
  private terminalHorizonSec = 86_400;

  constructor(private readonly initialMid: number = 0.50) {
    this.midPrice = initialMid;
  }

  public reset(): MarlObservationVector {
    this.currentStep = 0;
    this.inventory = 0;
    this.cash = 10_000;
    this.midPrice = this.initialMid;
    this.realizedPnl = 0;
    this.totalQuotesPosted = 0;
    this.totalFills = 0;
    return this.getObservation();
  }

  public getObservation(): MarlObservationVector {
    const values = new Float64Array(24);
    // 0: norm_inventory [-1, 1]
    values[0] = Math.max(-1, Math.min(1, this.inventory / this.maxInventory));
    // 1: time_to_horizon [0, 1]
    values[1] = Math.max(0, Math.min(1, 1 - this.currentStep / 1_000));
    // 2: realized_vol_norm [0, 1]
    values[2] = 0.02 / 0.10;
    // 3: l1_orderbook_imbalance [-1, 1]
    values[3] = 0.0;
    // 4: l5_orderbook_imbalance [-1, 1]
    values[4] = 0.0;
    // 5: micro_mid_spread [-1, 1]
    values[5] = 0.0;
    // 6: relative_spread [0, 1]
    values[6] = 0.04 / this.midPrice;
    // 7: vpin_metric [0, 1]
    values[7] = 0.25;
    // 8: vpin_zscore [0, 1]
    values[8] = 0.30;
    // 9: kyles_lambda_ratio [0, 1]
    values[9] = 0.20;
    // 10: ofi_1s [-1, 1]
    values[10] = 0.0;
    // 11: ofi_10s [-1, 1]
    values[11] = 0.0;
    // 12: recent_fill_skew [-1, 1]
    values[12] = 0.0;
    // 13: unrealized_pnl_norm [-1, 1]
    const unpnl = this.inventory * (this.midPrice - 0.50);
    values[13] = Math.tanh(unpnl / 500);
    // 14: bid_depth_1pct [0, 1]
    values[14] = 0.50;
    // 15: ask_depth_1pct [0, 1]
    values[15] = 0.50;
    // 16: price_mom_5s [-1, 1]
    values[16] = 0.0;
    // 17: price_mom_30s [-1, 1]
    values[17] = 0.0;
    // 18: basis_bps [-1, 1]
    values[18] = 0.0;
    // 19: trade_arrival_freq [0, 1]
    values[19] = 0.10;
    // 20: active_quotes_mask [0, 1]
    values[20] = 1.0;
    // 21: net_portfolio_delta [-1, 1]
    values[21] = Math.tanh(this.inventory / 100);
    // 22: recent_unwinds [0, 1]
    values[22] = 0.0;
    // 23: venue_latency [0, 1]
    values[23] = 0.05;

    return {
      values,
      timestamp: Date.now(),
    };
  }

  public step(action: MarlAction): MarlStepResult {
    this.currentStep += 1;
    this.totalQuotesPosted += (action.mode === 'BOTH' ? 2 : action.mode === 'CANCEL_ALL' ? 0 : 1);

    // Multi-component reward calculation
    // R = dPi - phi * q^2 - omega * AdvSel + psi * SpreadCapture - c_cancel * I_cancel
    const phi = 0.5 * 0.1 * Math.pow(0.02, 2);
    const invPenalty = phi * Math.pow(this.inventory, 2);
    const cancelPenalty = action.mode === 'CANCEL_ALL' ? 0.0001 : 0;
    const spreadCapture = 0.01 * (action.bidSpreadMultiplier + action.askSpreadMultiplier);
    const dPi = 0.05; // Base increment

    const reward = dPi - invPenalty + spreadCapture - cancelPenalty;

    const done = this.currentStep >= 1_000 || Math.abs(this.inventory) >= this.maxInventory;

    return {
      observation: this.getObservation(),
      reward,
      done,
      truncated: false,
      info: {
        realizedPnl: this.realizedPnl,
        unrealizedPnl: this.inventory * (this.midPrice - 0.50),
        inventory: this.inventory,
        netDelta: this.inventory,
        vpin: 0.25,
        kylesLambda: 0.0001,
        quotesPosted: this.totalQuotesPosted,
        fillsCount: this.totalFills,
      },
    };
  }
}

// ============================================================================
// Feature 5: Synthetic Orderbook Replay Engine
// Discrete L2 matching and Poisson fill distribution
// ============================================================================
export class SyntheticOrderbookReplayEngine {
  private currentStep = 0;
  private midPrice: number;
  private inventory = 0;

  constructor(
    public readonly symbol: string = 'BTC-USD-YES',
    public readonly initialMid: number = 0.50,
    private readonly tickSize: number = 0.01,
  ) {
    this.midPrice = initialMid;
  }

  public reset(): void {
    this.currentStep = 0;
    this.midPrice = this.initialMid;
    this.inventory = 0;
  }

  public stepTick(spreadBid: number, spreadAsk: number): ReplayStepResult {
    this.currentStep += 1;
    // Mid price Brownian drift
    const drift = (Math.sin(this.currentStep / 10) * 0.001);
    this.midPrice = Math.max(0.02, Math.min(0.98, this.midPrice + drift));

    const bidPrice = quantizeToTick(this.midPrice - spreadBid, this.tickSize);
    const askPrice = quantizeToTick(this.midPrice + spreadAsk, this.tickSize);

    const orderBook: MarlOrderBook = {
      symbol: this.symbol,
      venue: 'polymarket',
      bids: [
        { price: bidPrice, size: 100 },
        { price: quantizeToTick(bidPrice - this.tickSize, this.tickSize), size: 250 },
      ],
      asks: [
        { price: askPrice, size: 100 },
        { price: quantizeToTick(askPrice + this.tickSize, this.tickSize), size: 250 },
      ],
      timestamp: Date.now(),
      sequence: this.currentStep,
    };

    // Poisson fill simulation: higher fill probability near mid
    const fills: ReplayFillEvent[] = [];
    const bidFillProb = Math.exp(-25.0 * spreadBid);
    const askFillProb = Math.exp(-25.0 * spreadAsk);

    if (this.currentStep % 3 === 0 && bidFillProb > 0.3) {
      fills.push({
        orderId: `fill-bid-${this.currentStep}`,
        side: 'buy',
        price: bidPrice,
        size: 10,
        timestamp: Date.now(),
        maker: true,
        spreadBps: Math.round(spreadBid * 10_000),
      });
      this.inventory += 10;
    }
    if (this.currentStep % 4 === 0 && askFillProb > 0.3) {
      fills.push({
        orderId: `fill-ask-${this.currentStep}`,
        side: 'sell',
        price: askPrice,
        size: 10,
        timestamp: Date.now(),
        maker: true,
        spreadBps: Math.round(spreadAsk * 10_000),
      });
      this.inventory -= 10;
    }

    return {
      step: this.currentStep,
      orderBook,
      fills,
      midPrice: this.midPrice,
      done: this.currentStep >= 500,
    };
  }

  public getInventory(): number {
    return this.inventory;
  }
}

// ============================================================================
// Feature 6: Live CLOB Streaming Adapter
// ============================================================================
export class LiveClobStreamAdapter {
  private connected = false;
  private lastHeartbeat = 0;
  private messageCount = 0;

  constructor(private readonly config: LiveStreamAdapterConfig) {}

  public connect(): void {
    this.connected = true;
    this.lastHeartbeat = Date.now();
  }

  public disconnect(): void {
    this.connected = false;
  }

  public isHealthy(): boolean {
    if (!this.connected) return false;
    const timeout = this.config.heartbeatTimeoutMs ?? 5_000;
    return Date.now() - this.lastHeartbeat <= timeout;
  }

  public ingestMessage(book: MarlOrderBook): boolean {
    if (!this.connected) return false;
    this.lastHeartbeat = Date.now();
    this.messageCount += 1;
    return book.bids.length > 0 && book.asks.length > 0;
  }

  public getStats(): { connected: boolean; messages: number; latencyMs: number } {
    return {
      connected: this.connected,
      messages: this.messageCount,
      latencyMs: Date.now() - this.lastHeartbeat,
    };
  }
}

// ============================================================================
// Feature 7: Cross-Venue Net Delta Tracker
// ============================================================================
export class CrossVenueNetDeltaTracker {
  private positions = new Map<string, VenuePositionDelta>();

  public updatePosition(pos: VenuePositionDelta): void {
    const key = `${pos.venue}:${pos.symbol}`;
    this.positions.set(key, pos);
  }

  public clear(): void {
    this.positions.clear();
  }

  public computeNetDelta(toleranceThreshold: number = 0.10): PortfolioDeltaSnapshot {
    let polyDelta = 0;
    let cexDelta = 0;
    let grossNotional = 0;
    const posList: VenuePositionDelta[] = [];

    for (const p of this.positions.values()) {
      posList.push(p);
      grossNotional += p.notionalUsd;
      if (p.venue === 'polymarket') {
        polyDelta += p.netDelta;
      } else {
        cexDelta += p.netDelta;
      }
    }

    const netDelta = Number((polyDelta + cexDelta).toFixed(4));
    const rebalanceRequired = Math.abs(netDelta) > toleranceThreshold;

    return {
      netDelta,
      grossNotionalUsd: grossNotional,
      polyDelta: Number(polyDelta.toFixed(4)),
      cexDelta: Number(cexDelta.toFixed(4)),
      positions: posList,
      timestamp: Date.now(),
      toleranceThreshold,
      rebalanceRequired,
    };
  }
}

// ============================================================================
// Feature 8: Tolerance Band Rebalance Trigger
// Trigger when |Delta_net| > Delta_thresh with hysteresis Delta_inner
// ============================================================================
export class ToleranceBandRebalanceTrigger {
  private inRebalanceState = false;

  constructor(
    public readonly deltaThreshold: number = 0.10,
    public readonly hysteresisRatio: number = 0.50, // inner target = 0.5 * threshold
  ) {}

  public evaluate(netDelta: number): { triggerRebalance: boolean; targetHedgeAmount: number } {
    const absDelta = Math.abs(netDelta);
    const innerBand = this.deltaThreshold * this.hysteresisRatio;

    if (!this.inRebalanceState) {
      if (absDelta > this.deltaThreshold) {
        this.inRebalanceState = true;
        return { triggerRebalance: true, targetHedgeAmount: -netDelta };
      }
      return { triggerRebalance: false, targetHedgeAmount: 0 };
    } else {
      // Once triggered, stay in rebalance until inside inner band
      if (absDelta <= innerBand) {
        this.inRebalanceState = false;
        return { triggerRebalance: false, targetHedgeAmount: 0 };
      }
      return { triggerRebalance: true, targetHedgeAmount: -netDelta };
    }
  }
}

// ============================================================================
// Feature 9: Atomic Cross-Venue Delta Hedge Dispatcher
// ============================================================================
export class AtomicCrossVenueHedgeDispatcher {
  constructor(private readonly config: DeltaHedgeConfig) {}

  public async dispatchHedge(
    targetDelta: number,
    venue: 'binance' | 'bybit' = 'binance',
    symbol: string = 'BTC/USDT',
    simulatedFillFraction: number = 1.0,
  ): Promise<HedgeExecutionReport> {
    const absAmount = Math.abs(targetDelta);
    const side = targetDelta < 0 ? 'sell' : 'buy';

    if (absAmount < (this.config.minLotSize ?? 0.001)) {
      return {
        hedgeId: `rej-${Date.now()}`,
        venue,
        symbol,
        side,
        requestedAmount: absAmount,
        filledAmount: 0,
        avgFillPrice: 0,
        latencyMs: 1,
        status: 'FAILED',
        residualDelta: targetDelta,
      };
    }

    const filledAmount = absAmount * simulatedFillFraction;
    const residual = absAmount - filledAmount;
    const status = simulatedFillFraction >= 1.0 ? 'FILLED' : simulatedFillFraction > 0 ? 'PARTIAL' : 'FAILED';

    const rawResidual = side === 'buy' ? residual : -residual;
    return {
      hedgeId: `hdg-${Date.now()}`,
      venue,
      symbol,
      side,
      requestedAmount: absAmount,
      filledAmount,
      avgFillPrice: 50_000,
      latencyMs: 15,
      status,
      residualDelta: Math.abs(rawResidual) < 1e-12 ? 0 : rawResidual,
    };
  }
}

// ============================================================================
// Feature 10: Compensatory Unwind & Residual Delta Handler
// ============================================================================
export class CompensatoryUnwindHandler {
  constructor(private readonly maxRetries: number = 3) {}

  public async executeUnwind(
    report: HedgeExecutionReport,
    fallbackVenue: 'binance' | 'bybit' = 'bybit',
  ): Promise<CompensatoryUnwindResult> {
    if (report.status === 'FILLED' || Math.abs(report.residualDelta) < 1e-6) {
      return {
        unwindSuccess: true,
        residualDelta: 0,
        filledAmount: report.filledAmount,
        unwoundAmount: 0,
        retryCount: 0,
        actionTaken: 'none',
      };
    }

    // Try secondary CEX route
    const residual = Math.abs(report.residualDelta);
    let unwound = residual;
    let success = true;
    let action: 'secondary_cex_filled' | 'poly_liquidated' | 'emergency_market' = 'secondary_cex_filled';

    // Simulate secondary execution
    return {
      unwindSuccess: success,
      residualDelta: 0,
      filledAmount: report.filledAmount,
      unwoundAmount: unwound,
      retryCount: 1,
      actionTaken: action,
    };
  }
}

// ============================================================================
// Feature 11: Volume-Synchronized Probability of Toxicity (VPIN)
// Constant volume buckets V, Lee-Ready classification, rolling window N=50
// ============================================================================
export class VpinCalculator {
  private readonly bucketVolumeUsd: number;
  private readonly windowBuckets: number;
  private completedBuckets: VolumeBucket[] = [];
  private currentBucketIndex = 0;
  private currentBuyVolume = 0;
  private currentSellVolume = 0;
  private lastTradePrice = 0;

  constructor(bucketVolumeUsd: number = 10_000, windowBuckets: number = 50) {
    this.bucketVolumeUsd = bucketVolumeUsd;
    this.windowBuckets = windowBuckets;
  }

  public ingestTrade(tick: TradeTick): void {
    const mid = (tick.bidPrice + tick.askPrice) / 2;
    let isBuy = tick.price > mid;
    if (tick.price === mid) {
      isBuy = tick.price >= this.lastTradePrice;
    }
    this.lastTradePrice = tick.price;

    let tradeVolume = tick.volume;
    while (tradeVolume > 0) {
      const currentTotal = this.currentBuyVolume + this.currentSellVolume;
      const remainingCapacity = this.bucketVolumeUsd - currentTotal;

      if (tradeVolume <= remainingCapacity) {
        if (isBuy) this.currentBuyVolume += tradeVolume;
        else this.currentSellVolume += tradeVolume;
        tradeVolume = 0;

        if (this.currentBuyVolume + this.currentSellVolume >= this.bucketVolumeUsd) {
          this.finalizeBucket();
        }
      } else {
        // Trade straddles bucket boundary: split trade
        if (isBuy) this.currentBuyVolume += remainingCapacity;
        else this.currentSellVolume += remainingCapacity;
        tradeVolume -= remainingCapacity;
        this.finalizeBucket();
      }
    }
  }

  private finalizeBucket(): void {
    this.completedBuckets.push({
      bucketIndex: this.currentBucketIndex++,
      buyVolume: this.currentBuyVolume,
      sellVolume: this.currentSellVolume,
      totalVolume: this.currentBuyVolume + this.currentSellVolume,
      isComplete: true,
      completedAt: Date.now(),
    });
    if (this.completedBuckets.length > this.windowBuckets) {
      this.completedBuckets.shift();
    }
    this.currentBuyVolume = 0;
    this.currentSellVolume = 0;
  }

  public forceTimeoutBucket(): void {
    if (this.currentBuyVolume + this.currentSellVolume > 0) {
      this.finalizeBucket();
    }
  }

  public calculateVpin(): number {
    if (this.completedBuckets.length === 0) return 0;
    let totalImbalance = 0;
    let totalVol = 0;
    for (const b of this.completedBuckets) {
      totalImbalance += Math.abs(b.buyVolume - b.sellVolume);
      totalVol += b.totalVolume;
    }
    return totalVol > 0 ? totalImbalance / totalVol : 0;
  }

  public getCdf(): number {
    const vpin = this.calculateVpin();
    // Normal approximation for empirical CDF with mu=0.25, sigma=0.15
    const z = (vpin - 0.25) / 0.15;
    return Math.max(0, Math.min(1, 0.5 * (1 + Math.tanh(z * 0.797885))));
  }
}

// ============================================================================
// Feature 12: Kyle's Lambda Price Impact Estimator
// OLS regression: dP = lambda * Q + eps
// ============================================================================
export class KylesLambdaEstimator {
  private deltaPWindow: number[] = [];
  private orderFlowWindow: number[] = [];

  constructor(
    private readonly windowSize: number = 50,
    private readonly baselineLambda: number = 0.0001,
  ) {}

  public ingestInterval(deltaP: number, signedVolume: number): void {
    this.deltaPWindow.push(deltaP);
    this.orderFlowWindow.push(signedVolume);
    if (this.deltaPWindow.length > this.windowSize) {
      this.deltaPWindow.shift();
      this.orderFlowWindow.shift();
    }
  }

  public estimate(): { lambda: number; tStat: number; varQ: number } {
    const n = this.deltaPWindow.length;
    if (n < 3) {
      return { lambda: this.baselineLambda, tStat: 0, varQ: 0 };
    }

    const meanP = this.deltaPWindow.reduce((a, b) => a + b, 0) / n;
    const meanQ = this.orderFlowWindow.reduce((a, b) => a + b, 0) / n;

    let covPQ = 0;
    let varQ = 0;
    for (let i = 0; i < n; i++) {
      const qDev = this.orderFlowWindow[i] - meanQ;
      const pDev = this.deltaPWindow[i] - meanP;
      covPQ += pDev * qDev;
      varQ += qDev * qDev;
    }

    // Zero-variance guard
    if (varQ < 1e-12) {
      return { lambda: this.baselineLambda, tStat: 0, varQ: 0 };
    }

    const lambda = covPQ / varQ;
    // Standard error & t-stat
    let sse = 0;
    for (let i = 0; i < n; i++) {
      const pred = lambda * this.orderFlowWindow[i];
      sse += Math.pow(this.deltaPWindow[i] - pred, 2);
    }
    const se = Math.sqrt(sse / Math.max(1, (n - 2) * varQ));
    const tStat = se > 1e-12 ? lambda / se : lambda > 0 ? 999.0 : 0;

    return { lambda: Math.max(0, lambda), tStat, varQ };
  }
}

// ============================================================================
// Feature 13: Dynamic Quote Widening Multiplier
// W_t = min(5.0, 1.0 + beta1 * max(0, CDF(VPIN) - 0.75) + beta2 * max(0, lambda/lambda0 - 1))
// ============================================================================
export class DynamicQuoteWideningController {
  constructor(
    private readonly maxMultiplier: number = 5.0,
    private readonly vpinThreshold: number = 0.75,
    private readonly beta1: number = 3.0,
    private readonly beta2: number = 1.5,
  ) {}

  public calculateMultiplier(vpinCdf: number, lambdaRatio: number): number {
    const vpinExcess = Math.max(0, vpinCdf - this.vpinThreshold);
    const lambdaExcess = Math.max(0, lambdaRatio - 1.0);
    const rawW = 1.0 + this.beta1 * vpinExcess + this.beta2 * lambdaExcess;
    return Math.min(this.maxMultiplier, Math.max(1.0, rawW));
  }
}

// ============================================================================
// Feature 14: Instant Defensive Cancellation Tripwire
// Sub-millisecond cancel when VPIN >= 0.80 or CDF >= 0.95 or lambda spike or sweep
// ============================================================================
export class InstantCancellationTripwire {
  private active = false;
  private cooldownUntil = 0;

  constructor(
    private readonly criticalVpinCdf: number = 0.95,
    private readonly cooldownDurationMs: number = 15_000,
  ) {}

  public evaluate(
    vpinCdf: number,
    lambdaRatio: number,
    sweepDetected: boolean,
  ): { tripwireActive: boolean; reason?: string } {
    const now = Date.now();
    if (now < this.cooldownUntil) {
      return { tripwireActive: true, reason: 'quarantine_cooldown_active' };
    }

    if (vpinCdf >= this.criticalVpinCdf) {
      this.trigger(now);
      return { tripwireActive: true, reason: 'critical_vpin_breach' };
    }

    if (lambdaRatio >= 3.0) {
      this.trigger(now);
      return { tripwireActive: true, reason: 'liquidity_black_hole' };
    }

    if (sweepDetected) {
      this.trigger(now);
      return { tripwireActive: true, reason: 'informed_sweep_burst' };
    }

    this.active = false;
    return { tripwireActive: false };
  }

  private trigger(now: number): void {
    this.active = true;
    this.cooldownUntil = now + this.cooldownDurationMs;
  }

  public reset(): void {
    this.active = false;
    this.cooldownUntil = 0;
  }
}

// ============================================================================
// Feature 15: Informed Sweep Burst Detector
// Detects >= 3 levels depleted in < 100ms or rapid price jump > 4 sigma
// ============================================================================
export class InformedSweepDetector {
  private levelDepletions: { timestamp: number; direction: 'buy' | 'sell'; volume: number }[] = [];
  private lastMid = 0.50;

  public registerDepletion(direction: 'buy' | 'sell', volume: number, timestamp: number = Date.now()): void {
    this.levelDepletions.push({ timestamp, direction, volume });
    // Clean old
    const cutoff = timestamp - 100;
    this.levelDepletions = this.levelDepletions.filter(d => d.timestamp >= cutoff);
  }

  public checkSweep(currentMid: number, sigma500ms: number = 0.01): SweepDetectionResult {
    const now = Date.now();
    const jump = Number(Math.abs(currentMid - this.lastMid).toFixed(6));
    this.lastMid = currentMid;

    const hurdle = Number((4 * sigma500ms).toFixed(6));
    const fastJump = jump > hurdle;
    const sameDirectionBuys = this.levelDepletions.filter(d => d.direction === 'buy');
    const sameDirectionSells = this.levelDepletions.filter(d => d.direction === 'sell');

    const buySweep = sameDirectionBuys.length >= 3;
    const sellSweep = sameDirectionSells.length >= 3;

    if (buySweep || sellSweep || fastJump) {
      return {
        sweepDetected: true,
        direction: buySweep ? 'buy' : sellSweep ? 'sell' : undefined,
        levelsDepleted: Math.max(sameDirectionBuys.length, sameDirectionSells.length),
        volumeSwept: this.levelDepletions.reduce((acc, d) => acc + d.volume, 0),
        timeElapsedMs: 100,
        fastJumpAnomaly: fastJump,
      };
    }

    return {
      sweepDetected: false,
      levelsDepleted: 0,
      volumeSwept: 0,
      timeElapsedMs: 0,
      fastJumpAnomaly: false,
    };
  }
}

// ============================================================================
// Feature 16: Pre-Trade Quoting Risk Guard
// 5% Quarter-Kelly, 15% daily drawdown breaker, latency check
// ============================================================================
export class PreTradeQuotingRiskGuard {
  constructor(private readonly config: MarlRiskConfig) {}

  public evaluateRisk(
    quoteNotionalUsd: number,
    portfolioCapital: number,
    currentDailyDrawdown: number,
    venueLatencyMs: number,
    currentInventoryNotional: number,
    winRate: number = 0.55,
    payoutRatio: number = 1.0,
  ): MarlRiskEvaluationResult {
    // 1. Drawdown circuit breaker
    if (currentDailyDrawdown >= this.config.maxDailyDrawdownFraction) {
      return {
        approved: false,
        rejectionReason: 'DRAWDOWN_BREAKER_TRIPPED',
        quarterKellySizeUsd: 0,
        currentDrawdownFraction: currentDailyDrawdown,
        venueLatencyMs,
        circuitBroken: true,
      };
    }

    // 2. Latency threshold check
    if (venueLatencyMs > this.config.maxVenueLatencyMs) {
      return {
        approved: false,
        rejectionReason: 'VENUE_LATENCY_SPIKE',
        quarterKellySizeUsd: 0,
        currentDrawdownFraction: currentDailyDrawdown,
        venueLatencyMs,
        circuitBroken: false,
      };
    }

    // 3. Quarter-Kelly sizing limit
    // Full Kelly: f* = (p(b+1) - 1) / b
    const edge = winRate * (payoutRatio + 1) - 1;
    let fullKelly = edge > 0 ? edge / payoutRatio : 0;
    let quarterKelly = fullKelly * 0.25;
    // Cap at maxPositionFraction (5%)
    quarterKelly = Math.min(this.config.maxPositionFraction, Math.max(0, quarterKelly));
    const quarterKellyUsd = Number((quarterKelly * portfolioCapital).toFixed(4));

    if (quoteNotionalUsd > quarterKellyUsd + 1e-4) {
      return {
        approved: false,
        rejectionReason: 'KELLY_CAP_EXCEEDED',
        quarterKellySizeUsd: quarterKellyUsd,
        currentDrawdownFraction: currentDailyDrawdown,
        venueLatencyMs,
        circuitBroken: false,
      };
    }

    // 4. Max inventory cap
    if (currentInventoryNotional + quoteNotionalUsd > this.config.maxInventoryNotionalUsd) {
      return {
        approved: false,
        rejectionReason: 'INVENTORY_LIMIT_EXCEEDED',
        quarterKellySizeUsd: quarterKellyUsd,
        currentDrawdownFraction: currentDailyDrawdown,
        venueLatencyMs,
        circuitBroken: false,
      };
    }

    return {
      approved: true,
      quarterKellySizeUsd: quarterKellyUsd,
      currentDrawdownFraction: currentDailyDrawdown,
      venueLatencyMs,
      circuitBroken: false,
    };
  }
}

// ============================================================================
// Feature 17: Low-Latency Prometheus Telemetry
// ============================================================================
export class MarlPrometheusTelemetry implements MarlTelemetryRecorders {
  public quotesCount = 0;
  public fillsCount = 0;
  public totalFilledSize = 0;
  public inventorySkew = 0;
  public netDelta = 0;
  public realizedPnl = 0;
  public toxicityTripwireEvents = 0;
  public hedgeLatencies: number[] = [];

  public recordQuote(action: 'posted' | 'canceled' | 'rejected', side: 'bid' | 'ask' | 'both'): void {
    this.quotesCount += 1;
  }

  public recordFill(side: 'bid' | 'ask', size: number, fillPrice: number, spreadBps: number): void {
    this.fillsCount += 1;
    this.totalFilledSize += size;
  }

  public recordInventorySkew(inventory: number, notionalUsd: number): void {
    this.inventorySkew = inventory;
  }

  public recordNetDelta(netDelta: number, polyDelta: number, cexDelta: number): void {
    this.netDelta = netDelta;
  }

  public recordPnl(realizedUsd: number, unrealizedUsd: number): void {
    this.realizedPnl = realizedUsd;
  }

  public recordToxicity(vpin: number, kylesLambda: number, tripwireTripped: boolean): void {
    if (tripwireTripped) this.toxicityTripwireEvents += 1;
  }

  public recordHedgeLatency(venue: string, latencyMs: number, status: string): void {
    this.hedgeLatencies.push(latencyMs);
  }

  public getFillRate(): number {
    return this.quotesCount > 0 ? this.fillsCount / this.quotesCount : 0;
  }
}

// ============================================================================
// Feature 18: SHA-256 HMAC Hash-Chained Audit Logger
// Monotonic sequence, hash chaining: prevHash + seq + action + payload
// ============================================================================
export class MarlHashChainedAuditLogger {
  private chain: MarlAuditRecord[] = [];
  private readonly secret: string;

  constructor(secret: string = 'test-secret-key-marl-engine-audit') {
    this.secret = secret;
  }

  public logAction(action: MarlAuditAction, details: Record<string, unknown>): MarlAuditRecord {
    const sequenceNumber = this.chain.length;
    const previousHash =
      sequenceNumber === 0
        ? '0000000000000000000000000000000000000000000000000000000000000000'
        : this.chain[sequenceNumber - 1].hash;

    const timestamp = Date.now();
    const dataToHash = `${previousHash}:${sequenceNumber}:${action}:${timestamp}:${JSON.stringify(details)}`;
    const hash = createHmac('sha256', this.secret).update(dataToHash).digest('hex');

    const record: MarlAuditRecord = {
      sequenceNumber,
      timestamp,
      actor: 'algo-trader:marl-engine',
      action,
      payload: details,
      previousHash,
      hash,
    };

    this.chain.push(record);
    return record;
  }

  public verifyChain(): { valid: boolean; brokenAt?: number; total: number } {
    for (let i = 0; i < this.chain.length; i++) {
      const current = this.chain[i];
      const expectedPrev =
        i === 0
          ? '0000000000000000000000000000000000000000000000000000000000000000'
          : this.chain[i - 1].hash;

      if (current.previousHash !== expectedPrev) {
        return { valid: false, brokenAt: i, total: this.chain.length };
      }

      const dataToHash = `${current.previousHash}:${current.sequenceNumber}:${current.action}:${current.timestamp}:${JSON.stringify(current.payload)}`;
      const recomputedHash = createHmac('sha256', this.secret).update(dataToHash).digest('hex');
      if (current.hash !== recomputedHash) {
        return { valid: false, brokenAt: i, total: this.chain.length };
      }
    }
    return { valid: true, total: this.chain.length };
  }

  public getRecords(): MarlAuditRecord[] {
    return [...this.chain];
  }
}

// ============================================================================
// Feature 19: Unified MARL Engine Facade
// Master coordinator integrating quoting, environment, delta hedging,
// toxicity defense, risk gates, and telemetry
// ============================================================================
export class UnifiedMarlEngine {
  public readonly deltaTracker = new CrossVenueNetDeltaTracker();
  public readonly rebalanceTrigger: ToleranceBandRebalanceTrigger;
  public readonly hedgeDispatcher: AtomicCrossVenueHedgeDispatcher;
  public readonly unwindHandler: CompensatoryUnwindHandler;
  public readonly vpinCalc: VpinCalculator;
  public readonly kylesLambda: KylesLambdaEstimator;
  public readonly wideningCtrl: DynamicQuoteWideningController;
  public readonly tripwire: InstantCancellationTripwire;
  public readonly sweepDetector = new InformedSweepDetector();
  public readonly riskGuard: PreTradeQuotingRiskGuard;
  public readonly telemetry = new MarlPrometheusTelemetry();
  public readonly auditLogger: MarlHashChainedAuditLogger;

  private isRunning = false;
  private currentInventory = 0;
  private currentMid = 0.50;

  constructor(public readonly config: UnifiedMarlEngineConfig) {
    this.rebalanceTrigger = new ToleranceBandRebalanceTrigger(
      config.deltaHedgeConfig.deltaThreshold,
      config.deltaHedgeConfig.hysteresisRatio,
    );
    this.hedgeDispatcher = new AtomicCrossVenueHedgeDispatcher(config.deltaHedgeConfig);
    this.unwindHandler = new CompensatoryUnwindHandler(config.deltaHedgeConfig.maxUnwindRetries);
    this.vpinCalc = new VpinCalculator(
      config.adverseSelectionConfig.bucketVolumeUsd,
      config.adverseSelectionConfig.vpinWindowBuckets,
    );
    this.kylesLambda = new KylesLambdaEstimator(
      config.adverseSelectionConfig.kylesLambdaWindowTicks,
      config.adverseSelectionConfig.kylesLambdaBaseline,
    );
    this.wideningCtrl = new DynamicQuoteWideningController(
      config.adverseSelectionConfig.maxSpreadWideningMultiplier,
      config.adverseSelectionConfig.vpinWarningCdf,
    );
    this.tripwire = new InstantCancellationTripwire(
      config.adverseSelectionConfig.vpinTripwireCdf,
      config.adverseSelectionConfig.cooldownWindowMs,
    );
    this.riskGuard = new PreTradeQuotingRiskGuard(config.riskConfig);
    this.auditLogger = new MarlHashChainedAuditLogger(config.auditSecret ?? 'marl-secret');
  }

  public start(): void {
    this.isRunning = true;
  }

  public stop(): void {
    this.isRunning = false;
  }

  public getStatus(): { isRunning: boolean; inventory: number; netDelta: number } {
    const deltaSnap = this.deltaTracker.computeNetDelta(this.config.deltaHedgeConfig.deltaThreshold);
    return {
      isRunning: this.isRunning,
      inventory: this.currentInventory,
      netDelta: deltaSnap.netDelta,
    };
  }

  public generateQuote(
    midPrice: number,
    inventory: number,
    tauSec: number = 86_400,
  ): OptimalQuotesResult | null {
    if (!this.isRunning) return null;

    // Toxicity check
    const vpinCdf = this.vpinCalc.getCdf();
    const lambdaEst = this.kylesLambda.estimate();
    const lambdaRatio = lambdaEst.lambda / (this.config.adverseSelectionConfig.kylesLambdaBaseline ?? 0.0001);
    const sweep = this.sweepDetector.checkSweep(midPrice);

    const trip = this.tripwire.evaluate(vpinCdf, lambdaRatio, sweep.sweepDetected);
    if (trip.tripwireActive) {
      this.auditLogger.logAction('marl.tripwire.activated', { reason: trip.reason });
      this.telemetry.recordQuote('canceled', 'both');
      return null;
    }

    const multiplier = this.wideningCtrl.calculateMultiplier(vpinCdf, lambdaRatio);

    const baseResult = calculateOptimalQuotes({
      midPrice,
      inventory,
      gamma: this.config.asConfig.gamma,
      sigma: this.config.asConfig.sigma,
      timeToHorizonSec: tauSec,
      kappa: this.config.asConfig.kappa,
      tickSize: this.config.asConfig.tickSize,
      minSpread: this.config.asConfig.minSpread * multiplier,
      maxSpread: this.config.asConfig.maxSpread,
    });

    this.auditLogger.logAction('marl.quote.posted', {
      bid: baseResult.bidPrice,
      ask: baseResult.askPrice,
      multiplier,
    });
    this.telemetry.recordQuote('posted', 'both');

    return baseResult;
  }

  public onMakerFill(side: 'buy' | 'sell', amount: number, price: number): void {
    const deltaChange = side === 'buy' ? amount : -amount;
    this.currentInventory += deltaChange;

    this.deltaTracker.updatePosition({
      venue: 'polymarket',
      symbol: this.config.symbol,
      contracts: this.currentInventory,
      unitDelta: 1.0,
      netDelta: this.currentInventory,
      notionalUsd: Math.abs(this.currentInventory * price),
    });

    this.auditLogger.logAction('marl.fill.received', { side, amount, price });
    this.telemetry.recordFill(side, amount, price, 20);
  }
}
