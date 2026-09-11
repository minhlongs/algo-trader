/**
 * Compression Streaming Types
 */

// Compression algorithms supported
export type CompressionAlgorithm = 'gzip' | 'deflate' | 'br' | 'identity';

export interface CompressionStreamOptions {
  algorithm: CompressionAlgorithm;
  chunkSize?: number;
  flushOnFinish?: boolean;
}
