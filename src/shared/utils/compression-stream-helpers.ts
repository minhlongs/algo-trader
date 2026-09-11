/**
 * Compression Streaming Helpers — Buffer compression and decompression
 */

import { logger } from './logger';
import { recordCompressionRatio } from '../../shared/observability/prometheus-metrics';
import type { CompressionAlgorithm } from './compression-stream-types';

export async function compressStringData(
  data: string,
  algorithm: CompressionAlgorithm,
  createStreamFn: (alg: CompressionAlgorithm) => TransformStream<string, Uint8Array>
): Promise<Uint8Array> {
  if (algorithm === 'identity' || typeof CompressionStream === 'undefined') {
    return new TextEncoder().encode(data);
  }

  const originalSize = data.length;
  const stream = createStreamFn(algorithm);
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();

  writer.write(data);
  writer.close();

  const chunks: Uint8Array[] = [];
  let done = false;

  while (!done) {
    const { value, done: isDone } = await reader.read();
    if (value) chunks.push(value);
    done = isDone;
  }

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  if (originalSize > 0 && result.length > 0) {
    try {
      recordCompressionRatio(originalSize, result.length);
    } catch {
      // Ignore metric recording errors
    }
  }

  return result;
}

export async function decompressBufferData(
  buffer: Uint8Array,
  algorithm: CompressionAlgorithm
): Promise<string> {
  if (algorithm === 'identity') {
    return new TextDecoder().decode(buffer);
  }

  if (typeof DecompressionStream === 'undefined') {
    logger.warn('[Compression] DecompressionStream not available, returning as identity');
    return new TextDecoder().decode(buffer);
  }

  try {
    const ds = new DecompressionStream(algorithm as any);
    const writer = ds.writable.getWriter();
    const reader = ds.readable.getReader();

    writer.write(buffer as any);
    writer.close();

    const chunks: Uint8Array[] = [];
    let done = false;

    while (!done) {
      const { value, done: isDone } = await reader.read();
      if (value) chunks.push(value);
      done = isDone;
    }

    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return new TextDecoder().decode(result);
  } catch (error) {
    logger.error('[Compression] Decompression failed', error);
    throw error;
  }
}
