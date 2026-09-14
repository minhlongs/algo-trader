/**
 * Subscriber Executor
 * Bridges Phase 01 (attestation/BYOK) + Phase 02 (Wasm sandbox) per tenant.
 * Records each execution result to trades table with subscriber_id + attestation_id.
 */

import { query } from '../db/postgres-client';
import { buildTenantFilter } from './subscriber-tenant-isolator';
import {
  invokeSandbox,
  checkDlpPolicy,
  generateId,
  generateAttestationId,
  type SubscriberExecRequest,
  type SubscriberExecResult,
  type TradeInsertRow,
} from './subscriber-executor-types';

export type { SubscriberExecRequest, SubscriberExecResult, TradeInsertRow } from './subscriber-executor-types';
export { invokeSandbox, checkDlpPolicy, generateId, generateAttestationId } from './subscriber-executor-types';

export class SubscriberExecutor {
  /**
   * Run strategy sandbox for subscriber and record result.
   * Enforces DLP policy check before any execution.
   */
  async execute(req: SubscriberExecRequest): Promise<SubscriberExecResult> {
    const { subscriberId, strategyId, marketPayload, capitalUsdt } = req;

    // Validate tenant filter is constructable (throws on empty subscriberId)
    buildTenantFilter(subscriberId, 1);

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
        $6, $7, $8, $9, $10, $11,
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
      params.capitalUsdt,       // buy_price
      params.capitalUsdt,       // sell_price
      1,                        // amount
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
