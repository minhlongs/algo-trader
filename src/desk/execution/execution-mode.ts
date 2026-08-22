/**
 * Execution Mode — single source of truth for how orders may flow.
 *
 * Three modes, one enum, one reader:
 *
 *   READ_ONLY  — default. No orders may be created or submitted. Research,
 *                backtesting, and MCP read tools run here.
 *   PAPER      — simulated fills only. Orders are recorded for metrics but
 *                never reach an exchange.
 *   LIVE       — real orders may reach the exchange. ONLY when the operator
 *                sets the env var `LIVE_TRADING_ENABLED=true` (literal string)
 *                AND the LiveExecutionGuard approves every order.
 *
 * The env gate is a literal-string comparison, matching the existing precedent
 * `SWARM_QWEN_ENABLED === 'true'` in signal-validator.ts. This is deliberate:
 * an empty string, `"1"`, `"yes"`, or `undefined` all resolve to READ_ONLY.
 *
 * The mode is read once at module load and cached. It is NOT re-read on every
 * call, so a runtime env mutation cannot silently flip the system into live
 * trading mid-flight. To change mode, restart the process.
 */

// ── Mode enum ─────────────────────────────────────────────────────────────────

export type ExecutionMode = 'READ_ONLY' | 'PAPER' | 'LIVE';

// ── Reader ────────────────────────────────────────────────────────────────────

let cachedMode: ExecutionMode | null = null;

/**
 * Resolve the current execution mode. Cached after first call — the mode is a
 * process-wide constant, not a per-request toggle.
 */
export function getExecutionMode(): ExecutionMode {
  if (cachedMode) return cachedMode;
  cachedMode = resolveExecutionMode();
  return cachedMode;
}

/** Force re-resolution (used by tests). */
export function resetExecutionModeCache(): void {
  cachedMode = null;
}

function resolveExecutionMode(): ExecutionMode {
  // LIVE requires the literal env string. Anything else → READ_ONLY.
  if (process.env.LIVE_TRADING_ENABLED === 'true') return 'LIVE';
  return 'READ_ONLY';
}

// ── Predicates ────────────────────────────────────────────────────────────────

/** True when real orders may reach the exchange. */
export function isLiveEnabled(): boolean {
  return getExecutionMode() === 'LIVE';
}

/** True when the system may create orders at all (paper or live). */
export function isTradingEnabled(): boolean {
  return getExecutionMode() !== 'READ_ONLY';
}

/** True in READ_ONLY — the safe default for research and tooling. */
export function isReadOnly(): boolean {
  return getExecutionMode() === 'READ_ONLY';
}

// ── Guard ─────────────────────────────────────────────────────────────────────

/**
 * Assert that the current mode permits the requested operation. Throws when the
 * mode forbids it. Callers use this at the top of any order-creating path so a
 * bypass cannot be hidden deeper in the call stack.
 */
export function requireTradingEnabled(operation: string): void {
  if (!isTradingEnabled()) {
    throw new Error(
      `Refused: ${operation} requires PAPER or LIVE mode, ` +
      `current mode is READ_ONLY. Set LIVE_TRADING_ENABLED=true to enable live trading.`,
    );
  }
}

/**
 * Assert that the current mode permits LIVE order submission. Stricter than
 * requireTradingEnabled: PAPER mode passes the former but fails this one.
 */
export function requireLiveEnabled(operation: string): void {
  if (!isLiveEnabled()) {
    throw new Error(
      `Refused: ${operation} requires LIVE mode. ` +
      `Current mode is ${getExecutionMode()} — set LIVE_TRADING_ENABLED=true to enable live trading.`,
    );
  }
}