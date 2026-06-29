/**
 * Sandbox output validator — reads and validates the Wasm compute() result.
 *
 * After compute() writes to linear memory, the host reads the output region,
 * validates size + schema, and rejects anything malformed or oversized.
 *
 * Memory layout — output region (matches .wat / .wasm):
 *   Byte 40-47 : f64 spread
 *   Byte 48-55 : f64 deviation
 *   Byte 56-63 : f64 newEma
 *   Byte 64-67 : i32 signal  (0=no signal, 1=signal)
 *   Byte 68-71 : i32 side    (0=yes-side, 1=no-side)
 *
 * Size guard: the output struct is fixed at 32 bytes; any future dynamic
 * output growth beyond MAX_OUTPUT_BYTES is rejected to prevent exfiltration
 * via size channel.
 */

import * as z from 'zod';

// ── Output schema ─────────────────────────────────────────────────────────────

const finiteNum = z.number().finite();

export const SandboxOutputSchema = z.object({
  spread:    finiteNum,
  deviation: finiteNum,
  newEma:    finiteNum.gte(0),
  signal:    z.union([z.literal(0), z.literal(1)]),
  side:      z.union([z.literal(0), z.literal(1)]),
});

export type SandboxOutput = z.infer<typeof SandboxOutputSchema>;

/** Human-readable alias for the side field */
export type SignalSide = 'yes' | 'no';

export function sideLabel(side: 0 | 1): SignalSide {
  return side === 0 ? 'yes' : 'no';
}

// ── Memory offsets ────────────────────────────────────────────────────────────

export const OUTPUT_OFFSETS = {
  spread:    40,
  deviation: 48,
  newEma:    56,
  signal:    64,
  side:      68,
} as const;

/** Fixed byte size of the output region */
export const OUTPUT_BYTE_LENGTH = 32; // 3×f64 + 2×i32

/**
 * Maximum permitted output size (bytes).
 * The kernel output is fixed-size (32 bytes), but we guard against
 * future variable-length extensions growing beyond this cap.
 */
export const MAX_OUTPUT_BYTES = 1_048_576; // 1 MB

// ── Errors ────────────────────────────────────────────────────────────────────

export class SandboxOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SandboxOutputError';
  }
}

// ── Reader ────────────────────────────────────────────────────────────────────

/**
 * Read and validate the output region from Wasm linear memory.
 * Throws `SandboxOutputError` if the buffer is too large or the values
 * fail schema validation.
 *
 * @param memBuf - The ArrayBuffer exposed by the Wasm Memory export
 */
export function decodeOutput(memBuf: ArrayBuffer): SandboxOutput {
  // Size guard — prevents exfiltration via outsized memory exports
  if (memBuf.byteLength > MAX_OUTPUT_BYTES) {
    throw new SandboxOutputError(
      `Sandbox output buffer (${memBuf.byteLength} bytes) exceeds limit (${MAX_OUTPUT_BYTES} bytes)`,
    );
  }

  if (memBuf.byteLength < OUTPUT_OFFSETS.side + 4) {
    throw new SandboxOutputError(
      `Sandbox memory too small to contain output region (${memBuf.byteLength} bytes)`,
    );
  }

  const view = new DataView(memBuf);

  const raw = {
    spread:    view.getFloat64(OUTPUT_OFFSETS.spread,    /* le */ true),
    deviation: view.getFloat64(OUTPUT_OFFSETS.deviation, true),
    newEma:    view.getFloat64(OUTPUT_OFFSETS.newEma,    true),
    signal:    view.getInt32(OUTPUT_OFFSETS.signal,      true) as 0 | 1,
    side:      view.getInt32(OUTPUT_OFFSETS.side,        true) as 0 | 1,
  };

  const parsed = SandboxOutputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new SandboxOutputError(
      `Sandbox output failed schema: ${parsed.error.issues.map(i => i.message).join('; ')}`,
    );
  }

  return parsed.data;
}
