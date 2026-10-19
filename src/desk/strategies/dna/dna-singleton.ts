/**
 * Singleton state management and lifecycle functions for DNA Engine.
 */

import { DnaEngine } from './orchestrator';
import type { CandleProvider } from './orchestrator-types';
import type { DnaEngineConfig } from './multi-tf-types';
import type { DnaStateStore } from './dna-state-store';

let _engine: DnaEngine | null = null;

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
