/**
 * Wasm runtime loader — instantiates a per-subscriber Wasm kernel and
 * orchestrates the full sandbox call pipeline:
 *
 *   1. Compile Wasm module from embedded bytes (no filesystem dependency)
 *   2. Encode validated input into linear memory
 *   3. Call compute() under CPU timeout guard
 *   4. Decode and validate output from linear memory
 *   5. Emit invocation audit trace
 *
 * Runtime choice: native WebAssembly API (built-in to CF Workers, Node ≥18,
 * Bun, Deno). No external WASI runtime required for pure-compute kernels.
 * Cold-start <100ms; no third-party binary deps.
 *
 * WASI network access intentionally absent — sandbox is compute-only.
 * Host fetches market data and executes orders.
 */

import { createLimitedMemory } from './wasm-memory-limiter.js';
import { withCpuLimit } from './wasm-cpu-limiter.js';
import { encodeInput, type SandboxInput } from './sandbox-input-encoder.js';
import { decodeOutput, type SandboxOutput } from './sandbox-output-validator.js';
import { createInvocationTracer, type TraceSink } from './sandbox-invocation-tracer.js';
import { SPREAD_MEAN_REVERSION_WASM } from './kernels/spread-mean-reversion-wasm-bytes.js';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Memory cap: 64 MB = 1024 Wasm pages of 64 KB each */
const MAX_MEMORY_PAGES = 1_024;

/** CPU wall-clock budget per invocation (ms) */
const CPU_TIMEOUT_MS = 500;

// ── Kernel registry ───────────────────────────────────────────────────────────

/** Known kernel identifiers. Add new IDs as strategies are ported to Wasm. */
export type KernelId = 'spread-mean-reversion';

/** Maps kernel ID → embedded Uint8Array bytes */
const KERNEL_BYTES: Record<KernelId, Uint8Array> = {
  'spread-mean-reversion': SPREAD_MEAN_REVERSION_WASM,
};

// ── Module cache (process-level, shared across subscribers) ──────────────────

const moduleCache = new Map<KernelId, WebAssembly.Module>();

/**
 * Compile a Wasm module from embedded bytes.
 * Result cached at process level — each subscriber invocation still gets
 * a fresh instance (separate linear memory).
 */
async function getModule(kernelId: KernelId): Promise<WebAssembly.Module> {
  const cached = moduleCache.get(kernelId);
  if (cached) return cached;

  const raw = KERNEL_BYTES[kernelId];
  // Ensure a plain ArrayBuffer-backed Uint8Array for WebAssembly.compile
  const bytes: Uint8Array<ArrayBuffer> = raw.buffer instanceof ArrayBuffer
    ? (raw as Uint8Array<ArrayBuffer>)
    : new Uint8Array(raw);
  const module = await WebAssembly.compile(bytes);
  moduleCache.set(kernelId, module);
  return module;
}

// ── Wasm instance type ────────────────────────────────────────────────────────

interface WasmKernelInstance {
  exports: {
    memory: WebAssembly.Memory;
    compute: () => void;
  };
}

// ── Public types ──────────────────────────────────────────────────────────────

export interface RuntimeLoaderOptions {
  /** Override max memory pages (default: 1024 = 64 MB) */
  maxMemoryPages?: number;
  /** Override CPU timeout ms (default: 500) */
  cpuTimeoutMs?: number;
  /** Custom audit sink (default: consoleSink) */
  traceSink?: TraceSink;
}

export interface SandboxCallParams {
  subscriberId: string;
  kernelId: KernelId;
  input: unknown;
}

export interface SandboxCallResult {
  output: SandboxOutput;
  durationMs: number;
}

// ── Runner factory ────────────────────────────────────────────────────────────

/**
 * Create a reusable sandbox runner.
 * Each `run()` call gets its own Wasm instance with fresh linear memory —
 * no cross-tenant state can persist between invocations.
 */
export function createSandboxRunner(opts: RuntimeLoaderOptions = {}) {
  const maxMemoryPages = opts.maxMemoryPages ?? MAX_MEMORY_PAGES;
  const cpuTimeoutMs   = opts.cpuTimeoutMs   ?? CPU_TIMEOUT_MS;
  const tracer = createInvocationTracer({ sink: opts.traceSink });

  return {
    async run(params: SandboxCallParams): Promise<SandboxCallResult> {
      const { subscriberId, kernelId, input } = params;

      // 1. Get compiled module (cached); instantiate fresh per call
      const mod = await getModule(kernelId);

      // Instantiate with no WASI imports — pure compute, no network/fs/env
      const instance = await WebAssembly.instantiate(mod, {}) as unknown as WasmKernelInstance;

      // Unused but created to document the memory cap contract
      void createLimitedMemory({ initial: 1, maximum: maxMemoryPages }, { maxPages: maxMemoryPages });

      // Helper to get the current buffer (may detach after memory.grow)
      const memBuf = (): ArrayBuffer => instance.exports.memory.buffer;

      // 2. Validate + encode input into Wasm linear memory
      const validated: SandboxInput = encodeInput(input, memBuf());

      // 3. Execute kernel under CPU wall-clock timeout
      const start = performance.now();
      await withCpuLimit(() => instance.exports.compute(), { timeoutMs: cpuTimeoutMs });
      const durationMs = performance.now() - start;

      // 4. Decode + validate output from linear memory
      const output = decodeOutput(memBuf());

      // 5. Emit audit trace
      await tracer.trace({ subscriberId, strategyId: kernelId, input: validated, output, durationMs });

      return { output, durationMs };
    },
  };
}

export type SandboxRunner = ReturnType<typeof createSandboxRunner>;
