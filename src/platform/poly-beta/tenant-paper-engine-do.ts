/**
 * POLY-G5 Public Beta — `TenantPaperEngine` Durable Object.
 *
 * 1 instance per `tenant_id` (`idFromName(tenantId)`):
 * - Serializes all strategy lifecycle transitions (`START`, `PAUSE`, `STOP`, `STEP`),
 *   paper orders, cancellations, and binary market settlements.
 * - Uses `state.storage.setAlarm(Date.now() + 10_000)` ONLY while `RUNNING`
 *   (bounded to 180 ticks max per start), cancelling `deleteAlarm()` immediately on
 *   `PAUSE`, `STOP`, `HALTED`, or account purge.
 */

import {
  ACTIVE_ENGINE_ALARM_MS,
  MAX_CUMULATIVE_DRAWDOWN_BPS,
  type ApprovedPaperStrategyId,
  type EngineLifecycleState,
  type PolyBetaEnv,
} from './poly-beta-types';
import { fetchSupportedBetaMarkets } from './poly-beta-markets';
import { appendExecutionLog, refreshMarksAndDrawdown } from './poly-beta-ledger';
import { executeSerializedPaperOrder, settleSerializedPaperMarket } from './poly-beta-execution';
import {
  applyEngineStopOrPause,
  cancelTenantPaperOrder,
  runEngineStrategyStep,
  type DoStateLike,
} from './tenant-paper-engine-actions';

export type { DoStateLike, DoStorageLike } from './tenant-paper-engine-actions';

const MAX_BOUNDED_SESSION_TICKS = 180;

export class TenantPaperEngine {
  constructor(
    private readonly state: DoStateLike,
    private readonly env: PolyBetaEnv,
  ) {}

  async fetch(request: Request): Promise<Response> {
    try {
      return await this.routeDoRequest(request);
    } catch {
      return new Response(
        JSON.stringify({ ok: false, error: 'Engine internal error', code: 'DO_INTERNAL_ERROR' }),
        { status: 500 },
      );
    }
  }

  private async routeDoRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const tenantId = String(body.tenantId ?? '');
    if (!tenantId) {
      return new Response(JSON.stringify({ ok: false, error: 'Missing tenantId' }), { status: 400 });
    }

