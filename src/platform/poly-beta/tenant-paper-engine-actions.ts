/**
 * POLY-G5 Public Beta — `TenantPaperEngine` Durable Object Step & Order Actions.
 */

import {
  isApprovedPaperStrategyId,
  type EngineLifecycleState,
  type PolyBetaEnv,
} from './poly-beta-types';
import { fetchSupportedBetaMarkets } from './poly-beta-markets';
import {
  buildExecutionLogStatement,
  runAtomicBatch,
  type PortfolioRow,
} from './poly-beta-ledger';
import { executeSerializedPaperOrder } from './poly-beta-execution';

export interface DoStorageLike {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  deleteAll(): Promise<void>;
  setAlarm(scheduledTime: number | Date): Promise<void>;
  deleteAlarm(): Promise<void>;
}

export interface DoStateLike {
  storage: DoStorageLike;
}

export async function runEngineStrategyStep(
  storage: DoStorageLike,
  env: PolyBetaEnv,
  tenantId: string,
  nowMs: number,
): Promise<boolean> {
  const pf = await env.POLY_BETA_DB.prepare(`SELECT * FROM beta_portfolios WHERE tenant_id = ?`)
    .bind(tenantId)
    .first<PortfolioRow>();
  if (!pf || pf.engine_state === 'HALTED') return false;

  if (!isApprovedPaperStrategyId(pf.selected_strategy_id)) {
    await runAtomicBatch(env.POLY_BETA_DB, [
      env.POLY_BETA_DB.prepare(
        `UPDATE beta_portfolios SET engine_state = 'PAUSED', updated_at_ms = ? WHERE tenant_id = ? AND engine_state != 'HALTED'`,
      ).bind(nowMs, tenantId),
      buildExecutionLogStatement(
        env.POLY_BETA_DB,
        tenantId,
        'RISK_BLOCK',
        'UNSUPPORTED_STRATEGY_BLOCKED',
        `Unsupported persisted strategy: ${String(pf.selected_strategy_id)}`,
        nowMs,
      ),
    ]);
    return false;
  }

  const feed = await fetchSupportedBetaMarkets(env, { nowMs });
  if (!feed.feedHealthy || feed.markets.length === 0) {
    await runAtomicBatch(env.POLY_BETA_DB, [
      env.POLY_BETA_DB.prepare(
        `UPDATE beta_portfolios SET engine_state = 'HALTED', halt_reason = ?, updated_at_ms = ? WHERE tenant_id = ?`,
      ).bind(feed.staleReason ?? 'FEED_UNHEALTHY', nowMs, tenantId),
      buildExecutionLogStatement(
        env.POLY_BETA_DB,
        tenantId,
        'HALT',
        'FEED_UNHEALTHY',
        feed.staleReason ?? 'Market feed failed closed',
        nowMs,
      ),
    ]);
    return false;
  }

  const target =
    feed.markets.find((m) => m.marketId === pf.selected_market_id) ??
    feed.markets.find((m) => m.bestAsk >= 0.12 && m.bestAsk <= 0.85) ??
    feed.markets[0]!;
  const maxAffordableShares = Math.max(
    5,
    Math.min(8, Math.floor(4.8 / Math.max(0.05, target.bestAsk))),
  );
  const stepSeq = (await storage.get<number>('stepSeq')) ?? 0;
  await storage.put('stepSeq', stepSeq + 1);

  const result = await executeSerializedPaperOrder(env.POLY_BETA_DB, {
    tenantId,
    idempotencyKey: `auto-step-${stepSeq + 1}`,
    strategyId: pf.selected_strategy_id,
    market: target,
    outcome: 'YES',
    side: 'BUY',
    sizeShares: maxAffordableShares,
    nowMs,
  });
  // Stop the alarm chain when the step could not place an order (risk block,
  // insufficient cash, staleness, or a halt that just fired) instead of
  // spinning for all 180 bounded ticks and logging ~176 no-op ticks.
  if (!result.ok) {
    await runAtomicBatch(env.POLY_BETA_DB, [
      env.POLY_BETA_DB.prepare(
        `UPDATE beta_portfolios SET engine_state = 'PAUSED', updated_at_ms = ? WHERE tenant_id = ? AND engine_state != 'HALTED'`,
      ).bind(nowMs, tenantId),
      buildExecutionLogStatement(env.POLY_BETA_DB, tenantId, 'WARN',
        'STRATEGY_AUTO_PAUSED', `Auto step stopped: ${result.code}`, nowMs),
    ]);
    return false;
  }
  return true;
}

export async function applyEngineStopOrPause(
  storage: DoStorageLike,
  env: PolyBetaEnv,
  tenantId: string,
  targetState: EngineLifecycleState,
  nowMs: number,
): Promise<Response> {
  await storage.deleteAlarm();
  const current = await env.POLY_BETA_DB.prepare(
    `SELECT engine_state, halt_reason FROM beta_portfolios WHERE tenant_id = ?`,
  )
    .bind(tenantId)
    .first<{ engine_state: string; halt_reason: string | null }>();

  if (targetState === 'STOPPED') {
    await env.POLY_BETA_DB.prepare(
      `UPDATE beta_orders SET status = 'CANCELLED', updated_at_ms = ? WHERE tenant_id = ? AND status = 'PENDING'`,
    )
      .bind(nowMs, tenantId)
      .run();
  }

  // HALTED is sticky: PAUSE/STOP may cancel resting orders above, but must
  // never overwrite engine_state = 'HALTED' to PAUSED or STOPPED.
  if (current?.engine_state === 'HALTED') {
    return new Response(
      JSON.stringify({
        ok: true,
        engineState: 'HALTED',
        haltReason: current.halt_reason,
        code: 'HALT_PRESERVED',
      }),
      { status: 200 },
    );
  }

  await runAtomicBatch(env.POLY_BETA_DB, [
    env.POLY_BETA_DB.prepare(
      `UPDATE beta_portfolios SET engine_state = ?, updated_at_ms = ? WHERE tenant_id = ?`,
    ).bind(targetState, nowMs, tenantId),
    buildExecutionLogStatement(
      env.POLY_BETA_DB,
      tenantId,
      'INFO',
      `STRATEGY_${targetState}`,
      `Paper engine ${targetState}`,
      nowMs,
    ),
  ]);
  return new Response(JSON.stringify({ ok: true, engineState: targetState }), { status: 200 });
}

export async function cancelTenantPaperOrder(
  env: PolyBetaEnv,
  tenantId: string,
  orderId: string,
  nowMs: number,
): Promise<Response> {
  const existing = await env.POLY_BETA_DB.prepare(
    `SELECT order_id, status FROM beta_orders WHERE order_id = ? AND tenant_id = ?`,
  )
    .bind(orderId, tenantId)
    .first<{ order_id: string; status: string }>();
  if (!existing) {
    return new Response(JSON.stringify({ ok: false, code: 'ORDER_NOT_FOUND' }), { status: 404 });
  }
  if (existing.status === 'PENDING') {
    await env.POLY_BETA_DB.prepare(
      `UPDATE beta_orders SET status = 'CANCELLED', updated_at_ms = ? WHERE order_id = ? AND tenant_id = ?`,
    )
      .bind(nowMs, orderId, tenantId)
      .run();
  }
  return new Response(JSON.stringify({ ok: true, orderId, status: 'CANCELLED' }), { status: 200 });
}
