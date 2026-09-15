/**
 * Fixtures and factory helpers for DnaEngine orchestrator test suites.
 */
import {
  DnaEngine,
  type CandleProvider,
} from '../orchestrator.js';
import { InMemoryStateStore } from '../dna-state-store.js';
import type { TfId, Candle } from '../multi-tf-types.js';

export function makeCandles(count = 50): Candle[] {
  const candles: Candle[] = [];
  let base = 100;
  const now = Math.floor(Date.now() / 1000);
  for (let i = count; i >= 0; i--) {
    base += (Math.random() - 0.48) * 2;
    candles.push({
      timestamp: now - i * 60,
      open: base,
      high: base + 1,
      low: base - 1,
      close: base + (Math.random() - 0.5) * 0.5,
      volume: 100 + Math.random() * 50,
    });
  }
  return candles;
}

export function makeProvider(tfMap: Partial<Record<TfId, Candle[]>> = {}): CandleProvider {
  const allTfs: TfId[] = ['1m', '5m', '15m', '1h', '4h', '1d'];
  const store = {} as Record<TfId, Candle[]>;
  for (const tf of allTfs) {
    store[tf] = tfMap[tf] ?? makeCandles();
  }
  return {
    getCandles: async (tf: TfId, _toTs: number, _count: number) => {
      return store[tf] ?? makeCandles();
    },
  };
}

export function makeEngine(provider?: CandleProvider, stateStore?: InMemoryStateStore): DnaEngine {
  return new DnaEngine(provider ?? makeProvider(), {}, stateStore ?? new InMemoryStateStore());
}
