/**
 * Sandbox input encoder — validates and serialises host data into Wasm linear memory.
 *
 * The host (TypeScript) owns all I/O: it fetches market snapshots, reads
 * subscriber config, then writes a tightly-scoped read-only view into the
 * first 40 bytes of the Wasm memory page before invoking `compute()`.
 *
 * Memory layout (matches spread-mean-reversion.wat / .wasm):
 *   Byte  0-7  : f64 yesPrice
 *   Byte  8-15 : f64 noPrice
 *   Byte 16-23 : f64 prevEma   (0.0 on first call → kernel seeds from spread)
 *   Byte 24-31 : f64 alpha
 *   Byte 32-39 : f64 threshold
 *
 * Validation via Zod ensures no NaN/Inf values leak into the sandbox.
 */

import * as z from 'zod';

// ── Input schema ─────────────────────────────────────────────────────────────

/** Finite-number refinement reused across fields */
const finiteNumber = z.number().finite();

export const SandboxInputSchema = z.object({
  /** Best-mid price of the YES token (0 < yesPrice < 1) */
  yesPrice: finiteNumber.gt(0).lt(1),
  /** Best-mid price of the NO token (0 < noPrice < 1) */
  noPrice: finiteNumber.gt(0).lt(1),
  /**
   * Previous EMA of the spread. Pass 0.0 on the first invocation;
   * the kernel seeds from the computed spread value in that case.
   */
  prevEma: finiteNumber.gte(0),
  /** EMA smoothing factor (0 < alpha < 1) */
  alpha: finiteNumber.gt(0).lt(1),
  /** Minimum |deviation| required to emit a signal (e.g. 0.02) */
  threshold: finiteNumber.gt(0),
});

export type SandboxInput = z.infer<typeof SandboxInputSchema>;

// ── Memory offsets (bytes) ────────────────────────────────────────────────────

export const INPUT_OFFSETS = {
  yesPrice:  0,
  noPrice:   8,
  prevEma:   16,
  alpha:     24,
  threshold: 32,
} as const;

/** Total byte length reserved for input region */
export const INPUT_BYTE_LENGTH = 40;

// ── Encoder ──────────────────────────────────────────────────────────────────

export class SandboxInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SandboxInputError';
  }
}

/**
 * Validate `raw` input and write it into the Wasm memory buffer.
 * Throws `SandboxInputError` on schema violation.
 *
 * @param raw      - Unvalidated input from host
 * @param memBuf   - The ArrayBuffer exposed by the Wasm Memory export
 */
export function encodeInput(raw: unknown, memBuf: ArrayBuffer): SandboxInput {
  const parsed = SandboxInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new SandboxInputError(
      `Invalid sandbox input: ${parsed.error.issues.map(i => i.message).join('; ')}`,
    );
  }

  const input = parsed.data;
  const view = new DataView(memBuf);

  // Write all inputs as little-endian f64 into linear memory
  view.setFloat64(INPUT_OFFSETS.yesPrice,  input.yesPrice,  /* littleEndian */ true);
  view.setFloat64(INPUT_OFFSETS.noPrice,   input.noPrice,   true);
  view.setFloat64(INPUT_OFFSETS.prevEma,   input.prevEma,   true);
  view.setFloat64(INPUT_OFFSETS.alpha,     input.alpha,     true);
  view.setFloat64(INPUT_OFFSETS.threshold, input.threshold, true);

  return input;
}
