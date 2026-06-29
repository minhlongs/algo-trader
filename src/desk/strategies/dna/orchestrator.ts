/**
 * DNA Orchestrator — multi-timeframe consensus engine
 *
 * Lifecycle:
 *   1. Schedule one tick per TF (e.g. 1m candle closes every 60s, 1h every 1h).
 *   2. On each TF tick, fetch candles → compute TimeframeIndicators → build TfSignal.
 *   3. After all active TFs have emitted (or on a 1-minute consolidated tick),
 *      compute RegimeSnapshot + ConsensusSignal.
 *   4. Persist DnaJournalEntry.
 *   5. Surface ConsensusSignal via lifecycle event (so a separate execution layer
 *      can act on it — paper trading, live order, etc.)
 *
 * Singleton pattern: startDnaEngine() / stopDnaEngine() / resetDnaEngine()
 * mirror qwen-signals-loop.ts convention.
 *
 * Cheetahclaws-DNA:
 *  - Legibility  : every tick produces TfSignal with human-readable reason;
 *                  every execution produces journal entry readable by a human.
 *  - Explicitness: tick schedule is explicit per-TF; policy gates are named
 *                  constants; paper/live split is an explicit mode flag.
 *  - Tractability: append-only journal with traceId; engine can be replayed by
 *                  re-running ticks with same candle input.
 */

import {
  TfId,
  TF_RESOLUTIONS,
  TimeframeIndicators,
  TfSignal,
  RegimeSnapshot,
  ConsensusSignal,
  JournalDecision,
  DnaLifecycleEvent,
  DnaLifecycleListener,
  DnaEngineConfig,
  DEFAULT_DNA_CONFIG,
} from './multi-tf-types';
import { buildTfSignal } from './tf-signal-builder';
import { detectRegime, isRegimeFresh } from './regime-detector';
import { DnaStateStore, DnaEngineState, InMemoryStateStore } from './dna-state-store';
import { computeConsensus } from './consensus-engine';
import { writeJournalEntry } from './journal-writer';
import { executePaperConsensus } from './paper-executor';
import { logger } from '../../../shared/utils/logger';

// ─── Type for candle provider (injected — explicitness: no hidden dependency) ─

export interface CandleProvider {
  /** Return candles up to `toTs` for the given TF. */
  getCandles(tf: TfId, toTs: number, count: number): Promise<TimeframeIndicators['candles']>;
  /** Optional: microstructure data for 1m / 5m. */
  getOrderBookSnapshot?(): Promise<{ bidVol: number; askVol: number }>;
}

// ─── Singleton state ─────────────────────────────────────────────────────────

let _engine: DnaEngine | null = null;
let _listeners: Set<DnaLifecycleListener> = new Set();

