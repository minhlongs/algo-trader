/**
 * Admin Qwen Runs Helper — query helpers for Router status and signals-loop runs journal.
 */

import type { Router } from 'express';
import {
  isQwenEnabled,
  isKillSwitchActive,
  getLastBreachAt,
} from '../../../desk/wiring/qwen-drawdown-monitor';
import { checkQwenEligibility } from '../../../desk/wiring/qwen-live-eligibility-gate';
import { query, type DbRow } from '../../../shared/db/postgres-client';

export interface SignalsLoopRunItem extends DbRow {
  id: string;
  source: string;
  ran_at: string;
  metrics: string;
  decision: string;
  trigger_reasons: string;
  error_message: string | null;
}

export async function fetchAdminQwenStatusData(): Promise<Record<string, unknown>> {
  const eligibility = await checkQwenEligibility();
  return {
    killActive: isKillSwitchActive(),
    swarmEnabled: isQwenEnabled(),
    liveEligible: process.env.QWEN_LIVE_ELIGIBLE === 'true',
    eligibility,
    lastBreachAt: getLastBreachAt(),
    drawdownThresholdPct: parseFloat(process.env.QWEN_DRAWDOWN_MAX_PCT ?? '5'),
    autoApproveMaxUsd: parseFloat(process.env.QWEN_AUTO_APPROVE_MAX_USD ?? '500'),
    timestamp: Date.now(),
  };
}

export async function fetchSignalsLoopRunsData(
  limit: number,
  decision?: string
): Promise<SignalsLoopRunItem[]> {
  let sql: string;
  let params: unknown[];

  if (decision) {
    sql = `SELECT id, source, ran_at, metrics, decision, trigger_reasons, error_message
    FROM qwen_signals_loop_runs
    WHERE decision = $1
    ORDER BY ran_at DESC
    LIMIT $2`;
    params = [decision, limit];
  } else {
    sql = `SELECT id, source, ran_at, metrics, decision, trigger_reasons, error_message
    FROM qwen_signals_loop_runs
    ORDER BY ran_at DESC
    LIMIT $1`;
    params = [limit];
  }

  const result = await query<SignalsLoopRunItem>(sql, params);
  return result.rows;
}
