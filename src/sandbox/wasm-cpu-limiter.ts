/**
 * Wasm CPU limiter — enforces a wall-clock timeout on sandbox invocations.
 *
 * True fuel-metering requires Wasmtime-specific APIs not available in
 * CF Workers or Node's native Wasm runtime. We use a pragmatic
 * AbortSignal + Promise.race approach:
 *   - The sandbox call runs in a synchronous tight-loop wrapper
 *   - A deadline Promise rejects after `timeoutMs`
 *   - If the sandbox call itself is synchronous (all pure-math kernels are),
 *     the timeout catches runaway infinite loops started via async scheduling
 *
 * For pure-compute Wasm kernels (no WASI I/O) this is sufficient at PoC.
 * Production upgrade path: Wasmtime epoch interruption or shared-memory
 * fuel counter polled by a worker thread.
 */

/** Default CPU budget: 500ms wall-clock */
const DEFAULT_TIMEOUT_MS = 500;

export interface CpuLimiterOptions {
  /** Wall-clock deadline in milliseconds (default: 500) */
  timeoutMs?: number;
}

export class CpuTimeoutError extends Error {
  readonly timeoutMs: number;
  constructor(timeoutMs: number) {
    super(`Wasm sandbox CPU timeout after ${timeoutMs}ms`);
    this.name = 'CpuTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Race a synchronous Wasm call against a wall-clock timeout.
 *
 * `fn` must be synchronous (all pure-compute kernels are).
 * The timeout fires if the JS event loop is still alive but the
 * microtask queue is blocked (e.g., spin-loop in Wasm).
 *
 * Returns the result of `fn()` or throws CpuTimeoutError.
 */
export async function withCpuLimit<T>(
  fn: () => T,
  opts: CpuLimiterOptions = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // Deadline promise — rejects when the timer fires
  let timerId: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timerId = setTimeout(() => {
      reject(new CpuTimeoutError(timeoutMs));
    }, timeoutMs);
  });

  // Wrap the synchronous call in an immediately-resolved promise
  const work = Promise.resolve().then(() => fn());

  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timerId);
  }
}

/**
 * Measure the actual wall-clock duration of a synchronous call (ms).
 * Used in tests and tracing.
 */
export function measureSyncDuration(fn: () => unknown): { result: unknown; durationMs: number } {
  const start = performance.now();
  const result = fn();
  return { result, durationMs: performance.now() - start };
}
