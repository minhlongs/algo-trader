/**
 * DNA Orchestrator — multi-timeframe consensus engine
 */

import {
  TfId, TfSignal, RegimeSnapshot, ConsensusSignal,
  DnaLifecycleEvent, DnaLifecycleListener, DnaEngineConfig, DEFAULT_DNA_CONFIG,
} from './multi-tf-types';
import { buildTfSignal } from './tf-signal-builder';
import { DnaStateStore, DnaEngineState, InMemoryStateStore } from './dna-state-store';
import { runDnaConsensusStep } from './orchestrator-consensus';
import {
  emitDnaLifecycleEvent, onDnaEvent, emitDnaEvent,
  hydrateEngineState, buildEngineStateSnapshot, scheduleTfTimers, clearTfTimers,
} from './orchestrator-lifecycle';
import type { CandleProvider } from './orchestrator-types';
import { logger } from '../../utils/logger';
import { startDnaEngine, stopDnaEngine, resetDnaEngine, getDnaEngine } from './dna-singleton';

export type { CandleProvider, DnaLifecycleEvent, DnaLifecycleListener };
export {
  onDnaEvent, emitDnaEvent, startDnaEngine, stopDnaEngine, resetDnaEngine, getDnaEngine,
  hydrateEngineState, buildEngineStateSnapshot, scheduleTfTimers, clearTfTimers,
};

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
    const hydrated = hydrateEngineState(state, this._lastTfSignals);
    this._traceCounter = hydrated.traceCounter;
    if (hydrated.lastRegime) this._lastRegime = hydrated.lastRegime;
    if (hydrated.lastConsensus) this._lastConsensus = hydrated.lastConsensus;
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
    scheduleTfTimers(this._config.tfOrder, this._timers, (tf) => { void this.onTfTick(tf); });
    logger.info('[DNA] engine started', { tfs: this._config.tfOrder, paperMode: this._paperMode });
  }

  stop() {
    if (!this._running) return;
    this._running = false;
    const state = buildEngineStateSnapshot(
      this._traceCounter, this._lastTfSignals, this._lastRegime, this._lastConsensus,
    );
    this._stateStore.save(state).catch((err) => { logger.error('[DNA] state save failed', { err }); });
    clearTfTimers(this._timers);
    this._lastTfSignals.clear();
    this._lastConsensus = null;
    logger.info('[DNA] engine stopped');
  }

  getLastConsensus(): ConsensusSignal | null { return this._lastConsensus; }
  getLastTfSignal(tf: TfId): TfSignal | undefined { return this._lastTfSignals.get(tf); }
  get isRunning() { return this._running; }
}