    if (url.pathname === '/purge' && request.method === 'POST') {
      await this.state.storage.deleteAlarm();
      await this.state.storage.deleteAll();
      return new Response(JSON.stringify({ ok: true, purged: true }), { status: 200 });
    }
    if (url.pathname === '/control' && request.method === 'POST') {
      return this.handleControl(tenantId, body);
    }
    if (url.pathname === '/order' && request.method === 'POST') {
      return this.handleManualOrder(tenantId, body);
    }
    if (url.pathname === '/cancel-order' && request.method === 'POST') {
      return cancelTenantPaperOrder(this.env, tenantId, String(body.orderId ?? ''), Date.now());
    }
    if (url.pathname === '/settle' && request.method === 'POST') {
      const res = await settleSerializedPaperMarket(
        this.env.POLY_BETA_DB,
        tenantId,
        String(body.marketId ?? ''),
        body.winningOutcome === 'NO' ? 'NO' : 'YES',
        Date.now(),
      );
      return new Response(JSON.stringify({ ok: true, ...res }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: false, error: 'Unknown DO route' }), { status: 404 });
  }

  async alarm(): Promise<void> {
    let tenantId: string | undefined;
    try {
      tenantId = await this.state.storage.get<string>('tenantId');
      if (!tenantId) return;
      const ticksRemaining = (await this.state.storage.get<number>('ticksRemaining')) ?? 0;
      if (ticksRemaining <= 0) {
        await this.env.POLY_BETA_DB.prepare(
          `UPDATE beta_portfolios SET engine_state = 'PAUSED', updated_at_ms = ? WHERE tenant_id = ? AND engine_state = 'RUNNING'`,
        )
          .bind(Date.now(), tenantId)
          .run();
        await appendExecutionLog(this.env.POLY_BETA_DB, tenantId, 'INFO',
          'BOUNDED_SESSION_COMPLETE', 'Paper engine paused after its bounded session.', Date.now());
        await this.state.storage.deleteAlarm();
        return;
      }

      const cont = await runEngineStrategyStep(this.state.storage, this.env, tenantId, Date.now());
      if (cont) {
        await this.state.storage.put('ticksRemaining', ticksRemaining - 1);
        await this.state.storage.setAlarm(Date.now() + ACTIVE_ENGINE_ALARM_MS);
      } else {
        await this.state.storage.deleteAlarm();
      }
    } catch {
      if (tenantId) {
        await appendExecutionLog(this.env.POLY_BETA_DB, tenantId, 'WARN', 'ALARM_ERROR', 'Strategy alarm tick failed', Date.now()).catch(() => {});
      }
    }
  }

  private async handleControl(tenantId: string, body: Record<string, unknown>): Promise<Response> {
    const nowMs = Date.now();
    const action = String(body.action ?? '');
    const strategyId = body.strategyId as ApprovedPaperStrategyId | undefined;
    const marketId = typeof body.marketId === 'string' ? body.marketId : undefined;

    await this.state.storage.put('tenantId', tenantId);
    if (strategyId) {
      await this.env.POLY_BETA_DB.prepare(`UPDATE beta_portfolios SET selected_strategy_id = ?, updated_at_ms = ? WHERE tenant_id = ?`)
        .bind(strategyId, nowMs, tenantId)
        .run();
    }
    if (marketId) {
      await this.env.POLY_BETA_DB.prepare(`UPDATE beta_portfolios SET selected_market_id = ?, updated_at_ms = ? WHERE tenant_id = ?`)
        .bind(marketId, nowMs, tenantId)
        .run();
    }

    const feed = await fetchSupportedBetaMarkets(this.env, { nowMs });
    if (feed.feedHealthy && feed.markets.length > 0) {
      await refreshMarksAndDrawdown(
        this.env.POLY_BETA_DB,
        tenantId,
        new Map(feed.markets.map((m) => [m.marketId, m])),
        nowMs,
        true,
      );
    }

    if (action === 'START') {
      const pf = await this.env.POLY_BETA_DB.prepare(`SELECT max_drawdown_bps FROM beta_portfolios WHERE tenant_id = ?`).bind(tenantId).first<{ max_drawdown_bps: number }>();
      if (pf && pf.max_drawdown_bps >= MAX_CUMULATIVE_DRAWDOWN_BPS) {
        return new Response(JSON.stringify({ ok: false, error: 'Cannot start: cumulative 5% drawdown limit reached.', code: 'DRAWDOWN_HALT_LOCKED' }), { status: 409 });
      }
      await this.env.POLY_BETA_DB.prepare(`UPDATE beta_portfolios SET engine_state = 'RUNNING', halt_reason = NULL, updated_at_ms = ? WHERE tenant_id = ? AND max_drawdown_bps < ?`).bind(nowMs, tenantId, MAX_CUMULATIVE_DRAWDOWN_BPS).run();
      await appendExecutionLog(this.env.POLY_BETA_DB, tenantId, 'INFO', 'STRATEGY_START', 'Paper engine RUNNING (10s DO alarm)', nowMs);
      await this.state.storage.put('ticksRemaining', MAX_BOUNDED_SESSION_TICKS);
      const stillRunning = await runEngineStrategyStep(this.state.storage, this.env, tenantId, nowMs);
      if (stillRunning) await this.state.storage.setAlarm(nowMs + ACTIVE_ENGINE_ALARM_MS);
      else await this.state.storage.deleteAlarm();
      const persisted = await this.env.POLY_BETA_DB.prepare(
        `SELECT engine_state FROM beta_portfolios WHERE tenant_id = ?`,
      ).bind(tenantId).first<{ engine_state: EngineLifecycleState }>();
      return new Response(JSON.stringify({ ok: true, engineState: persisted?.engine_state ?? 'STOPPED' }), { status: 200 });
    }

    if (action === 'STEP') {
      const ok = await runEngineStrategyStep(this.state.storage, this.env, tenantId, nowMs);
      return new Response(JSON.stringify({ ok: true, stepped: ok }), { status: 200 });
    }

    return applyEngineStopOrPause(
      this.state.storage,
      this.env,
      tenantId,
      action === 'PAUSE' ? 'PAUSED' : 'STOPPED',
      nowMs,
    );
  }

  private async handleManualOrder(tenantId: string, body: Record<string, unknown>): Promise<Response> {
    const nowMs = Date.now();
    const feed = await fetchSupportedBetaMarkets(this.env, { nowMs });
    const market = feed.markets.find((m) => m.marketId === String(body.marketId ?? ''));
    if (!feed.feedHealthy || !market) {
      await this.env.POLY_BETA_DB.prepare(
        `UPDATE beta_portfolios SET engine_state = 'HALTED', halt_reason = ?, updated_at_ms = ? WHERE tenant_id = ?`,
      )
        .bind(feed.staleReason ?? 'MARKET_NOT_AVAILABLE', nowMs, tenantId)
        .run();
      return new Response(
        JSON.stringify({ ok: false, code: 'MARKET_UNAVAILABLE_FAIL_CLOSED', detail: feed.staleReason ?? 'Market unavailable' }),
        { status: 503 },
      );
    }

    const res = await executeSerializedPaperOrder(this.env.POLY_BETA_DB, {
      tenantId,
      idempotencyKey: String(body.idempotencyKey),
      strategyId: (body.strategyId as ApprovedPaperStrategyId | undefined) ?? 'toxicity-aware-mm-paper',
      market,
      outcome: body.outcome === 'NO' ? 'NO' : 'YES',
      side: body.side === 'SELL' ? 'SELL' : 'BUY',
      sizeShares: Number(body.sizeShares),
      ...(typeof body.limitPrice === 'number' ? { limitPrice: body.limitPrice } : {}),
      nowMs,
    });
    return new Response(JSON.stringify(res), { status: res.ok ? 200 : 422 });
  }
}
