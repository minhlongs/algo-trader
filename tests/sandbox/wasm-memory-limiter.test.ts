import { describe, it, expect } from 'vitest';
import {
  createLimitedMemory,
  bytesToPages,
  maxBytesForPages,
} from '../../src/sandbox/wasm-memory-limiter.js';

describe('wasm-memory-limiter', () => {
  it('creates memory within page cap', () => {
    const mem = createLimitedMemory({ initial: 1 }, { maxPages: 4 });
    expect(mem.currentPages()).toBe(1);
    expect(mem.currentBytes()).toBe(65_536);
  });

  it('throws when initial pages exceed cap', () => {
    expect(() =>
      createLimitedMemory({ initial: 10 }, { maxPages: 4 }),
    ).toThrow(/exceeds limit/);
  });

  it('allows growth within cap and returns previous page count', () => {
    const mem = createLimitedMemory({ initial: 1 }, { maxPages: 4 });
    const prev = mem.grow(1);
    expect(prev).toBe(1);
    expect(mem.currentPages()).toBe(2);
  });

  it('rejects growth that would exceed cap, returns -1', () => {
    const mem = createLimitedMemory({ initial: 3 }, { maxPages: 4 });
    const result = mem.grow(2); // would reach 5, capped at 4
    expect(result).toBe(-1);
    expect(mem.currentPages()).toBe(3); // unchanged
  });

  it('allows grow(0) as a no-op probe', () => {
    const mem = createLimitedMemory({ initial: 2 }, { maxPages: 4 });
    const result = mem.grow(0);
    expect(result).toBe(2);
    expect(mem.currentPages()).toBe(2);
  });

  it('grow up to exact cap boundary succeeds', () => {
    const mem = createLimitedMemory({ initial: 2 }, { maxPages: 4 });
    const result = mem.grow(2);
    expect(result).toBe(2);
    expect(mem.currentPages()).toBe(4);
  });

  it('bytesToPages returns ceiling', () => {
    expect(bytesToPages(0)).toBe(0);
    expect(bytesToPages(1)).toBe(1);
    expect(bytesToPages(65_536)).toBe(1);
    expect(bytesToPages(65_537)).toBe(2);
  });

  it('maxBytesForPages is pages × 65536', () => {
    expect(maxBytesForPages(1)).toBe(65_536);
    expect(maxBytesForPages(1_024)).toBe(67_108_864); // 64 MB
  });
});
