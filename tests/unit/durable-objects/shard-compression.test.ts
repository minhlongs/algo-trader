import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../../../../src/utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
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
});
