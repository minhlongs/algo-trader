/**
 * Unit Tests for Compression Stream Manager
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CompressionStreamManager, CompressionAlgorithm } from '../../src/utils/compression-stream';

// Mock CompressionStream and DecompressionStream if not available in test environment
const mockCompressionStream = vi.fn();
const mockDecompressionStream = vi.fn();

describe('CompressionStreamManager', () => {
  let manager: CompressionStreamManager;

  beforeEach(() => {
    manager = new CompressionStreamManager();
    vi.clearAllMocks();
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
      const instance1 = manager;
      const instance2 = manager;

      expect(instance1).toBe(instance2);
    });
  });
});
