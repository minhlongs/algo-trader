/**
 * Compression Streaming Utilities
 * Stream large responses with compression to reduce memory footprint
 *
 * Target: <5% compression overhead, transparent fallback for unsupported algos
 */

import { logger } from './logger';
import { CompressionAlgorithm, CompressionStreamOptions } from './compression-stream-types';
import { compressStringData, decompressBufferData } from './compression-stream-helpers';

export type { CompressionAlgorithm, CompressionStreamOptions };

/**
 * Compression Stream Manager
 * Creates transform streams for compressing/decompressing data
 */
export class CompressionStreamManager {
  private readonly SUPPORTED_ALGORITHMS: CompressionAlgorithm[] = ['gzip', 'br', 'deflate', 'identity'];

  /**
   * Check if algorithm is supported in current environment
   */
  isSupported(algorithm: CompressionAlgorithm): boolean {
    if (algorithm === 'identity') return true;
    if (typeof CompressionStream !== 'undefined') {
      return this.SUPPORTED_ALGORITHMS.includes(algorithm);
    }
    return false;
  }

  /**
   * Get best supported compression algorithm
   */
  getBestAvailable(): CompressionAlgorithm {
    if (typeof CompressionStream !== 'undefined') {
      // Prefer Brotli for text/JSON (best compression ratio)
      return 'br';
    }
    return 'identity';
  }

  /**
   * Create compression transform stream
   */
  createCompressionStream(algorithm: CompressionAlgorithm = 'br'): TransformStream<string, Uint8Array> {
    if (algorithm === 'identity') {
      return this.createIdentityStream();
    }

    if (typeof CompressionStream === 'undefined') {
      logger.warn('[Compression] CompressionStream not available, falling back to identity');
      return this.createIdentityStream();
    }

    try {
      const compressionStream = new CompressionStream(algorithm as any);
      const encoder = new TextEncoder();

      return new TransformStream({
        start(_controller) {
          // No-op
        },
        transform(chunk: string, controller) {
          const encoded = encoder.encode(chunk);
          controller.enqueue(encoded);
        },
        flush(controller) {
          controller.terminate();
        },
      });
    } catch (error) {
      logger.error('[Compression] Failed to create compression stream', error);
      return this.createIdentityStream();
    }
  }

  /**
   * Create identity (no-op) transform stream
   */
  private createIdentityStream(): TransformStream<string, Uint8Array> {
    const encoder = new TextEncoder();
    return new TransformStream({
      transform(chunk: string, controller) {
        controller.enqueue(encoder.encode(chunk));
      },
    });
  }

  /**
   * Stream JSON array without buffering entire response
   * Useful for large datasets (>1000 items)
   */
  async streamJsonArray<T>(
    items: AsyncIterable<T> | T[],
    options: { chunkSize?: number } = {}
  ): Promise<ReadableStream<string>> {
    const chunkSize = options.chunkSize || 100;

    return new ReadableStream({
      async start(controller) {
        controller.enqueue('[');

        let first = true;
        let count = 0;

        for await (const item of items) {
          if (!first) {
            controller.enqueue(',');
          }
          first = false;

          const json = JSON.stringify(item);
          controller.enqueue(json);
          count++;

          // Yield to event loop every chunkSize items
          if (count % chunkSize === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        }

        controller.enqueue(']');
        controller.close();
      },
    });
  }

  /**
   * Compress string data
   */
  async compressString(data: string, algorithm: CompressionAlgorithm = 'br'): Promise<Uint8Array> {
    return compressStringData(data, algorithm, (alg) => this.createCompressionStream(alg));
  }

  /**
   * Decompress Uint8Array to string
   */
  async decompressBuffer(
    buffer: Uint8Array,
    algorithm: CompressionAlgorithm
  ): Promise<string> {
    return decompressBufferData(buffer, algorithm);
  }

  /**
   * Create compressed response with appropriate headers
   */
  createCompressedResponse(
    data: string | ReadableStream<string>,
    algorithm: CompressionAlgorithm = 'br'
  ): Response {
    const effectiveAlgorithm = this.isSupported(algorithm) ? algorithm : 'identity';

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Content-Encoding': effectiveAlgorithm,
      'Cache-Control': 'no-cache',
    };

    if (data instanceof ReadableStream) {
      const compressed = data.pipeThrough(this.createCompressionStream(effectiveAlgorithm));
      return new Response(compressed, { headers });
    }

    // For string data, return uncompressed if identity
    if (effectiveAlgorithm === 'identity') {
      return new Response(data, { headers });
    }

    // Otherwise compress
    const compressed = this.createCompressionStream(effectiveAlgorithm);
    const writer = compressed.writable.getWriter();
    const encoder = new TextEncoder();
    writer.write(data);
    writer.close();

    return new Response(compressed.readable, { headers });
  }
}

// Singleton instance
let compressionManagerInstance: CompressionStreamManager | null = null;

export function getCompressionManager(): CompressionStreamManager {
  if (!compressionManagerInstance) {
    compressionManagerInstance = new CompressionStreamManager();
  }
  return compressionManagerInstance;
}
