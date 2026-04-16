/**
 * Sandbox module barrel — public API surface for Wasm execution isolation.
 *
 * Host code imports from here; internal submodules are not part of the
 * public contract and may be refactored independently.
 */

export { createSandboxRunner } from './wasm-runtime-loader.js';
export type { SandboxRunner, SandboxCallParams, SandboxCallResult, KernelId, RuntimeLoaderOptions } from './wasm-runtime-loader.js';

export { createLimitedMemory, bytesToPages, maxBytesForPages } from './wasm-memory-limiter.js';
export type { LimitedMemory, MemoryLimiterOptions } from './wasm-memory-limiter.js';

export { withCpuLimit, measureSyncDuration, CpuTimeoutError } from './wasm-cpu-limiter.js';
export type { CpuLimiterOptions } from './wasm-cpu-limiter.js';

export { encodeInput, SandboxInputSchema, INPUT_OFFSETS, INPUT_BYTE_LENGTH, SandboxInputError } from './sandbox-input-encoder.js';
export type { SandboxInput } from './sandbox-input-encoder.js';

export { decodeOutput, SandboxOutputSchema, OUTPUT_OFFSETS, OUTPUT_BYTE_LENGTH, MAX_OUTPUT_BYTES, sideLabel, SandboxOutputError } from './sandbox-output-validator.js';
export type { SandboxOutput, SignalSide } from './sandbox-output-validator.js';

export { createInvocationTracer, consoleSink } from './sandbox-invocation-tracer.js';
export type { InvocationRecord, InvocationTracer, TraceSink, TracerOptions } from './sandbox-invocation-tracer.js';
