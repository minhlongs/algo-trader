/**
 * DNA Orchestrator — multi-timeframe consensus engine
 */

import {
  TfId,
  TF_RESOLUTIONS,
  TfSignal,
  RegimeSnapshot,
  ConsensusSignal,
  DnaLifecycleEvent,
  DnaLifecycleListener,
  DnaEngineConfig,
  DEFAULT_DNA_CONFIG,
} from './multi-tf-types';
import { buildTfSignal } from './tf-signal-builder';
import { DnaStateStore, DnaEngineState, InMemoryStateStore } from './dna-state-store';
import { runDnaConsensusStep } from './orchestrator-consensus';
import { emitDnaLifecycleEvent, onDnaEvent, emitDnaEvent } from './orchestrator-lifecycle';
import type { CandleProvider } from './orchestrator-types';
import { logger } from '../../utils/logger';

export type { CandleProvider };
export type { DnaLifecycleEvent, DnaLifecycleListener };
export { onDnaEvent, emitDnaEvent };

let _engine: DnaEngine | null = null;

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
    emitDnaLifecycleEvent({ type: 'paper_mode_changed', enabled, at: Date.now() });
  }

  get paperMode() { return this._paperMode; }

  private async onTfTick(tf: TfId) {
    if (!this._running) return;
    if (this._lastConsensus !== null && tf === '1m') return;

    const traceId = `dna-${++this._traceCounter}`;
    const now = Date.now();
    emitDnaLifecycleEvent({ type: 'tick', tf, at: now });

    try {
      const candles = await this._provider.getCandles(tf, now, 200);
      if (candles.length === 0) {
        emitDnaLifecycleEvent({ type: 'error', err: new Error(`no candles for ${tf}`), context: 'onTfTick' });
        return;
      }
      emitDnaLifecycleEvent({ type: 'tf_ready', tf, candleCount: candles.length });

      const micro = this._provider.getOrderBookSnapshot
        ? await this._provider.getOrderBookSnapshot()
        : { bidVol: 0, askVol: 0 };

      const tfSignal = buildTfSignal(tf, candles, micro.bidVol, micro.askVol, now);
      this._lastTfSignals.set(tf, tfSignal);

      if (this._lastTfSignals.size >= this._config.minTfAgreement) {
        await this.runConsensus(traceId, now);
      }
    } catch (err) {
      emitDnaLifecycleEvent({ type: 'error', err: err as Error, context: `onTfTick:${tf}` });
      logger.error('[DNA] TF tick error', { tf, err, traceId });
    }
  }

  private async runConsensus(traceId: string, now: number) {
    const res = await runDnaConsensusStep({
      tfSignals: Array.from(this._lastTfSignals.values()),
      lastRegime: this._lastRegime,
      traceId,
      now,
      config: this._config,
      paperMode: this._paperMode,
    });
    this._lastRegime = res.regime;
    this._lastConsensus = res.consensus;
  }

  start() {
    if (this._running) return;
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
      const now = Date.now();
      const boundaryMs = intervalMs - (now % intervalMs);
      const initialDelay = tf === '1m' ? Math.min(boundaryMs, 5_000) : boundaryMs;
      const timer = setTimeout(() => {
        const recurring = setInterval(() => this.onTfTick(tf), intervalMs);
        this._timers.set(tf, recurring);
        this.onTfTick(tf);
      }, initialDelay);
      this._timers.set(tf, timer);
    }
    logger.info('[DNA] engine started', { tfs: this._config.tfOrder, paperMode: this._paperMode });
  }

  stop() {
    if (!this._running) return;
    this._running = false;
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
    for (const [, timer] of this._timers) {
      clearTimeout(timer);
      clearInterval(timer);
    }
    this._timers.clear();
    this._lastTfSignals.clear();
    this._lastConsensus = null;
    logger.info('[DNA] engine stopped');
  }

  getLastConsensus(): ConsensusSignal | null { return this._lastConsensus; }
  getLastTfSignal(tf: TfId): TfSignal | undefined { return this._lastTfSignals.get(tf); }
  get isRunning() { return this._running; }
}

export function startDnaEngine(
  provider?: CandleProvider,
  config?: Partial<DnaEngineConfig>,
  stateStore?: DnaStateStore,
): DnaEngine {
  if (_engine) _engine.stop();
  _engine = new DnaEngine(provider as CandleProvider, config, stateStore);
  _engine.start();
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
