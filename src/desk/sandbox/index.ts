/**
 * Sandbox module barrel — public API surface for Wasm execution isolation.
 *
 * Host code imports from here; internal submodules are not part of the
 * public contract and may be refactored independently.
 */

export { createSandboxRunner } from './wasm-runtime-loader';
export { SPREAD_MEAN_REVERSION_WASM } from './kernels/spread-mean-reversion-wasm-bytes';
export type { SandboxRunner, SandboxCallParams, SandboxCallResult, KernelId, RuntimeLoaderOptions } from './wasm-runtime-loader';

export { createLimitedMemory, bytesToPages, maxBytesForPages } from './wasm-memory-limiter';
export type { LimitedMemory, MemoryLimiterOptions } from './wasm-memory-limiter';

export { withCpuLimit, measureSyncDuration, CpuTimeoutError } from './wasm-cpu-limiter';
export type { CpuLimiterOptions } from './wasm-cpu-limiter';

export { encodeInput, SandboxInputSchema, INPUT_OFFSETS, INPUT_BYTE_LENGTH, SandboxInputError } from './sandbox-input-encoder';
export type { SandboxInput } from './sandbox-input-encoder';

export { decodeOutput, SandboxOutputSchema, OUTPUT_OFFSETS, OUTPUT_BYTE_LENGTH, MAX_OUTPUT_BYTES, sideLabel, SandboxOutputError } from './sandbox-output-validator';
export type { SandboxOutput, SignalSide } from './sandbox-output-validator';

export { createInvocationTracer, consoleSink } from './sandbox-invocation-tracer';
export type { InvocationRecord, InvocationTracer, TraceSink, TracerOptions } from './sandbox-invocation-tracer';
