/**
 * Strategy 7 — 5-State Microstructure Liquidity Regime Machine.
 * Priority: HALTED > REDUCE_ONLY > EVENT > TRENDING > QUIET; EVENT steps down via TRENDING.
 */

import {
  DEFAULT_LIQUIDITY_REGIME_CONFIG, createCancelMarketOrdersTransport,
  type CancelMarketOrdersTransport, type LiquidityRegimeConfig, type LiquidityRegimeDecision,
  type LiquidityRegimeObservation, type LiquidityRegimeState, type LiquidityRegimeTelemetrySnapshot,
} from './liquidity-regime-types';

export { createCancelMarketOrdersTransport };

interface MarketMemory {
  lastState: LiquidityRegimeState;
  haltedUntilMs: number;
  eventCooldownUntilMs: number;
  mustStepDownViaTrending: boolean;
  ordersConfirmedCancelled: boolean;
  refPrices: Array<{ atMs: number; price: number }>;
  lastDecision?: LiquidityRegimeDecision;
}

export interface LiquidityRegimeMachineOptions {
  config?: Partial<LiquidityRegimeConfig>;
  cancelMarketOrders?: CancelMarketOrdersTransport;
}

const ONE_MINUTE_MS = 60_000;
const TEN_SECONDS_MS = 10_000;

export class LiquidityRegimeMachine {
  private readonly cfg: LiquidityRegimeConfig;
  private readonly cancelMarketOrders?: CancelMarketOrdersTransport;
  private readonly markets = new Map<string, MarketMemory>();
  private readonly apiErrorTimestamps: number[] = [];
  private systemHaltedUntilMs = 0;
  private transitionsCount = 0;

  constructor(options: LiquidityRegimeMachineOptions = {}) {
    this.cfg = { ...DEFAULT_LIQUIDITY_REGIME_CONFIG, ...(options.config ?? {}) };
    if (!Number.isFinite(this.cfg.eventCooldownMs) || this.cfg.eventCooldownMs <= 0) {
      throw new Error('LiquidityRegimeMachine: eventCooldownMs must be a positive finite number');
    }
    this.cancelMarketOrders = options.cancelMarketOrders;
  }

  recordApiError(nowMs: number): void {
    if (!Number.isFinite(nowMs)) return;
    this.pruneApiErrors(nowMs);
    this.apiErrorTimestamps.push(nowMs);
  }

  evaluate(obs: LiquidityRegimeObservation): LiquidityRegimeDecision {
    const nowMs = Number.isFinite(obs.nowMs) ? obs.nowMs : Date.now();
    const mem = this.memoryFor(obs.marketId);
    const prev = mem.lastState;
    const { jumpTicks, movePct } = this.measureRefMove(mem, obs, nowMs);

    const haltReasons = this.collectHaltReasons(obs, nowMs);
    if (haltReasons.length > 0) {
      const lockUntil = nowMs + this.cfg.haltLockDurationMs;
      mem.haltedUntilMs = Math.max(mem.haltedUntilMs, lockUntil);
      this.systemHaltedUntilMs = Math.max(this.systemHaltedUntilMs, lockUntil);
    }
    const activeHaltUntil = Math.max(mem.haltedUntilMs, this.systemHaltedUntilMs);
    if (haltReasons.length > 0 || nowMs < activeHaltUntil) {
      const r = haltReasons.length > 0 ? haltReasons : ['halt-lock-active'];
      return this.commit(obs.marketId, mem, prev, 'HALTED', r, nowMs, 0, 1, false, false, true, true, false, activeHaltUntil);
    }

    const reduceReasons: string[] = [];
    if (Math.abs(obs.normalizedInventoryQ ?? 0) >= this.cfg.reduceOnlyInventoryThreshold) reduceReasons.push('inventory-limit');
    if ((obs.timeToExpiryMs ?? Number.POSITIVE_INFINITY) <= this.cfg.reduceOnlyExpiryMs) reduceReasons.push('approaching-expiry');
    if (reduceReasons.length > 0) {
      const fullWithdraw = (obs.timeToExpiryMs ?? Number.POSITIVE_INFINITY) <= this.cfg.fullWithdrawExpiryMs;
      return this.commit(obs.marketId, mem, prev, 'REDUCE_ONLY', reduceReasons, nowMs, 0, 1, false, !fullWithdraw, fullWithdraw, true, false, 0);
    }

    const eventReasons = this.collectEventReasons(obs, jumpTicks, movePct);
    const trendingReasons = this.collectTrendingReasons(obs);
    if (eventReasons.length > 0) {
      mem.eventCooldownUntilMs = Math.max(mem.eventCooldownUntilMs, nowMs + this.cfg.eventCooldownMs);
      mem.mustStepDownViaTrending = true;
      return this.commit(obs.marketId, mem, prev, 'EVENT', eventReasons, nowMs, 0, 2, false, false, true, true, false, 0);
    }
    if (nowMs < mem.eventCooldownUntilMs) {
      if (trendingReasons.length > 0) mem.eventCooldownUntilMs = Math.max(mem.eventCooldownUntilMs, nowMs + this.cfg.eventCooldownMs);
      return this.commit(obs.marketId, mem, prev, 'EVENT', ['event-hysteresis-cooldown'], nowMs, 0, 2, false, false, true, true, false, 0);
    }
    if (trendingReasons.length > 0 || mem.mustStepDownViaTrending) {
      const r = trendingReasons.length > 0 ? trendingReasons : ['event-stepdown-to-trending'];
      mem.mustStepDownViaTrending = false;
      return this.commit(obs.marketId, mem, prev, 'TRENDING', r, nowMs, 0.5, 2.0, true, false, false, false, false, 0);
    }
    return this.commit(obs.marketId, mem, prev, 'QUIET', ['calm-microstructure'], nowMs, 1.0, 1.0, true, false, false, false, true, 0);
  }