function emit(ev: DnaLifecycleEvent) {
  for (const fn of _listeners) {
  try { fn(ev); } catch (err) { logger.error('[DNA] listener error', { err }); }
  }
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export class DnaEngine {
  private _timers = new Map<TfId, NodeJS.Timeout>();
  private _provider: CandleProvider;
  private _config: DnaEngineConfig;
  private _paperMode = true;
  private _lastRegime: RegimeSnapshot | null = null;
  private _lastTfSignals = new Map<TfId, TfSignal>();
  private _lastConsensus: ConsensusSignal | null = null;
  private _stateStore: DnaStateStore;
  private _running = false;
  private _traceCounter = 0;

  /** Hydrate engine state from store — used by start() after load. */
  private _hydrate(state: DnaEngineState): void {
    this._traceCounter = state.schemaVersion ? state.traceCounter : 0;
    if (state.lastTfSignals) {
      for (const [tf, sig] of state.lastTfSignals as [TfId, TfSignal][]) {
        this._lastTfSignals.set(tf, sig);
      }
    }
    if (state.lastRegime) this._lastRegime = state.lastRegime;
    if (state.lastConsensus) this._lastConsensus = state.lastConsensus;
  }

  constructor(
    provider: CandleProvider,
    config?: Partial<DnaEngineConfig>,
    stateStore?: DnaStateStore,
  ) {
    this._provider = provider;
    this._config = { ...DEFAULT_DNA_CONFIG, ...config };
    this._stateStore = stateStore ?? new InMemoryStateStore();
  }

  setPaperMode(enabled: boolean) {
    this._paperMode = enabled;
    emit({ type: 'paper_mode_changed', enabled, at: Date.now() });
  }
  get paperMode() { return this._paperMode; }

  // ── Per-TF tick ─────────────────────────────────────────────────────────────

  private async onTfTick(tf: TfId) {
    if (!this._running) return;
  // After a hydration restart, skip the immediate on-start 1m tick.
  // The recurring interval will fire at the next boundary; re-entering
  // here would overwrite state before the store has anything useful.
  if (this._lastConsensus !== null && tf === '1m') {
    return;
  }
    const traceId = `dna-${++this._traceCounter}`;
    const now = Date.now();
    emit({ type: 'tick', tf, at: now });

    try {
      const candles = await this._provider.getCandles(tf, now, 200);
      if (candles.length === 0) {
        emit({ type: 'error', err: new Error(`no candles for ${tf}`), context: 'onTfTick' });
        return;
      }
      emit({ type: 'tf_ready', tf, candleCount: candles.length });

      const micro = this._provider.getOrderBookSnapshot
        ? await this._provider.getOrderBookSnapshot()
        : { bidVol: 0, askVol: 0 };

      const tfSignal = buildTfSignal(tf, candles, micro.bidVol, micro.askVol, now);
      this._lastTfSignals.set(tf, tfSignal);

      // If we have enough TFs, run consensus immediately.
      if (this._lastTfSignals.size >= this._config.minTfAgreement) {
        await this.runConsensus(traceId, now);
      }
    } catch (err) {
      emit({ type: 'error', err: err as Error, context: `onTfTick:${tf}` });
      logger.error('[DNA] TF tick error', { tf, err, traceId });
    }
  }

  // ── Consensus + journal ─────────────────────────────────────────────────────

  private async runConsensus(traceId: string, now: number) {
    const tfSignals = Array.from(this._lastTfSignals.values());
    if (tfSignals.length === 0) return;

    // Regime (cached, refreshed on 1h cadence)
    let regime = this._lastRegime;
    if (!regime || !isRegimeFresh(regime, now)) {
      const indicatorsByTf = new Map<TfId, TimeframeIndicators>();
      for (const s of tfSignals) {
      indicatorsByTf.set(s.tf, {
        tf: s.tf,
        candles: [],
        trend: s.indicatorSnap.trend,
        momentum: s.indicatorSnap.momentum,
        volatility: s.indicatorSnap.volatility,
        microstructure: { obi: null, vwap: null, deltaCandle: null },
        computedAt: s.emittedAt,
      });
      }
      regime = detectRegime(indicatorsByTf, now);
      this._lastRegime = regime;
    }

    const consensus = computeConsensus({
      tfSignals,
      regime,
      traceId,
      now,
      config: this._config,
    });

    this._lastConsensus = consensus;

    // Paper/live decision
    const decision: JournalDecision =
      consensus.action === 'hold'
        ? 'rejected_low_confidence'
        : this._paperMode
        ? 'paper_only'
        : 'executed';

    // Journal (tractability: append-only; write is best-effort)
    const candleTsRange = tfSignals.length > 0
      ? {
        from: Math.min(...tfSignals.map((s) => s.emittedAt)),
        to: Math.max(...tfSignals.map((s) => s.emittedAt)),
      }
      : null;
    writeJournalEntry({
      traceId: consensus.traceId,
      timestamp: now,
      action: consensus.action,
      decision,
      confidence: consensus.confidence,
      weightedBullScore: consensus.weightedBullScore,
      weightedBearScore: consensus.weightedBearScore,
      regime: regime.regime,
      tfSignalsJson: JSON.stringify(consensus.tfSignals),
      reason: consensus.reason,
      executedBy: this._paperMode ? 'paper' : consensus.action === 'hold' ? 'none' : 'live',
      paperMode: true,
 errorMessage: null,
      candleSnapshotTfs: tfSignals.map((s) => s.tf),
      candleTimestampRange: candleTsRange,
    });

    emit({ type: 'consensus_computed', signal: consensus });

    if (this._paperMode) {
      executePaperConsensus(consensus);
    }
    logger.info('[DNA] consensus', {
      traceId,
      action: consensus.action,
      confidence: consensus.confidence,
      regime: regime.regime,
      decision,
    });
  }

  // ── Scheduler ───────────────────────────────────────────────────────────────

  start() {
    if (this._running) return;
    // Persistence: load last state before scheduling ticks (tractability).
    this._stateStore.load().then((s) => {
      if (s) {
        this._hydrate(s);
        logger.info('[DNA] state hydrated from store', {
          tfs: [...this._lastTfSignals.keys()],
          hasRegime: !!this._lastRegime,
          hasConsensus: !!this._lastConsensus,
        });
      }
    }).catch((err) => {
      logger.warn('[DNA] state load failed, starting fresh', { err });
    });
    this._running = true;
    for (const tf of this._config.tfOrder) {
      const intervalMs = TF_RESOLUTIONS[tf];
      // Align to the next TF boundary so ticks fire on candle close, not at
      // arbitrary times within a candle.
      const now = Date.now();
      const boundaryMs = intervalMs - (now % intervalMs);
      const initialDelay = tf === '1m' ? Math.min(boundaryMs, 5_000) : boundaryMs;
      // Use recursive setTimeout instead of setInterval so fake timers work
      // reliably in tests (setInterval callbacks don't fire on advanceTimersByTime).
      const timer = setTimeout(() => this._scheduleRecurringTick(tf, intervalMs), initialDelay);
      this._timers.set(tf, timer);
    }
    logger.info('[DNA] engine started', { tfs: this._config.tfOrder, paperMode: this._paperMode });
  }

  private _scheduleRecurringTick(tf: TfId, intervalMs: number): void {
    if (!this._running) return;
    this.onTfTick(tf);
    const timer = setTimeout(() => this._scheduleRecurringTick(tf, intervalMs), intervalMs);
    this._timers.set(tf, timer);
  }

  stop() {
    if (!this._running) return;
    this._running = false;
    // Persist state before clearing timers (tractability: restart won't lose state).
    const tfArr: [TfId, TfSignal][] = [];
    for (const [k, v] of this._lastTfSignals) tfArr.push([k, v]);
    const state: DnaEngineState = {
      schemaVersion: '2026-06-01-v1',
      savedAt: Date.now(),
      traceCounter: this._traceCounter,
      lastTfSignals: tfArr,
      lastRegime: this._lastRegime,
      lastConsensus: this._lastConsensus,
    };
    this._stateStore.save(state).catch((err) => {
      logger.error('[DNA] state save failed', { err });
    });
    for (const [tf, timer] of this._timers) {
      clearTimeout(timer as any);
      clearInterval(timer as any);
    }
    this._timers.clear();
    this._lastTfSignals.clear();
    this._lastConsensus = null;
    logger.info('[DNA] engine stopped');
  }

  // ── State accessors (read-only — tractability) ──────────────────────────────

  getLastConsensus(): ConsensusSignal | null { return this._lastConsensus; }
  getLastTfSignal(tf: TfId): TfSignal | undefined { return this._lastTfSignals.get(tf); }
  get isRunning() { return this._running; }
}

// ─── Singleton API (matches qwen-signals-loop convention) ─────────────────────

export function startDnaEngine(provider?: CandleProvider, config?: Partial<DnaEngineConfig>, stateStore?: DnaStateStore): DnaEngine {
  if (_engine) {
  _engine.stop();
  }
  _engine = new DnaEngine(provider as CandleProvider, config, stateStore);
  _engine.start();
  // _listeners intentionally preserved across restarts (external lifecycle subscribers survive).
  return _engine;
}

export function stopDnaEngine(): void {
  if (_engine) {
  _engine.stop();
  _engine = null;
  }
}

export function resetDnaEngine(): void {
  stopDnaEngine();
}

export function getDnaEngine(): DnaEngine | null {
  return _engine;
}

export function onDnaEvent(fn: DnaLifecycleListener) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

/**
 * Emit a lifecycle event to all registered listeners (used by paper-executor).
 */
export function emitDnaEvent(ev: DnaLifecycleEvent): void {
  _listeners.forEach((fn) => fn(ev));
}
