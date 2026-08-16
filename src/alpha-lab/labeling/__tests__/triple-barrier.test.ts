/**
 * Triple-Barrier Labeling Tests
 *
 * Causal correctness: only future bars are used; entry bar itself is excluded.
 */

import { describe, it, expect } from 'vitest';
import { tripleBarrierLabel, batchLabel, type TripleBarrierResult } from '../triple-barrier';

function makeCandles(values: Array<{ high: number; low: number; close: number }>) {
  return values.map((v, i) => ({
    ...v,
    timestamp: new Date(Date.UTC(2025, 0, i + 1)).toISOString(),
  }));
}

describe('TripleBarrier', () => {
  describe('tripleBarrierLabel', () => {
    const candles = makeCandles([
      { high: 102, low: 98, close: 100 },
      { high: 103, low: 99, close: 101 },
      { high: 104, low: 100, close: 102 },
      { high: 105, low: 101, close: 103 },
      { high: 106, low: 102, close: 104 },
      { high: 107, low: 103, close: 105 },
      { high: 108, low: 104, close: 106 },
    ]);

    it('returns +1 when TP is hit first', () => {
      const entryIdx = 0;
      const entryPrice = candles[entryIdx]!.close;
      const tp = 0.05;
      const sl = 0.05;
      const maxHolding = 10;
      // bar 2: high=104 => close * 1.05 = 105; no. bar 3: high=105 => hit.
      const result = tripleBarrierLabel(candles, entryIdx, tp, sl, maxHolding);
      expect(result.label).toBe(1);
    });

    it('returns -1 when SL is hit first', () => {
      const down = makeCandles([
        { high: 102, low: 98, close: 100 },
        { high: 101, low: 97, close: 99 },
        { high: 100, low: 92, close: 94 },
      ]);
      const entryIdx = 0;
      const result = tripleBarrierLabel(down, entryIdx, 0.05, 0.01, 10);
      expect(result.label).toBe(-1);
    });

    it('returns 0 on timeout', () => {
      const flat = makeCandles([
        { high: 101, low: 99, close: 100 },
        { high: 101, low: 99, close: 100 },
        { high: 101, low: 99, close: 100 },
        { high: 101, low: 99, close: 100 },
      ]);
      const result = tripleBarrierLabel(flat, 0, 0.02, 0.02, 2);
      expect(result.label).toBe(0);
    });

    it('returns -1 on simultaneous TP and SL (SL wins)', () => {
      const bar = { high: 107, low: 93, close: 100 };
      const candles2 = makeCandles([
        { high: 102, low: 98, close: 100 },
        bar,
      ]);
      const result = tripleBarrierLabel(candles2, 0, 0.07, 0.07, 2);
      expect(result.label).toBe(-1);
    });

    it('throws on invalid tp/sl/maxHolding', () => {
      expect(() => tripleBarrierLabel(candles, 0, -1, 0.01, 2)).toThrow();
      expect(() => tripleBarrierLabel(candles, 0, 0.02, 0, 2)).toThrow();
      expect(() => tripleBarrierLabel(candles, 0, 0.02, 0.01, 0)).toThrow();
    });

    it('uses only future bars (causal)', () => {
      const c = makeCandles([
        { high: 102, low: 98, close: 100 },
        { high: 103, low: 99, close: 101 },
        { high: 104, low: 100, close: 102 },
      ]);
      const a = tripleBarrierLabel(c, 0, 0.02, 0.02, 2);
      // Clone input, mutate future bar (should not affect label if maxHolding is short).
      const mutated = [...c];
      mutated[2] = { ...mutated[2]!, high: 999, low: 1, close: 2000 };
      const b = tripleBarrierLabel(mutated, 0, 0.02, 0.02, 2);
      expect(a.label).toBe(b.label);
    });
  });

  describe('batchLabel', () => {
    it('labels all valid entries', () => {
      const candles = makeCandles([
        { high: 102, low: 98, close: 100 },
        { high: 103, low: 99, close: 101 },
        { high: 104, low: 100, close: 102 },
        { high: 105, low: 101, close: 103 },
        { high: 106, low: 102, close: 104 },
      ]);
      const out = batchLabel(candles, 0.05, 0.05, 2);
      expect(out.length).toBeGreaterThanOrEqual(1);
      for (const r of out) {
        expect([1, -1, 0]).toContain(r.label);
        expect(typeof r.entryIdx).toBe('number');
      }
    });
  });
});