  async evaluateAndEnforce(obs: LiquidityRegimeObservation): Promise<LiquidityRegimeDecision> {
    const d = this.evaluate(obs);
    const mem = this.memoryFor(obs.marketId);
    if (!d.cancelMarketOrders) { mem.ordersConfirmedCancelled = false; return d; }
    if (this.cancelMarketOrders && (d.transitioned || !mem.ordersConfirmedCancelled)) {
      try {
        const res = await this.cancelMarketOrders({ marketId: obs.marketId, reason: `${d.state}:${d.reasons.join(',')}`, requestedAtMs: d.evaluatedAtMs });
        mem.ordersConfirmedCancelled = res.ok;
        if (!res.ok) this.recordApiError(d.evaluatedAtMs);
      } catch {
        mem.ordersConfirmedCancelled = false;
        this.recordApiError(d.evaluatedAtMs);
      }
    }
    return d;
  }

  getDecision(marketId: string): LiquidityRegimeDecision | undefined { return this.markets.get(marketId)?.lastDecision; }

  getTelemetry(nowMs = Date.now()): LiquidityRegimeTelemetrySnapshot {
    this.pruneApiErrors(nowMs);
    const markets: Record<string, LiquidityRegimeDecision> = {};
    for (const [id, mem] of this.markets.entries()) if (mem.lastDecision) markets[id] = { ...mem.lastDecision, reasons: [...mem.lastDecision.reasons] };
    return { systemHaltedUntilMs: this.systemHaltedUntilMs, rollingApiErrorsLastMinute: this.apiErrorTimestamps.length, markets, transitionsCount: this.transitionsCount };
  }

  private collectHaltReasons(obs: LiquidityRegimeObservation, nowMs: number): string[] {
    this.pruneApiErrors(nowMs);
    const apiErrs = Math.max(obs.apiErrorsLastMinute ?? 0, this.apiErrorTimestamps.length);
    return [
      (obs.wsLagMs ?? 0) > this.cfg.maxWsLagMs ? 'ws-lag-exceeded' : '',
      obs.http425Active === true ? 'http-425-engine-restarting' : '',
      obs.ghostFillDetected === true ? 'ghost-fill-detected' : '',
      this.cfg.maxDailyLossPusd > 0 && (obs.dailyLossPusd ?? 0) >= this.cfg.maxDailyLossPusd ? 'daily-loss-cap' : '',
      apiErrs > this.cfg.maxApiErrorsPerMinute ? 'api-error-burst' : '',
      (obs.cancelAckP99Ms ?? 0) > this.cfg.maxCancelAckP99Ms ? 'cancel-ack-p99-exceeded' : '',
    ].filter(Boolean);
  }

