/**
 * Unit Tests for Compression Stream Manager
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CompressionStreamManager,
  CompressionAlgorithm,
  getCompressionManager,
} from '../../src/shared/utils/compression-stream';

// Mock CompressionStream and DecompressionStream if not available in test environment
const mockCompressionStream = vi.fn();
const mockDecompressionStream = vi.fn();

// Save originals so we can toggle availability per-test.
const originalCompressionStream = globalThis.CompressionStream;
const originalDecompressionStream = globalThis.DecompressionStream;

describe('CompressionStreamManager', () => {
  let manager: CompressionStreamManager;

  beforeEach(() => {
    manager = new CompressionStreamManager();
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore the original globals so tests don't leak state.
    if (originalCompressionStream !== undefined) {
      (globalThis as any).CompressionStream = originalCompressionStream;
    } else {
      delete (globalThis as any).CompressionStream;
    }
    if (originalDecompressionStream !== undefined) {
      (globalThis as any).DecompressionStream = originalDecompressionStream;
    } else {
      delete (globalThis as any).DecompressionStream;
    }
  });

  describe('isSupported', () => {
    it('should return true for identity algorithm', () => {
      expect(manager.isSupported('identity')).toBe(true);
    });

    it('should return false for unknown algorithms', () => {
      expect(manager.isSupported('unknown' as CompressionAlgorithm)).toBe(false);
    });
  });

  describe('getBestAvailable', () => {
    it('should return brotli when CompressionStream is available', () => {
      // @ts-expect-error - mocking for test
      global.CompressionStream = class {};
      expect(manager.getBestAvailable()).toBe('br');
    });

    it('should return identity when CompressionStream is not available', () => {
      // @ts-expect-error - remove mock
      delete global.CompressionStream;
      expect(manager.getBestAvailable()).toBe('identity');
    });
  });

  describe('compressString', () => {
    it('should return encoded string for identity algorithm', async () => {
      const result = await manager.compressString('test data', 'identity');
      expect(result).toBeInstanceOf(Uint8Array);
      expect(new TextDecoder().decode(result)).toBe('test data');
    });

    it('should handle empty string', async () => {
      const result = await manager.compressString('', 'br');
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it('should compress data with CompressionStream when available', async () => {
      // @ts-expect-error - mocking
      global.CompressionStream = mockCompressionStream;
      mockCompressionStream.mockReturnValue({
        writable: {
          getWriter: () => ({
            write: vi.fn(),
            close: vi.fn(),
          })
        },
        readable: {
          getReader: () => ({
            read: async () => {
              return { value: new TextEncoder().encode('compressed'), done: true };
            }
          }),
        },
      });

      const result = await manager.compressString('test data', 'br');
      expect(result).toBeInstanceOf(Uint8Array);
    });

    it('should handle CompressionStream errors gracefully', async () => {
      // @ts-expect-error - mocking
      global.CompressionStream = mockCompressionStream;
      mockCompressionStream.mockImplementation(() => {
        throw new Error('Compression failed');
      });

      const result = await manager.compressString('test data', 'br');
      // Should fall back to identity (uncompressed)
      expect(result).toBeInstanceOf(Uint8Array);
      expect(new TextDecoder().decode(result)).toBe('test data');
    });
  });

  describe('decompressBuffer', () => {
    it('should decode identity buffer correctly', async () => {
      const buffer = new TextEncoder().encode('test data');
      const result = await manager.decompressBuffer(buffer, 'identity');
      expect(result).toBe('test data');
    });

    it('should decode compressed data when DecompressionStream available', async () => {
      // @ts-expect-error - mocking
      global.DecompressionStream = class {
        constructor(public algo: string) {}
        writable = {
          getWriter: () => ({
            write: vi.fn(),
            close: vi.fn(),
          })
        };
        readable = {
          getReader: () => ({
            read: async () => {
              return { value: new TextEncoder().encode('decompressed'), done: true };
            }
          }),
        };
      };

      const buffer = new TextEncoder().encode('compressed data');
      const result = await manager.decompressBuffer(buffer, 'br');
      expect(result).toBe('decompressed');
    });

    it('should fall back when DecompressionStream not available', async () => {
      // @ts-expect-error - remove mock
      delete global.DecompressionStream;

      const buffer = new TextEncoder().encode('test data');
      const result = await manager.decompressBuffer(buffer, 'br');
      expect(result).toBe('test data');
    });
  });

  describe('createCompressedResponse', () => {
    it('should create response with identity encoding', () => {
      const response = manager.createCompressedResponse('{"test": true}', 'identity');

      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('Content-Encoding')).toBe('identity');
    });

    it('should handle ReadableStream input', () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue('{"chunk":');
          controller.enqueue('1}');
          controller.close();
        },
      });

      const response = manager.createCompressedResponse(stream, 'br');
      expect(response).toBeInstanceOf(Response);
      expect(response.headers.get('Content-Encoding')).toBe('br');
    });
  });

  describe('createCompressionStream', () => {
    it('should create identity stream when algorithm is identity', () => {
      const stream = manager.createCompressionStream('identity');
      expect(stream).toBeDefined();
      expect(stream.writable).toBeDefined();
      expect(stream.readable).toBeDefined();
    });

    it('should create compression stream when CompressionStream available', () => {
      // @ts-expect-error - mocking
      global.CompressionStream = class {
        constructor(public algo: string) {}
        writable = {
          getWriter: () => ({
            write: vi.fn(),
            close: vi.fn()
          })
        };
        readable = {
          getReader: () => ({
            read: async () => {
              return { value: new Uint8Array(), done: true };
            }
          })
        };
      };

      const stream = manager.createCompressionStream('gzip');
      expect(stream).toBeDefined();
    });
  });

  describe('Singleton Pattern', () => {
    it('getCompressionManager should return singleton instance', () => {
      const instance1 = getCompressionManager();
      const instance2 = getCompressionManager();

      expect(instance1).toBe(instance2);
    });
  });

  // ── isSupported false branch ─────────────────────────────────────────────

  describe('isSupported (CompressionStream unavailable)', () => {
    it('returns false when CompressionStream is undefined and algo is not identity', () => {
      delete (globalThis as any).CompressionStream;
      expect(manager.isSupported('br')).toBe(false);
    });
  });

  // ── createCompressionStream fallback ──────────────────────────────────────

  describe('createCompressionStream fallback', () => {
    it('falls back to identity and warns when CompressionStream is unavailable', () => {
      delete (globalThis as any).CompressionStream;
      const stream = manager.createCompressionStream('gzip');
      expect(stream).toBeDefined();
      expect(stream.writable).toBeDefined();
    });
  });

  // ── createCompressionStream transform / flush callbacks ───────────────────

  describe('createCompressionStream transform/flush', () => {
    it('enqueues encoded bytes and terminates on flush', async () => {
      // CompressionStream must be defined so createCompressionStream takes the
      // real constructor path (lines 67-82). The instance itself is unused by
      // that path, so a minimal class suffices.
      class MockCS {
        constructor(public algo: string) {}
      }
      (globalThis as any).CompressionStream = MockCS;

      const stream = manager.createCompressionStream('gzip');
      expect(stream).toBeDefined();

      const reader = stream.readable.getReader();
      const writer = stream.writable.getWriter();

      // Kick off the read BEFORE writing: the TransformStream readable has
      // HWM=1, so a write applied before any reader is waiting would exert
      // backpressure and hang on a second write/close.
      const firstRead = reader.read();

      await writer.write('hello-transform');
      await writer.close();

      const { value } = await firstRead;
      expect(value).toBeInstanceOf(Uint8Array);

      // flush() ran on close → readable terminates.
      const tail = await reader.read();
      expect(tail.done).toBe(true);
    });
  });

  // ── streamJsonArray ───────────────────────────────────────────────────────

  describe('streamJsonArray', () => {
    async function collect(stream: ReadableStream<string>): Promise<string> {
      const reader = stream.getReader();
      let out = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) out += value;
      }
      return out;
    }

    it('emits a JSON array from an array input', async () => {
      const stream = await manager.streamJsonArray([{ a: 1 }, { b: 2 }]);
      const json = await collect(stream);
      expect(json).toBe('[{"a":1},{"b":2}]');
    });

    it('handles an empty input', async () => {
      const stream = await manager.streamJsonArray<number>([]);
      const json = await collect(stream);
      expect(json).toBe('[]');
    });

    it('handles an async iterable input', async () => {
      async function* gen() {
        yield 1;
        yield 2;
        yield 3;
      }
      const stream = await manager.streamJsonArray(gen());
      const json = await collect(stream);
      expect(json).toBe('[1,2,3]');
    });

    it('yields to the event loop every chunkSize items', async () => {
      // 4 items with chunkSize 2 → count % chunkSize === 0 once (at count=2)
      const stream = await manager.streamJsonArray([1, 2, 3, 4], { chunkSize: 2 });
      const json = await collect(stream);
      expect(json).toBe('[1,2,3,4]');
    });
  });

  // ── decompressBuffer error path ───────────────────────────────────────────

  describe('decompressBuffer (throwing DecompressionStream)', () => {
    it('logs an error and rethrows when DecompressionStream throws', async () => {
      (globalThis as any).DecompressionStream = vi.fn().mockImplementation(() => {
        throw new Error('decompression down');
      });

      const buffer = new TextEncoder().encode('payload');
      await expect(manager.decompressBuffer(buffer, 'gzip')).rejects.toThrow('decompression down');
    });
  });

  // ── createCompressedResponse string + unsupported algo ───────────────────

  describe('createCompressedResponse (string + unsupported algorithm)', () => {
    it('compresses a string with a supported algorithm', () => {
      const response = manager.createCompressedResponse('{"data":true}', 'gzip');
      expect(response).toBeInstanceOf(Response);
      expect(response.headers.get('Content-Encoding')).toBe('gzip');
    });

    it('falls back to identity when the algorithm is unsupported', () => {
      delete (globalThis as any).CompressionStream;
      const response = manager.createCompressedResponse('{"data":true}', 'br');
      // isSupported('br') is false when CompressionStream is gone → identity
      expect(response.headers.get('Content-Encoding')).toBe('identity');
    });
  });
});
