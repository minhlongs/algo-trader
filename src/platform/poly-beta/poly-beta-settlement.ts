/**
 * POLY-G5 Public Beta — Binary Market Resolution Settlement (Settled PnL Tier).
 *
 * Cancels open `PENDING` orders on the resolved market, inserts `SETTLE` fills
 * and `[SIMULATED_DRILL]` `SETTLEMENT_PAYOUT` ledger entries atomically via D1 `batch()`,
 * and refreshes portfolio marks/drawdown so cumulative loss >= 5.00% triggers auto-halt.
 */

import {
  MICRO_PER_USD,
  type PolyBetaD1BoundStatement,
  type PolyBetaD1Database,
} from './poly-beta-types';
import {
  buildExecutionLogStatement,
  refreshMarksAndDrawdown,
  runAtomicBatch,
  type PositionRow,
} from './poly-beta-ledger';

export async function settleSerializedPaperMarket(
  db: PolyBetaD1Database,
  tenantId: string,
  marketId: string,
  winningOutcome: 'YES' | 'NO',
  nowMs: number,
  source: 'USER_DRILL' | 'ORACLE_RESOLVED' = 'USER_DRILL',
): Promise<{ settledCount: number; settledDeltaMicro: number; settlementSource: 'USER_DRILL' | 'ORACLE_RESOLVED' }> {
  const posRes = await db
    .prepare(`SELECT * FROM beta_positions WHERE tenant_id = ? AND market_id = ? AND shares_micro > 0`)
    .bind(tenantId, marketId)
    .all<PositionRow>();

  const pf = await db
    .prepare(`SELECT cash_balance_micro, selected_strategy_id FROM beta_portfolios WHERE tenant_id = ?`)
    .bind(tenantId)
    .first<{ cash_balance_micro: number; selected_strategy_id: string }>();

  const seqRow = await db
    .prepare(`SELECT COALESCE(MAX(seq), 0) AS max_seq FROM beta_ledger_entries WHERE tenant_id = ?`)
    .bind(tenantId)
    .first<{ max_seq: number }>();

  let runningCash = pf?.cash_balance_micro ?? 0;
  let runningSeq = seqRow?.max_seq ?? 0;
  const strategyId = pf?.selected_strategy_id ?? 'toxicity-aware-mm-paper';
  let settledCount = 0;
  let totalSettledDeltaMicro = 0;

  const stmts: PolyBetaD1BoundStatement[] = [
    db
      .prepare(
        `UPDATE beta_orders SET status = 'CANCELLED', updated_at_ms = ?
         WHERE tenant_id = ? AND market_id = ? AND status = 'PENDING'`,
      )
      .bind(nowMs, tenantId, marketId),
  ];

  const sourceTag = source === 'USER_DRILL' ? '[SIMULATED_DRILL] ' : '[ORACLE_RESOLVED] ';

  for (const pos of posRes.results ?? []) {
    const shares = pos.shares_micro / MICRO_PER_USD;
    const payoutPerShareMicro = pos.outcome === winningOutcome ? MICRO_PER_USD : 0;
    const payoutMicro = Math.round(shares * payoutPerShareMicro);
    const costMicro = Math.round(shares * pos.avg_entry_micro);
    const settledDelta = payoutMicro - costMicro;
    runningCash += payoutMicro;
    runningSeq += 1;

    const fillId = `fil_${crypto.randomUUID()}`;
    const settleOrderRef = `settle_${marketId}_${pos.outcome}`;

    stmts.push(
      db
        .prepare(
          `UPDATE beta_positions SET shares_micro = 0, unrealized_micro = 0, updated_at_ms = ?
           WHERE tenant_id = ? AND token_id = ?`,
        )
        .bind(nowMs, tenantId, pos.token_id),
      db
        .prepare(
          `INSERT INTO beta_fills (
             fill_id, order_id, tenant_id, strategy_id, market_id, token_id, market_question,
             outcome, side, price_micro, shares_micro, notional_micro, fee_micro,
             realized_delta_micro, settled_delta_micro, source_timestamp_ms, created_at_ms
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SETTLE', ?, ?, ?, 0, 0, ?, ?, ?)`,
        )
        .bind(
          fillId,
          settleOrderRef,
          tenantId,
          strategyId,
          marketId,
          pos.token_id,
          pos.market_question,
          pos.outcome,
          payoutPerShareMicro,
          pos.shares_micro,
          payoutMicro,
          settledDelta,
          nowMs,
          nowMs,
        ),
      db
        .prepare(
          `INSERT INTO beta_ledger_entries (
             entry_id, tenant_id, seq, entry_type, reference_id, cash_delta_micro, cash_after_micro,
             realized_delta_micro, settled_delta_micro, fee_micro, note, created_at_ms
           ) VALUES (?, ?, ?, 'SETTLEMENT_PAYOUT', ?, ?, ?, 0, ?, 0, ?, ?)`,
        )
        .bind(
          `led_${crypto.randomUUID()}`,
          tenantId,
          runningSeq,
          fillId,
          payoutMicro,
          runningCash,
          settledDelta,
          `${sourceTag}Market ${marketId} resolved ${winningOutcome} (${pos.outcome} -> $${(payoutPerShareMicro / MICRO_PER_USD).toFixed(2)})`,
          nowMs,
        ),
    );
    settledCount += 1;
    totalSettledDeltaMicro += settledDelta;
  }

  if (settledCount > 0) {
    stmts.push(
      db
        .prepare(
          `UPDATE beta_portfolios
           SET cash_balance_micro = ?, settled_pnl_micro = settled_pnl_micro + ?, updated_at_ms = ?
           WHERE tenant_id = ?`,
        )
        .bind(runningCash, totalSettledDeltaMicro, nowMs, tenantId),
      buildExecutionLogStatement(
        db,
        tenantId,
        'INFO',
        source === 'USER_DRILL' ? 'SIMULATED_SETTLEMENT_DRILL' : 'ORACLE_SETTLEMENT',
        `${sourceTag}Settled ${settledCount} position(s) on ${marketId} (${winningOutcome})`,
        nowMs,
      ),
    );
  }

  await runAtomicBatch(db, stmts);
  await refreshMarksAndDrawdown(db, tenantId, new Map(), nowMs, true);
  return { settledCount, settledDeltaMicro: totalSettledDeltaMicro, settlementSource: source };
}