  private collectEventReasons(obs: LiquidityRegimeObservation, jumpTicks: number, movePct: number): string[] {
    return [
      jumpTicks >= this.cfg.eventPriceJump10sTicks ? 'price-jump-10s-ticks' : '',
      Math.abs(movePct) >= this.cfg.eventRefPriceMove10sPct ? 'ref-price-move-10s-pct' : '',
      obs.inScheduledCatalystWindow === true ? 'scheduled-catalyst-window' : '',
    ].filter(Boolean);
  }

  private collectTrendingReasons(obs: LiquidityRegimeObservation): string[] {
    const base = obs.baselineKyleLambda ?? 0;
    return [
      (obs.vpin ?? 0) > this.cfg.vpinQ85Threshold ? 'vpin-above-q85' : '',
      (obs.fillsPerMinute ?? 0) > this.cfg.trendingFillsPerMinute ? 'fills-per-minute-high' : '',
      base > 0 && (obs.kyleLambda ?? 0) > this.cfg.trendingKyleLambdaMultiple * base ? 'kyle-lambda-elevated' : '',
    ].filter(Boolean);
  }

  private measureRefMove(mem: MarketMemory, obs: LiquidityRegimeObservation, nowMs: number) {
    let jumpTicks = obs.priceJump10sTicks ?? 0, movePct = obs.refPriceMove10sPct ?? 0;
    if (obs.referencePrice !== undefined && obs.referencePrice > 0) {
      mem.refPrices = mem.refPrices.filter((p) => nowMs - p.atMs <= TEN_SECONDS_MS);
      const anchor = mem.refPrices[0];
      if (anchor && anchor.price > 0) {
        const diff = Math.abs(obs.referencePrice - anchor.price);
        if ((obs.tickSize ?? 0) > 0) jumpTicks = Math.max(jumpTicks, diff / obs.tickSize!);
        movePct = Math.max(Math.abs(movePct), (diff / anchor.price) * 100);
      }
      mem.refPrices.push({ atMs: nowMs, price: obs.referencePrice });
    }
    return { jumpTicks, movePct };
  }

  private commit(
    marketId: string, mem: MarketMemory, previousState: LiquidityRegimeState, state: LiquidityRegimeState,
    reasons: string[], evaluatedAtMs: number, sizeMultiplier: number, spreadMultiplier: number,
    allowNewQuotes: boolean, allowCloseOrMergeOnly: boolean, withdrawAllQuotes: boolean,
    cancelMarketOrders: boolean, optimizeIncentiveSpread: boolean, haltedUntilMs: number,
  ): LiquidityRegimeDecision {
    if (previousState !== state) this.transitionsCount += 1;
    if (previousState !== state || (!(mem.lastDecision?.withdrawAllQuotes) && withdrawAllQuotes)) {
      mem.ordersConfirmedCancelled = false;
    }
    mem.lastState = state;
    const d: LiquidityRegimeDecision = {
      marketId, state, previousState, transitioned: previousState !== state, reasons, sizeMultiplier,
      spreadMultiplier, allowNewQuotes, allowCloseOrMergeOnly, withdrawAllQuotes, cancelMarketOrders,
      optimizeIncentiveSpread, haltedUntilMs, eventCooldownUntilMs: mem.eventCooldownUntilMs, evaluatedAtMs,
    };
    mem.lastDecision = d;
    return d;
  }

  private memoryFor(marketId: string): MarketMemory {
    const existing = this.markets.get(marketId);
    if (existing) return existing;
    const created: MarketMemory = { lastState: 'QUIET', haltedUntilMs: 0, eventCooldownUntilMs: 0, mustStepDownViaTrending: false, ordersConfirmedCancelled: false, refPrices: [] };
    this.markets.set(marketId, created);
    return created;
  }
  private pruneApiErrors(nowMs: number): void {
    while (this.apiErrorTimestamps.length > 0 && nowMs - this.apiErrorTimestamps[0]! > ONE_MINUTE_MS) this.apiErrorTimestamps.shift();
  }
}
