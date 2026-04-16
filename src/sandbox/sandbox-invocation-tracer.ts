/**
 * Sandbox invocation tracer — emits an audit record for every sandbox call.
 *
 * Each record captures:
 *   - subscriber_id  (tenant isolation key)
 *   - strategy_id    (kernel name)
 *   - input_hash     (SHA-256 of encoded input for tamper-evidence)
 *   - output_hash    (SHA-256 of decoded output JSON)
 *   - duration_ms    (wall-clock execution time)
 *   - signal_emitted (whether the kernel produced a trade signal)
 *   - timestamp      (ISO-8601)
 *
 * The trace feeds the DB migration 011_sandbox_invocations and Phase 03 IronClaw.
 * In environments without SubtleCrypto (older Node), falls back to a
 * deterministic length-prefixed hex stub so tests remain hermetic.
 */

import type { SandboxInput } from './sandbox-input-encoder.js';
import type { SandboxOutput } from './sandbox-output-validator.js';

// ── Record type ───────────────────────────────────────────────────────────────

export interface InvocationRecord {
  subscriberId: string;
  strategyId: string;
  inputHash: string;
  outputHash: string;
  durationMs: number;
  signalEmitted: boolean;
  timestamp: string;
}

// ── Sink interface ────────────────────────────────────────────────────────────

/**
 * Pluggable sink — default writes to console; production swaps in DB writer.
 * Matches the column shape of 011_sandbox_invocations.sql.
 */
export interface TraceSink {
  write(record: InvocationRecord): Promise<void>;
}

/** Default sink: structured JSON to stdout (works in CF Workers + Node) */
export const consoleSink: TraceSink = {
  async write(record: InvocationRecord): Promise<void> {
    console.log(JSON.stringify({ audit: 'sandbox_invocation', ...record }));
  },
};

// ── Hashing ───────────────────────────────────────────────────────────────────

async function sha256hex(data: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = new TextEncoder().encode(data);
    const hashBuf = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hashBuf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback for environments without SubtleCrypto
  let h = 0;
  for (let i = 0; i < data.length; i++) {
    h = (Math.imul(31, h) + data.charCodeAt(i)) | 0;
  }
  return `stub-${(h >>> 0).toString(16).padStart(8, '0')}-len${data.length}`;
}

// ── Tracer ────────────────────────────────────────────────────────────────────

export interface TracerOptions {
  sink?: TraceSink;
}

export function createInvocationTracer(opts: TracerOptions = {}) {
  const sink = opts.sink ?? consoleSink;

  return {
    /**
     * Emit an audit record after a sandbox invocation completes.
     * Call this regardless of whether the invocation succeeded or errored.
     */
    async trace(params: {
      subscriberId: string;
      strategyId: string;
      input: SandboxInput;
      output: SandboxOutput | null;
      durationMs: number;
    }): Promise<InvocationRecord> {
      const inputJson  = JSON.stringify(params.input);
      const outputJson = params.output ? JSON.stringify(params.output) : 'null';

      const [inputHash, outputHash] = await Promise.all([
        sha256hex(inputJson),
        sha256hex(outputJson),
      ]);

      const record: InvocationRecord = {
        subscriberId:  params.subscriberId,
        strategyId:    params.strategyId,
        inputHash,
        outputHash,
        durationMs:    params.durationMs,
        signalEmitted: params.output?.signal === 1,
        timestamp:     new Date().toISOString(),
      };

      await sink.write(record);
      return record;
    },
  };
}

export type InvocationTracer = ReturnType<typeof createInvocationTracer>;
