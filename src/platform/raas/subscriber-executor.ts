/**
 * Subscriber Executor
 * Bridges Phase 01 (attestation/BYOK) + Phase 02 (Wasm sandbox) per tenant.
 * Records each execution result to trades table with subscriber_id + attestation_id.
 */

import { query } from '../../shared/db/postgres-client';
import { logger } from '../../shared/utils/logger';
import { buildTenantFilter } from './subscriber-tenant-isolator';
import { TenantCredentialsRepository } from '../../db/tenant-credentials-repository';

const credentialsRepo = new TenantCredentialsRepository();

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

interface TradeInsertRow extends Record<string, string | number | boolean | null | undefined> {
  id: string;
}

/** Minimal sandbox shim — replaced by Phase 02 runtime when available. */
async function invokeSandbox(
  subscriberId: string,
  strategyId: string,
  payload: Record<string, unknown>
): Promise<{ signal: 'BUY' | 'SELL' | 'HOLD'; confidence: number }> {
  // Phase 02 Wasm runtime integration point.
  // In production this calls WasmSandboxRuntime.execute({ subscriberId, strategyId, payload }).
  // Stub returns deterministic result based on payload hash to keep tests reproducible.
  const keys = Object.keys(payload).join('');
  const hash = keys.length + subscriberId.length + strategyId.length;
  const signals: Array<'BUY' | 'SELL' | 'HOLD'> = ['BUY', 'SELL', 'HOLD'];
  return { signal: signals[hash % 3], confidence: 0.7 };
}

/** Phase 01 DLP check shim — returns blocked=true for known bad patterns. */
function checkDlpPolicy(
  subscriberId: string,
  _payload: Record<string, unknown>
): boolean {
  // Blocked if subscriber is on the DLP deny-list (Phase 03 IronClaw integration).
  // Real implementation: IronClawDlpFilter.check(subscriberId, payload).
  return subscriberId.startsWith('blocked-');
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function generateAttestationId(subscriberId: string, strategyId: string): string {
  // Phase 01 citadel would sign this with BYOK key.
  // Stub: deterministic opaque string for audit trail.
  return `attest-${subscriberId.slice(0, 6)}-${strategyId.slice(0, 6)}-${Date.now()}`;
}

export class SubscriberExecutor {
  /**
   * Run strategy sandbox for subscriber and record result.
   * Enforces DLP policy check before any execution.
   */
  async execute(req: SubscriberExecRequest): Promise<SubscriberExecResult> {
    const { subscriberId, strategyId, marketPayload, capitalUsdt } = req;

    // Validate tenant filter is constructable (throws on empty subscriberId)
    buildTenantFilter(subscriberId, 1);
  // Verify credentials exist for this subscriber
  const creds = await credentialsRepo.get(subscriberId);
  if (!creds) {
    throw new Error("Credentials not found for subscriber: " + subscriberId);
  }


    const tradeId = generateId();
    const attestationId = generateAttestationId(subscriberId, strategyId);
    const executedAtMs = Date.now();

    // Phase 03 DLP gate
    const isDlpBlocked = checkDlpPolicy(subscriberId, marketPayload);
    if (isDlpBlocked) {
      await this.recordTrade({
        tradeId,
        subscriberId,
        attestationId,
        strategyId,
        signal: 'HOLD',
        profit: 0,
        status: 'DLP_BLOCKED',
        capitalUsdt,
        executedAtMs,
      });
      return {
        tradeId,
        subscriberId,
        attestationId,
        strategyId,
        signal: 'HOLD',
        profit: 0,
        status: 'DLP_BLOCKED',
        executedAtMs,
      };
    }

    // Phase 02 Wasm sandbox
    const { signal, confidence } = await invokeSandbox(subscriberId, strategyId, marketPayload);

    // Simplified P&L simulation: BUY/SELL signals generate profit based on confidence
    const profit = signal !== 'HOLD' ? parseFloat((capitalUsdt * confidence * 0.01).toFixed(8)) : 0;
    const status: SubscriberExecResult['status'] = signal !== 'HOLD' ? 'FILLED' : 'PENDING';

    await this.recordTrade({
      tradeId,
      subscriberId,
      attestationId,
      strategyId,
      signal,
      profit,
      status,
      capitalUsdt,
      executedAtMs,
    });

    return { tradeId, subscriberId, attestationId, strategyId, signal, profit, status, executedAtMs };
  }

  private async recordTrade(params: {
    tradeId: string;
    subscriberId: string;
    attestationId: string;
    strategyId: string;
    signal: string;
    profit: number;
    status: string;
    capitalUsdt: number;
    executedAtMs: number;
  }): Promise<void> {
    const sql = `
      INSERT INTO trades (
        id, subscriber_id, attestation_id, opportunity_id, execution_id,
        symbol, buy_exchange, sell_exchange,
        buy_price, sell_price, amount,
        spread_percent, profit, fee,
        status, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8,
        $9, $10, $11,
        $12, $13, $14,
        $15, $16, $17
      )
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        profit = EXCLUDED.profit,
        updated_at = EXCLUDED.updated_at
    `;

    await query(sql, [
      params.tradeId,
      params.subscriberId,
      params.attestationId,
      params.strategyId,       // opportunity_id = strategy for RaaS trades
      params.tradeId,           // execution_id same as trade id
      params.strategyId,        // symbol
      'raas',                   // buy_exchange
      'raas',                   // sell_exchange
      params.capitalUsdt,
      params.capitalUsdt,
      params.capitalUsdt,
      0,                        // spread_percent
      params.profit,
      0,                        // fee
      params.status,
      params.executedAtMs,
      params.executedAtMs,
    ]);
  }

  /**
   * Fetch recent executions for a subscriber (read-only audit view).
   */
  async getRecentExecutions(
    subscriberId: string,
    limit = 50
  ): Promise<TradeInsertRow[]> {
    const filter = buildTenantFilter(subscriberId, 2);
    const sql = `
      SELECT id FROM trades
      WHERE created_at >= $1
      ${filter.clause}
      ORDER BY created_at DESC
      LIMIT ${Math.min(limit, 500)}
    `;
    const result = await query(sql, [Date.now() - 30 * 86400000, filter.subscriberId]);
    return result.rows as TradeInsertRow[];
  }
}
