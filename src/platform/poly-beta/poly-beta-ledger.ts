/**
 * POLY-G5 Public Beta — Authoritative Mark-to-Market, Atomic D1 Batch & Drawdown Core.
 *
 * Updates executable VWAP marks, computes portfolio exposure and drawdown,
 * and auto-halts `engine_state` at `>= 5.00%` drawdown.
 */

import {
  MAX_CUMULATIVE_DRAWDOWN_BPS,
  MICRO_PER_USD,
  type PolyBetaD1BoundStatement,
  type PolyBetaD1Database,
  type PolyBetaMarketSnapshot,
} from './poly-beta-types';

export interface PortfolioRow {
  tenant_id: string;
  mode: string;
  initial_capital_micro: number;
  cash_balance_micro: number;
  realized_pnl_micro: number;
  settled_pnl_micro: number;
  fees_paid_micro: number;
  peak_equity_micro: number;
  max_drawdown_bps: number;
  selected_strategy_id: string;
  selected_market_id: string | null;
  engine_state: 'STOPPED' | 'RUNNING' | 'PAUSED' | 'HALTED';
  halt_reason: string | null;
  last_tick_at_ms: number | null;
  updated_at_ms: number;
}

export interface PositionRow {
  tenant_id: string;
  market_id: string;
  token_id: string;
  market_question: string;
  outcome: 'YES' | 'NO';
  shares_micro: number;
  avg_entry_micro: number;
  mark_price_micro: number;
  unrealized_micro: number;
  updated_at_ms: number;
}

export function microToUsd(micro: number): number {
  return Math.round(micro) / MICRO_PER_USD;
}

export function buildExecutionLogStatement(
  db: PolyBetaD1Database,
  tenantId: string,
  level: 'INFO' | 'WARN' | 'RISK_BLOCK' | 'HALT',
  eventCode: string,
  detail: string,
  nowMs: number,
): PolyBetaD1BoundStatement {
  return db
    .prepare(
      `INSERT INTO beta_execution_logs (log_id, tenant_id, level, event_code, detail, created_at_ms) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(`log_${crypto.randomUUID()}`, tenantId, level, eventCode, detail, nowMs);
}

export async function runAtomicBatch(
  db: PolyBetaD1Database,
  statements: PolyBetaD1BoundStatement[],
): Promise<void> {
  if (statements.length === 0) return;
  if (typeof db.batch === 'function') {
    await db.batch(statements);
    return;
  }
  for (const stmt of statements) await stmt.run();
}

export async function appendExecutionLog(
  db: PolyBetaD1Database,
  tenantId: string,
  level: 'INFO' | 'WARN' | 'RISK_BLOCK' | 'HALT',
  eventCode: string,
  detail: string,
  nowMs: number,
): Promise<void> {
  await buildExecutionLogStatement(db, tenantId, level, eventCode, detail, nowMs).run();
}

export async function refreshMarksAndDrawdown(
  db: PolyBetaD1Database,
  tenantId: string,
  marketsById: ReadonlyMap<string, PolyBetaMarketSnapshot>,
  nowMs: number,
  persist = true,
) {
  const portfolio = await db
    .prepare(`SELECT * FROM beta_portfolios WHERE tenant_id = ?`)
    .bind(tenantId)
    .first<PortfolioRow>();
  if (!portfolio) throw new Error(`Portfolio missing for tenant ${tenantId}`);

  const posRes = await db
    .prepare(`SELECT * FROM beta_positions WHERE tenant_id = ? AND shares_micro > 0`)
    .bind(tenantId)
    .all<PositionRow>();

  let positionMarketValueMicro = 0;
  let unrealizedPnlMicro = 0;
  const openPositions: PositionRow[] = [];
  const writeStmts: PolyBetaD1BoundStatement[] = [];

  for (const pos of posRes.results ?? []) {
    const snap = marketsById.get(pos.market_id);
    let markMicro = pos.mark_price_micro;
    if (snap) {
      const executableBid =
        pos.outcome === 'YES' ? snap.bestBid : Math.max(0.01, Number((1 - snap.bestAsk).toFixed(4)));
      markMicro = Math.round(executableBid * MICRO_PER_USD);
    }
    const shares = pos.shares_micro / MICRO_PER_USD;
    const mktValMicro = Math.round(shares * markMicro);
    const unrealMicro = mktValMicro - Math.round(shares * pos.avg_entry_micro);

    if (persist && (markMicro !== pos.mark_price_micro || unrealMicro !== pos.unrealized_micro)) {
      writeStmts.push(
        db
          .prepare(
            `UPDATE beta_positions SET mark_price_micro = ?, unrealized_micro = ?, updated_at_ms = ? WHERE tenant_id = ? AND token_id = ?`,
          )
          .bind(markMicro, unrealMicro, nowMs, tenantId, pos.token_id),
      );
    }
    positionMarketValueMicro += mktValMicro;
    unrealizedPnlMicro += unrealMicro;
    openPositions.push({
      ...pos,
      mark_price_micro: markMicro,
      unrealized_micro: unrealMicro,
      updated_at_ms: persist ? nowMs : pos.updated_at_ms,
    });
  }

  const totalEquityMicro = portfolio.cash_balance_micro + positionMarketValueMicro;
  const nextPeakMicro = Math.max(portfolio.peak_equity_micro, totalEquityMicro);
  const currentDrawdownBps =
    nextPeakMicro > 0 ? Math.max(0, Math.round(((nextPeakMicro - totalEquityMicro) / nextPeakMicro) * 10_000)) : 0;
  const nextMaxDdBps = Math.max(portfolio.max_drawdown_bps, currentDrawdownBps);

  let nextEngineState = portfolio.engine_state;
  let nextHaltReason = portfolio.halt_reason;
  if (currentDrawdownBps >= MAX_CUMULATIVE_DRAWDOWN_BPS && nextEngineState !== 'HALTED') {
    nextEngineState = 'HALTED';
    nextHaltReason = `DRAWDOWN_LIMIT_BREACH (${(currentDrawdownBps / 100).toFixed(2)}% >= 5.00%)`;
    if (persist) {
      writeStmts.push(buildExecutionLogStatement(db, tenantId, 'HALT', 'DRAWDOWN_AUTO_HALT', nextHaltReason, nowMs));
    }
  }

  if (
    persist &&
    (nextPeakMicro !== portfolio.peak_equity_micro ||
      nextMaxDdBps !== portfolio.max_drawdown_bps ||
      nextEngineState !== portfolio.engine_state)
  ) {
    writeStmts.push(
      db
        .prepare(
          `UPDATE beta_portfolios SET peak_equity_micro = ?, max_drawdown_bps = ?, engine_state = ?, halt_reason = ?, updated_at_ms = ? WHERE tenant_id = ?`,
        )
        .bind(nextPeakMicro, nextMaxDdBps, nextEngineState, nextHaltReason, nowMs, tenantId),
    );
  }
  if (persist) await runAtomicBatch(db, writeStmts);

  return {
    portfolio: {
      ...portfolio,
      peak_equity_micro: nextPeakMicro,
      max_drawdown_bps: nextMaxDdBps,
      engine_state: nextEngineState,
      halt_reason: nextHaltReason,
    },
    openPositions,
    exposureMicro: positionMarketValueMicro,
    unrealizedPnlMicro,
    totalEquityMicro,
    currentDrawdownBps,
  };
}
