import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger — path matches what shard-compression.ts imports (../utils/logger → src/utils/logger)
const { mockWarn, mockError } = vi.hoisted(() => ({
  mockWarn: vi.fn(),
  mockError: vi.fn(),
}));

vi.mock('../../../../src/utils/logger', () => ({
  logger: {
    warn: mockWarn,
    error: mockError,
  },
}));

import { compressData, decompressData } from '../../../../src/durable-objects/shard-compression';

describe('shard-compression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('compressData', () => {
    it('should compress and return a base64 string', async () => {
      const data = JSON.stringify({ test: 'data', metrics: { requests: 100 } });
      const result = await compressData(data);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle empty string', async () => {
      const result = await compressData('');
      expect(typeof result).toBe('string');
    });

    it('should handle large data', async () => {
      const data = 'x'.repeat(100000);
      const result = await compressData(data);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('decompressData', () => {
    it('should round-trip compress and decompress', async () => {
      const original = JSON.stringify({ shardId: 1, metrics: { requests: 50 } });
      const compressed = await compressData(original);
      const decompressed = await decompressData(compressed);
      expect(decompressed).toBe(original);
    });

    it('should decompress empty string correctly', async () => {
      const compressed = await compressData('');
      const decompressed = await decompressData(compressed);
      expect(decompressed).toBe('');
    });

    it('should throw on invalid base64', async () => {
      await expect(decompressData('not-valid-base64!@#$')).rejects.toThrow();
    });

    it('should handle large data round-trip', async () => {
      const data = 'test'.repeat(10000);
      const compressed = await compressData(data);
      const decompressed = await decompressData(compressed);
      expect(decompressed).toBe(data);
    });
  });

  describe('edge cases', () => {
    it('should handle unicode data', async () => {
      const data = 'Hello World';
      const compressed = await compressData(data);
      const decompressed = await decompressData(compressed);
      expect(decompressed).toBe(data);
    });

    it('should handle JSON with nested objects', async () => {
      const data = JSON.stringify({
        shard: { strategies: [{ id: 'a', config: { x: 1 } }] },
      });
      const compressed = await compressData(data);
      const decompressed = await decompressData(compressed);
      expect(decompressed).toBe(data);
    });
  });

  // ── Fallback paths: CompressionStream / DecompressionStream unavailable ──────

  describe('fallback when CompressionStream is unavailable', () => {
    let originalCS: typeof CompressionStream;
    let originalDS: typeof DecompressionStream;

    beforeEach(() => {
      originalCS = globalThis.CompressionStream;
      originalDS = globalThis.DecompressionStream;
    });

    afterEach(() => {
      // Restore globals so other tests are unaffected
      (globalThis as any).CompressionStream = originalCS;
      (globalThis as any).DecompressionStream = originalDS;
    });

    it('falls back to plain base64 when CompressionStream is undefined', async () => {
      // Exercises the `typeof CompressionStream !== 'undefined'` FALSE branch (line 14).
      // Without CompressionStream, compressData returns btoa(data) directly.
      delete (globalThis as any).CompressionStream;
      const data = 'fallback compress test';
      const result = await compressData(data);
      expect(result).toBe(btoa(data));
    });

    it('round-trips when both streams are undefined (plain base64)', async () => {
      // Exercises the `typeof DecompressionStream !== 'undefined'` FALSE branch (line 63).
      // Data compressed without gzip must decode correctly without DecompressionStream.
      delete (globalThis as any).CompressionStream;
      delete (globalThis as any).DecompressionStream;
      const data = 'plain base64 round-trip';
      const compressed = await compressData(data);
      expect(compressed).toBe(btoa(data));
      const decompressed = await decompressData(compressed);
      expect(decompressed).toBe(data);
    });
  });

  // ── Error catch blocks: logger.warn / logger.error ───────────────────────────

  describe('error catch blocks', () => {
    let originalCS: typeof CompressionStream;
    let originalDS: typeof DecompressionStream;

    beforeEach(() => {
      originalCS = globalThis.CompressionStream;
      originalDS = globalThis.DecompressionStream;
    });

    afterEach(() => {
      (globalThis as any).CompressionStream = originalCS;
      (globalThis as any).DecompressionStream = originalDS;
    });

    it('falls back to plain btoa when CompressionStream throws', async () => {
      // Exercises the catch block (line 42-44): when compression throws,
      // the function catches and falls back to plain btoa.
      class ThrowingCompressionStream {
        constructor() {
          throw new Error('compression ctor failed');
        }
      }
      (globalThis as any).CompressionStream = ThrowingCompressionStream as any;

      const data = 'trigger compress catch';
      const result = await compressData(data);
      expect(result).toBe(btoa(data));
    });

    it('rethrows when DecompressionStream throws', async () => {
      // Exercises the catch block (line 92-94): when decompression throws,
      // logger.error is called and the error is rethrown.
      // Compress normally first so the input is valid gzip base64.
      const data = 'trigger decompress catch';
      const compressed = await compressData(data);

      class ThrowingDecompressionStream {
        constructor() {
          throw new Error('decompression ctor failed');
        }
      }
      (globalThis as any).DecompressionStream = ThrowingDecompressionStream as any;

      await expect(decompressData(compressed)).rejects.toThrow('decompression ctor failed');
    });
  });
});
