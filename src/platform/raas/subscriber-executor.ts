/**
 * Subscriber Executor
 * Bridges Phase 01 (attestation/BYOK) + Phase 02 (Wasm sandbox) per tenant.
 * Records each execution result to trades table with subscriber_id + attestation_id.
 */

import { buildTenantFilter } from './subscriber-tenant-isolator';
import { TenantCredentialsRepository } from '../db/tenant-credentials-repository';
import {
  type SubscriberExecRequest,
  type SubscriberExecResult,
  type TradeInsertRow,
  type RecordTradeParams,
  invokeSandbox,
  checkDlpPolicy,
  generateId,
  generateAttestationId,
} from './subscriber-executor-types';
import { recordTrade, fetchRecentExecutions } from './subscriber-executor-db';

export * from './subscriber-executor-types';
export * from './subscriber-executor-db';

export class SubscriberExecutor {
  /**
   * Run strategy sandbox for subscriber and record result.
   * Enforces DLP policy check before any execution.
   */
  async execute(req: SubscriberExecRequest): Promise<SubscriberExecResult> {
    const { subscriberId, strategyId, marketPayload, capitalUsdt } = req;

    // Validate tenant filter is constructable (throws on empty subscriberId)
    buildTenantFilter(subscriberId, 1);

    // Verify tenant credentials exist and are decodable
    const credentialsRepo = new TenantCredentialsRepository();
    const credentials = await credentialsRepo.get(subscriberId);
    if (!credentials) {
      throw new Error(`Credentials not found for subscriber: ${subscriberId}`);
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

  private async recordTrade(params: RecordTradeParams): Promise<void> {
    await recordTrade(params);
  }

  /**
   * Fetch recent executions for a subscriber (read-only audit view).
   */
  async getRecentExecutions(
    subscriberId: string,
    limit = 50
  ): Promise<TradeInsertRow[]> {
    return fetchRecentExecutions(subscriberId, limit);
  }
}
