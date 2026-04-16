/**
 * Wasm runtime loader — instantiates a per-subscriber Wasm kernel and
 * orchestrates the full sandbox call pipeline:
 *
 *   1. Instantiate Wasm module with a memory-limited Memory object
 *   2. Encode validated input into linear memory
 *   3. Call compute() under CPU timeout guard
 *   4. Decode and validate output from linear memory
 *   5. Emit invocation audit trace
 *   6. Reset memory on every call (no cross-invocation state leakage)
 *
 * Runtime choice: native WebAssembly API (built-in to CF Workers, Node ≥18,
 * Bun, Deno). No external WASI runtime required for pure-compute kernels.
 * This keeps cold-start <100ms and avoids third-party binary deps.
 *
 * WASI network access is intentionally absent — the sandbox is compute-only.
 * The host (caller) fetches market data and executes orders.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createLimitedMemory } from './wasm-memory-limiter.js';
import { withCpuLimit } from './wasm-cpu-limiter.js';
import { encodeInput, type SandboxInput } from './sandbox-input-encoder.js';
import { decodeOutput, type SandboxOutput } from './sandbox-output-validator.js';
import { createInvocationTracer, type TraceSink } from './sandbox-invocation-tracer.js';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Memory cap: 64 MB = 1024 Wasm pages of 64 KB each */
const MAX_MEMORY_PAGES = 1_024;

/** CPU wall-clock budget per invocation */
const CPU_TIMEOUT_MS = 500;

// ── Kernel registry ───────────────────────────────────────────────────────────

/** Known kernel identifiers. Extend as strategies are ported. */
export type KernelId = 'spread-mean-reversion';

const KERNEL_FILENAMES: Record<KernelId, string> = {
  'spread-mean-reversion': 'spread-mean-reversion.wasm',
};

// ── Module cache (process-level, not per-subscriber) ─────────────────────────

const moduleCache = new Map<KernelId, WebAssembly.Module>();

/**
 * Load and compile a Wasm module by kernel ID.
 * Compilation is cached at process level; instantiation is per-call.
 */
async function loadModule(kernelId: KernelId): Promise<WebAssembly.Module> {
  const cached = moduleCache.get(kernelId);
  if (cached) return cached;

  const filename = KERNEL_FILENAMES[kernelId];
  const kernelDir = join(dirname(fileURLToPath(import.meta.url)), 'kernels');
  const wasmPath = join(kernelDir, filename);

  const bytes = readFileSync(wasmPath);
  const module = await WebAssembly.compile(bytes);
  moduleCache.set(kernelId, module);
  return module;
}

// ── Exported instance interface ───────────────────────────────────────────────

export interface WasmKernelInstance {
  /** The Wasm exports — typed to what the kernel actually exports */
  exports: {
    memory: WebAssembly.Memory;
    compute: () => void;
  };
}

// ── Loader options ────────────────────────────────────────────────────────────

export interface RuntimeLoaderOptions {
  /** Override max memory pages (default: 1024 = 64 MB) */
  maxMemoryPages?: number;
  /** Override CPU timeout (default: 500 ms) */
  cpuTimeoutMs?: number;
  /** Custom audit sink (default: consoleSink) */
  traceSink?: TraceSink;
}

// ── Main export ───────────────────────────────────────────────────────────────

export interface SandboxCallParams {
  subscriberId: string;
  kernelId: KernelId;
  input: unknown;
}

export interface SandboxCallResult {
  output: SandboxOutput;
  durationMs: number;
}

/**
 * Create a sandbox runner for a given kernel.
 * The returned `run()` function is safe to call concurrently across
 * subscribers — each call gets its own Wasm instance with fresh memory.
 */
export function createSandboxRunner(opts: RuntimeLoaderOptions = {}) {
  const maxMemoryPages = opts.maxMemoryPages ?? MAX_MEMORY_PAGES;
  const cpuTimeoutMs   = opts.cpuTimeoutMs   ?? CPU_TIMEOUT_MS;
  const tracer = createInvocationTracer({ sink: opts.traceSink });

  return {
    /**
     * Run a single sandbox invocation.
     * Validates input, executes kernel, validates output, emits audit trace.
     * Throws on input validation failure, CPU timeout, or output schema error.
     */
    async run(params: SandboxCallParams): Promise<SandboxCallResult> {
      const { subscriberId, kernelId, input } = params;

      // 1. Load compiled module (cached after first call)
      const mod = await loadModule(kernelId);

      // 2. Instantiate with a fresh, memory-limited memory per call
      const limitedMem = createLimitedMemory(
        { initial: 1, maximum: maxMemoryPages },
        { maxPages: maxMemoryPages },
      );

      const instance = await WebAssembly.instantiate(mod, {
        // No WASI imports — pure compute, no network/fs/env access
      }) as unknown as WasmKernelInstance;

      // Use the memory exported from the module (not the host-created one)
      // The kernel defines its own memory; we read/write through its export.
      const memBuf = (): ArrayBuffer => instance.exports.memory.buffer;

      // 3. Validate and encode input into Wasm linear memory
      const validated: SandboxInput = encodeInput(input, memBuf());

      // 4. Execute kernel under CPU timeout
      const start = performance.now();
      await withCpuLimit(() => instance.exports.compute(), { timeoutMs: cpuTimeoutMs });
      const durationMs = performance.now() - start;

      // 5. Decode and validate output from linear memory
      //    Re-read buffer ref after compute() (buffer can detach on memory.grow)
      const output = decodeOutput(memBuf());

      // 6. Emit audit trace (non-blocking best-effort)
      await tracer.trace({ subscriberId, strategyId: kernelId, input: validated, output, durationMs });

      return { output, durationMs };
    },
  };
}

export type SandboxRunner = ReturnType<typeof createSandboxRunner>;
