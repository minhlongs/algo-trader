import { describe, it, expect, vi } from 'vitest';
import { createSandboxRunner } from '../../src/sandbox/wasm-runtime-loader.js';
import type { InvocationRecord } from '../../src/sandbox/sandbox-invocation-tracer.js';
import {
  calcSpread,
  calcSpreadDeviation,
  updateSpreadEma,
  isSpreadSignal,
  determineCheapSide,
} from '../../src/strategies/polymarket/spread-mean-reversion.js';

// ── Test sink that captures audit records ─────────────────────────────────────

function makeCaptureSink() {
  const records: InvocationRecord[] = [];
  return {
    sink: { async write(r: InvocationRecord) { records.push(r); } },
    records,
  };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_INPUT = {
  yesPrice:  0.55,
  noPrice:   0.48,
  prevEma:   0.0,
  alpha:     0.1,
  threshold: 0.02,
};

describe('wasm-runtime-loader — spread-mean-reversion kernel', () => {
  it('returns a valid output for a clear signal case', async () => {
    const { sink } = makeCaptureSink();
    const runner = createSandboxRunner({ traceSink: sink });
    const { output } = await runner.run({
      subscriberId: 'sub-001',
      kernelId:     'spread-mean-reversion',
      input:        BASE_INPUT,
    });

    // spread = 0.55 + 0.48 = 1.03
    expect(output.spread).toBeCloseTo(1.03, 10);
    // deviation = 1.03 - 1.0 = 0.03
    expect(output.deviation).toBeCloseTo(0.03, 10);
    // signal: |0.03| > 0.02 → 1
    expect(output.signal).toBe(1);
    // side: no-side cheaper (0.48 < 0.55) → 1
    expect(output.side).toBe(1);
  });

  it('matches TypeScript reference implementation within 1e-10 (zero drift)', async () => {
    const fixtures = [
      { yesPrice: 0.55, noPrice: 0.48, prevEma: 0.0,  alpha: 0.1, threshold: 0.02 },
      { yesPrice: 0.51, noPrice: 0.50, prevEma: 0.0,  alpha: 0.1, threshold: 0.02 },
      { yesPrice: 0.40, noPrice: 0.55, prevEma: 0.0,  alpha: 0.2, threshold: 0.03 },
      { yesPrice: 0.60, noPrice: 0.60, prevEma: 1.15, alpha: 0.1, threshold: 0.02 },
      { yesPrice: 0.10, noPrice: 0.88, prevEma: 0.95, alpha: 0.5, threshold: 0.01 },
    ];

    const { sink } = makeCaptureSink();
    const runner = createSandboxRunner({ traceSink: sink });

    for (const f of fixtures) {
      const { output } = await runner.run({
        subscriberId: 'sub-parity',
        kernelId:     'spread-mean-reversion',
        input:        f,
      });

      // TS reference
      const tsSpread    = calcSpread(f.yesPrice, f.noPrice);
      const tsDeviation = calcSpreadDeviation(tsSpread);
      const tsSide      = determineCheapSide(f.yesPrice, f.noPrice) === 'yes' ? 0 : 1;
      const tsSignal    = isSpreadSignal(tsDeviation, f.threshold) ? 1 : 0;
      // Kernel EMA: always applies alpha*spread + (1-alpha)*prevEma, even when prevEma=0.
      // TS updateSpreadEma(null, ...) returns spread directly (first-call seed).
      // We match kernel semantics: pass prevEma as-is (0.0 means prev=0, not null).
      const tsEma = f.prevEma === 0
        ? f.alpha * tsSpread                         // kernel: alpha*spread + (1-alpha)*0
        : updateSpreadEma(f.prevEma, tsSpread, f.alpha);

      expect(Math.abs(output.spread    - tsSpread)).toBeLessThan(1e-10);
      expect(Math.abs(output.deviation - tsDeviation)).toBeLessThan(1e-10);
      expect(Math.abs(output.newEma    - tsEma)).toBeLessThan(1e-10);
      expect(output.signal).toBe(tsSignal);
      expect(output.side).toBe(tsSide);
    }
  });

  it('emits an audit record per invocation', async () => {
    const { sink, records } = makeCaptureSink();
    const runner = createSandboxRunner({ traceSink: sink });

    await runner.run({ subscriberId: 'sub-audit', kernelId: 'spread-mean-reversion', input: BASE_INPUT });
    await runner.run({ subscriberId: 'sub-audit', kernelId: 'spread-mean-reversion', input: BASE_INPUT });

    expect(records).toHaveLength(2);
    for (const r of records) {
      expect(r.subscriberId).toBe('sub-audit');
      expect(r.strategyId).toBe('spread-mean-reversion');
      expect(r.inputHash).toBeTruthy();
      expect(r.outputHash).toBeTruthy();
      expect(r.durationMs).toBeGreaterThanOrEqual(0);
      expect(r.signalEmitted).toBe(true);
      expect(r.timestamp).toMatch(/^\d{4}-/);
    }
  });

  it('isolates state between invocations (no cross-tenant memory)', async () => {
    const runner = createSandboxRunner({ traceSink: { async write() {} } });

    const r1 = await runner.run({
      subscriberId: 'sub-A',
      kernelId:     'spread-mean-reversion',
      input: { yesPrice: 0.55, noPrice: 0.48, prevEma: 0.0, alpha: 0.1, threshold: 0.02 },
    });
    const r2 = await runner.run({
      subscriberId: 'sub-B',
      kernelId:     'spread-mean-reversion',
      input: { yesPrice: 0.40, noPrice: 0.40, prevEma: 0.0, alpha: 0.1, threshold: 0.02 },
    });

    // r1: spread=1.03, signal=1
    expect(r1.output.spread).toBeCloseTo(1.03, 10);
    expect(r1.output.signal).toBe(1);

    // r2: spread=0.80, dev=-0.20, signal=1 (|-0.20|>0.02), yes-side (equal → yes)
    expect(r2.output.spread).toBeCloseTo(0.80, 10);
    // Ensure r2 did NOT inherit r1's memory
    expect(r2.output.spread).not.toBeCloseTo(1.03, 2);
  });

  it('rejects invalid input before touching the kernel', async () => {
    const runner = createSandboxRunner({ traceSink: { async write() {} } });
    await expect(
      runner.run({
        subscriberId: 'sub-bad',
        kernelId:     'spread-mean-reversion',
        input:        { yesPrice: -1, noPrice: 0.5, prevEma: 0, alpha: 0.1, threshold: 0.02 },
      }),
    ).rejects.toThrow();
  });

  it('returns durationMs as a non-negative number', async () => {
    const runner = createSandboxRunner({ traceSink: { async write() {} } });
    const { durationMs } = await runner.run({
      subscriberId: 'sub-perf',
      kernelId:     'spread-mean-reversion',
      input:        BASE_INPUT,
    });
    expect(durationMs).toBeGreaterThanOrEqual(0);
    // Pure math kernel must be well under 500ms CPU cap
    expect(durationMs).toBeLessThan(500);
  });

  it('handles no-signal case (spread within threshold)', async () => {
    const runner = createSandboxRunner({ traceSink: { async write() {} } });
    const { output } = await runner.run({
      subscriberId: 'sub-nosig',
      kernelId:     'spread-mean-reversion',
      // yesPrice + noPrice = 1.01, deviation = 0.01, threshold = 0.02 → no signal
      input: { yesPrice: 0.51, noPrice: 0.50, prevEma: 0.0, alpha: 0.1, threshold: 0.02 },
    });
    expect(output.signal).toBe(0);
  });
});

// ── CPU timeout test ──────────────────────────────────────────────────────────

describe('wasm-cpu-limiter', () => {
  it('withCpuLimit resolves fast synchronous work normally', async () => {
    const { withCpuLimit } = await import('../../src/sandbox/wasm-cpu-limiter.js');
    const result = await withCpuLimit(() => 42, { timeoutMs: 200 });
    expect(result).toBe(42);
  });

  it('CpuTimeoutError is thrown on simulated slow work', async () => {
    const { withCpuLimit, CpuTimeoutError } = await import('../../src/sandbox/wasm-cpu-limiter.js');
    // Simulate slow async work that outlives the deadline
    await expect(
      withCpuLimit(
        () => new Promise<void>(resolve => setTimeout(resolve, 300)) as unknown as void,
        { timeoutMs: 50 },
      ),
    ).rejects.toBeInstanceOf(CpuTimeoutError);
  });
});

// ── Input encoder tests ───────────────────────────────────────────────────────

describe('sandbox-input-encoder', () => {
  it('encodes valid input into correct memory offsets', async () => {
    const { encodeInput, INPUT_OFFSETS } = await import('../../src/sandbox/sandbox-input-encoder.js');
    const buf = new ArrayBuffer(128);
    const input = { yesPrice: 0.6, noPrice: 0.45, prevEma: 1.0, alpha: 0.2, threshold: 0.05 };
    encodeInput(input, buf);
    const view = new DataView(buf);
    expect(view.getFloat64(INPUT_OFFSETS.yesPrice,  true)).toBeCloseTo(0.6);
    expect(view.getFloat64(INPUT_OFFSETS.noPrice,   true)).toBeCloseTo(0.45);
    expect(view.getFloat64(INPUT_OFFSETS.prevEma,   true)).toBeCloseTo(1.0);
    expect(view.getFloat64(INPUT_OFFSETS.alpha,     true)).toBeCloseTo(0.2);
    expect(view.getFloat64(INPUT_OFFSETS.threshold, true)).toBeCloseTo(0.05);
  });

  it('rejects yesPrice out of (0,1) range', async () => {
    const { encodeInput, SandboxInputError } = await import('../../src/sandbox/sandbox-input-encoder.js');
    const buf = new ArrayBuffer(128);
    expect(() =>
      encodeInput({ yesPrice: 1.5, noPrice: 0.5, prevEma: 0, alpha: 0.1, threshold: 0.02 }, buf),
    ).toThrow(SandboxInputError);
  });

  it('rejects NaN values', async () => {
    const { encodeInput, SandboxInputError } = await import('../../src/sandbox/sandbox-input-encoder.js');
    const buf = new ArrayBuffer(128);
    expect(() =>
      encodeInput({ yesPrice: NaN, noPrice: 0.5, prevEma: 0, alpha: 0.1, threshold: 0.02 }, buf),
    ).toThrow(SandboxInputError);
  });
});
