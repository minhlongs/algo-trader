/**
 * Compression utilities for StrategyShard — gzip encode/decode using
 * Cloudflare Workers CompressionStream API.
 */

import { logger } from '../utils/logger';

/**
 * Compress string using gzip (Cloudflare Workers supported).
 * Falls back to base64 encoding without compression if CompressionStream unavailable.
 */
export async function compressData(data: string): Promise<string> {
  // Use native CompressionStream if available (gzip only)
  if (typeof CompressionStream !== 'undefined') {
    try {
      const cs = new CompressionStream('gzip');
      const writer = cs.writable.getWriter();
      const reader = cs.readable.getReader();
      const encoder = new TextEncoder();

      writer.write(encoder.encode(data));
      writer.close();

      const chunks: Uint8Array[] = [];
      let done = false;
      while (!done) {
        const { value, done: isDone } = await reader.read();
        if (value) chunks.push(value);
        done = isDone;
      }

      // Convert to base64 for storage
      const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
      const buffer = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        buffer.set(chunk, offset);
        offset += chunk.length;
      }

      return btoa(String.fromCharCode(...buffer));
    } catch (error) {
      logger.warn('[StrategyShard] Compression failed, using uncompressed:', error);
    }
  }

  // Fallback: return as base64 without compression
  return btoa(data);
}

/**
 * Decompress string from storage (gzip).
 * Falls back to decoding without decompression if DecompressionStream unavailable.
 */
export async function decompressData(compressedData: string): Promise<string> {
  try {
    const binary = atob(compressedData);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    if (typeof DecompressionStream !== 'undefined') {
      const ds = new DecompressionStream('gzip');
      const writer = ds.writable.getWriter();
      const reader = ds.readable.getReader();

      writer.write(bytes);
      writer.close();

      const chunks: Uint8Array[] = [];
      let done = false;
      while (!done) {
        const { value, done: isDone } = await reader.read();
        if (value) chunks.push(value);
        done = isDone;
      }

      const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
      const buffer = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        buffer.set(chunk, offset);
        offset += chunk.length;
      }

      return new TextDecoder().decode(buffer);
    }

    // Fallback: decode without decompression
    return new TextDecoder().decode(bytes);
  } catch (error) {
    logger.error('[StrategyShard] Decompression failed:', error);
    throw error;
  }
}
