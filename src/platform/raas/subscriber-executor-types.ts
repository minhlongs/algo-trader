/**
 * Types and execution shims for Subscriber Executor.
 */

export interface SubscriberExecRequest {
  subscriberId: string;
  strategyId: string;
  /** Serialised market data payload passed to Wasm sandbox */
  marketPayload: Record<string, unknown>;
  /** Capital allocated for this execution in USDT */
  capitalUsdt: number;
}

export interface SubscriberExecResult {
  tradeId: string;
  subscriberId: string;
  attestationId: string;
  strategyId: string;
  signal: 'BUY' | 'SELL' | 'HOLD';
  profit: number;
  status: 'FILLED' | 'REJECTED' | 'DLP_BLOCKED' | 'PENDING';
  executedAtMs: number;
}

export interface TradeInsertRow extends Record<string, string | number | boolean | null | undefined> {
  id: string;
}

export interface RecordTradeParams {
  tradeId: string;
  subscriberId: string;
  attestationId: string;
  strategyId: string;
  signal: string;
  profit: number;
  status: string;
  capitalUsdt: number;
  executedAtMs: number;
}

/** Minimal sandbox shim — replaced by Phase 02 runtime when available. */
export async function invokeSandbox(
  subscriberId: string,
  strategyId: string,
  payload: Record<string, unknown>
): Promise<{ signal: 'BUY' | 'SELL' | 'HOLD'; confidence: number }> {
  const keys = Object.keys(payload).join('');
  const hash = keys.length + subscriberId.length + strategyId.length;
  const signals: Array<'BUY' | 'SELL' | 'HOLD'> = ['BUY', 'SELL', 'HOLD'];
  return { signal: signals[hash % 3], confidence: 0.7 };
}

/** Phase 01 DLP check shim — returns blocked=true for known bad patterns. */
export function checkDlpPolicy(
  subscriberId: string,
  _payload: Record<string, unknown>
): boolean {
  return subscriberId.startsWith('blocked-');
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function generateAttestationId(subscriberId: string, strategyId: string): string {
  return `attest-${subscriberId.slice(0, 6)}-${strategyId.slice(0, 6)}-${Date.now()}`;
}
