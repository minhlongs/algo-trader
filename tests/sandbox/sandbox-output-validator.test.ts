import { describe, it, expect } from 'vitest';
import {
  decodeOutput,
  SandboxOutputError,
  OUTPUT_OFFSETS,
  MAX_OUTPUT_BYTES,
  sideLabel,
} from '../../src/sandbox/sandbox-output-validator.js';

/** Build a DataView-backed ArrayBuffer with valid output values */
function makeOutputBuffer(overrides: Partial<{
  spread: number; deviation: number; newEma: number;
  signal: number; side: number;
}> = {}): ArrayBuffer {
  const buf = new ArrayBuffer(128);
  const view = new DataView(buf);
  view.setFloat64(OUTPUT_OFFSETS.spread,    overrides.spread    ?? 1.03, true);
  view.setFloat64(OUTPUT_OFFSETS.deviation, overrides.deviation ?? 0.03, true);
  view.setFloat64(OUTPUT_OFFSETS.newEma,    overrides.newEma    ?? 0.50, true);
  view.setInt32(OUTPUT_OFFSETS.signal,      overrides.signal    ?? 1,    true);
  view.setInt32(OUTPUT_OFFSETS.side,        overrides.side      ?? 1,    true);
  return buf;
}

describe('sandbox-output-validator', () => {
  it('decodes a valid output buffer', () => {
    const output = decodeOutput(makeOutputBuffer());
    expect(output.spread).toBeCloseTo(1.03);
    expect(output.deviation).toBeCloseTo(0.03);
    expect(output.newEma).toBeCloseTo(0.50);
    expect(output.signal).toBe(1);
    expect(output.side).toBe(1);
  });

  it('rejects buffer larger than MAX_OUTPUT_BYTES', () => {
    const buf = new ArrayBuffer(MAX_OUTPUT_BYTES + 1);
    expect(() => decodeOutput(buf)).toThrow(SandboxOutputError);
    expect(() => decodeOutput(buf)).toThrow(/exceeds limit/);
  });

  it('rejects buffer too small to contain output region', () => {
    const buf = new ArrayBuffer(10); // far too small
    expect(() => decodeOutput(buf)).toThrow(SandboxOutputError);
    expect(() => decodeOutput(buf)).toThrow(/too small/);
  });

  it('rejects NaN spread', () => {
    const buf = makeOutputBuffer({ spread: NaN });
    expect(() => decodeOutput(buf)).toThrow(SandboxOutputError);
  });

  it('rejects Infinity deviation', () => {
    const buf = makeOutputBuffer({ deviation: Infinity });
    expect(() => decodeOutput(buf)).toThrow(SandboxOutputError);
  });

  it('rejects negative newEma', () => {
    const buf = makeOutputBuffer({ newEma: -0.01 });
    expect(() => decodeOutput(buf)).toThrow(SandboxOutputError);
  });

  it('rejects invalid signal value (not 0 or 1)', () => {
    const buf = makeOutputBuffer({ signal: 2 });
    expect(() => decodeOutput(buf)).toThrow(SandboxOutputError);
  });

  it('rejects invalid side value (not 0 or 1)', () => {
    const buf = makeOutputBuffer({ side: 99 });
    expect(() => decodeOutput(buf)).toThrow(SandboxOutputError);
  });

  it('accepts signal=0 (no signal)', () => {
    const output = decodeOutput(makeOutputBuffer({ signal: 0 }));
    expect(output.signal).toBe(0);
  });

  it('accepts side=0 (yes-side)', () => {
    const output = decodeOutput(makeOutputBuffer({ side: 0 }));
    expect(output.side).toBe(0);
  });

  it('sideLabel maps 0→yes, 1→no', () => {
    expect(sideLabel(0)).toBe('yes');
    expect(sideLabel(1)).toBe('no');
  });
});
