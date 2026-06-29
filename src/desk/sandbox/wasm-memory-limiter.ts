/**
 * Wasm memory limiter — traps growth beyond configured page cap.
 *
 * WebAssembly.Memory grows in 64KB pages. We wrap the memory object
 * and intercept calls to `grow()`, rejecting any request that would
 * push total pages above the per-subscriber ceiling (default 64MB = 1024 pages).
 *
 * In CF Workers the runtime enforces its own 128MB hard cap;
 * this layer provides finer, per-invocation control.
 */

/** 64KB per Wasm page */
const WASM_PAGE_BYTES = 65_536;

/** Default cap: 64 MB */
const DEFAULT_MAX_PAGES = 1_024;

export interface MemoryLimiterOptions {
  /** Maximum pages allowed (default: 1024 = 64 MB) */
  maxPages?: number;
}

export interface LimitedMemory {
  /** The underlying WebAssembly.Memory instance */
  raw: WebAssembly.Memory;
  /**
   * Attempt to grow memory by `delta` pages.
   * Returns previous page count on success, -1 if capped or rejected.
   */
  grow(delta: number): number;
  /** Current page count */
  currentPages(): number;
  /** Byte capacity corresponding to currentPages */
  currentBytes(): number;
}

/**
 * Wrap a WebAssembly.Memory with a hard page cap.
 * Throws if the initial descriptor already exceeds maxPages.
 */
export function createLimitedMemory(
  descriptor: WebAssembly.MemoryDescriptor,
  opts: MemoryLimiterOptions = {},
): LimitedMemory {
  const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;

  if (descriptor.initial > maxPages) {
    throw new RangeError(
      `Memory initial pages (${descriptor.initial}) exceeds limit (${maxPages})`,
    );
  }

  // Clamp the maximum in the descriptor so the runtime also knows the ceiling
  const clampedDescriptor: WebAssembly.MemoryDescriptor = {
    ...descriptor,
    maximum: Math.min(descriptor.maximum ?? maxPages, maxPages),
  };

  const mem = new WebAssembly.Memory(clampedDescriptor);

  return {
    raw: mem,

    grow(delta: number): number {
      const current = mem.buffer.byteLength / WASM_PAGE_BYTES;
      if (delta <= 0) {
        // grow(0) is a valid no-op probe; allow it
        return current;
      }
      if (current + delta > maxPages) {
        // Trap: refuse growth that would exceed cap
        return -1;
      }
      return mem.grow(delta);
    },

    currentPages(): number {
      return mem.buffer.byteLength / WASM_PAGE_BYTES;
    },

    currentBytes(): number {
      return mem.buffer.byteLength;
    },
  };
}

/** Convenience: bytes → pages (ceiling) */
export function bytesToPages(bytes: number): number {
  return Math.ceil(bytes / WASM_PAGE_BYTES);
}

/** Maximum memory bytes for the given page cap */
export function maxBytesForPages(pages: number): number {
  return pages * WASM_PAGE_BYTES;
}
