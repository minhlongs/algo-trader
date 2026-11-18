/**
 * POLY-G5 Public Beta — Serialized Paper Order Execution Accounting.
 *
 * Invoked exclusively inside `TenantPaperEngine` Durable Object so every
 * balance check, position update, fill record, and ledger sequence increment
 * runs single-threaded per `tenant_id` and commits atomically via D1 `batch()`.
 */

import { classifyFiveMinuteExclusion } from '../../shared/polymarket/five-minute-crypto-guard';
import {
  MAX_CUMULATIVE_DRAWDOWN_BPS,
  MAX_PORTFOLIO_EXPOSURE_MICRO,
  MAX_SINGLE_ORDER_MICRO,
  MICRO_PER_USD,
  type ApprovedPaperStrategyId,
  type PolyBetaD1BoundStatement,
  type PolyBetaD1Database,
  type PolyBetaMarketSnapshot,
} from './poly-beta-types';
import { isMarketSnapshotFresh } from './poly-beta-markets';
import {
  appendExecutionLog,
  buildExecutionLogStatement,
  refreshMarksAndDrawdown,
  runAtomicBatch,
} from './poly-beta-ledger';
import { computePaperFeeMicro, loadPendingOrderReservations } from './poly-beta-order-reservations';

export { settleSerializedPaperMarket } from './poly-beta-settlement';

export interface PaperOrderExecutionRequest {
  tenantId: string;
  idempotencyKey: string;
  strategyId: ApprovedPaperStrategyId;
  market: PolyBetaMarketSnapshot;
  outcome: 'YES' | 'NO';
  side: 'BUY' | 'SELL';
  sizeShares: number;
  limitPrice?: number;
  nowMs: number;
}

export async function executeSerializedPaperOrder(
  db: PolyBetaD1Database,
  req: PaperOrderExecutionRequest,
): Promise<
  | { ok: true; orderId: string; idempotentReplay: boolean }
  | { ok: false; code: string; detail: string }
> {
  const existing = await db
    .prepare(`SELECT order_id, status FROM beta_orders WHERE tenant_id = ? AND idempotency_key = ?`)
    .bind(req.tenantId, req.idempotencyKey)
    .first<{ order_id: string; status: string }>();
  if (existing) return { ok: true, orderId: existing.order_id, idempotentReplay: true };

  if (
    classifyFiveMinuteExclusion({
      id: req.market.marketId,
      slug: req.market.slug,
      question: req.market.question,
    }) !== null
  ) {
    await appendExecutionLog(db, req.tenantId, 'RISK_BLOCK', 'FIVE_MINUTE_CRYPTO_BLOCKED', req.market.question, req.nowMs);
    return { ok: false, code: 'FIVE_MINUTE_CRYPTO_BLOCKED', detail: '5-minute crypto markets are excluded' };
  }

  const freshness = isMarketSnapshotFresh(req.market, req.nowMs);
  if (!freshness.fresh) {
    await runAtomicBatch(db, [
      db
        .prepare(`UPDATE beta_portfolios SET engine_state = 'HALTED', halt_reason = ?, updated_at_ms = ? WHERE tenant_id = ?`)
        .bind(`STALE_MARKET_DATA (${freshness.ageMs}ms > 30000ms)`, req.nowMs, req.tenantId),
      buildExecutionLogStatement(db, req.tenantId, 'HALT', 'STALE_MARKET_DATA', `Market ${req.market.marketId} stale (${freshness.ageMs}ms)`, req.nowMs),
    ]);
    return { ok: false, code: 'STALE_MARKET_DATA', detail: `Market snapshot stale by ${freshness.ageMs}ms` };
  }

  const state = await refreshMarksAndDrawdown(db, req.tenantId, new Map([[req.market.marketId, req.market]]), req.nowMs);
  if (state.portfolio.engine_state === 'HALTED' || state.currentDrawdownBps >= MAX_CUMULATIVE_DRAWDOWN_BPS) {
    return { ok: false, code: 'ENGINE_HALTED', detail: state.portfolio.halt_reason ?? 'Risk halt active' };
  }

  const tokenId = req.outcome === 'YES' ? req.market.yesTokenId : req.market.noTokenId;
  const executableBuy = req.outcome === 'YES' ? req.market.bestAsk : Number(Math.min(0.99, 1 - req.market.bestBid).toFixed(4));
  const executableSell = req.outcome === 'YES' ? req.market.bestBid : Number(Math.max(0.01, 1 - req.market.bestAsk).toFixed(4));
  const execPrice = req.side === 'BUY' ? executableBuy : executableSell;
  const isResting =
    req.limitPrice !== undefined &&
    ((req.side === 'BUY' && req.limitPrice < execPrice) || (req.side === 'SELL' && req.limitPrice > execPrice));
  const effectivePrice = isResting && req.limitPrice !== undefined ? req.limitPrice : execPrice;

  const priceMicro = Math.round(effectivePrice * MICRO_PER_USD);
  const sharesMicro = Math.round(req.sizeShares * MICRO_PER_USD);
  const notionalMicro = Math.round(req.sizeShares * priceMicro);
  const feeMicro = isResting ? 0 : computePaperFeeMicro(notionalMicro, effectivePrice);

  if (notionalMicro > MAX_SINGLE_ORDER_MICRO) {
    await appendExecutionLog(db, req.tenantId, 'RISK_BLOCK', 'SINGLE_ORDER_CAP', `Notional $${(notionalMicro / MICRO_PER_USD).toFixed(2)} > $5.00`, req.nowMs);
    return { ok: false, code: 'SINGLE_ORDER_CAP', detail: 'Single order exceeds $5.00 risk limit' };
  }

  const existingPos = state.openPositions.find((p) => p.token_id === tokenId);
  const pending = await loadPendingOrderReservations(db, req.tenantId, tokenId);

  if (req.side === 'BUY') {
    if (state.exposureMicro + pending.buyNotionalMicro + notionalMicro > MAX_PORTFOLIO_EXPOSURE_MICRO) {
      await appendExecutionLog(db, req.tenantId, 'RISK_BLOCK', 'MAX_EXPOSURE_CAP', 'Portfolio exposure would exceed $20.00', req.nowMs);
      return { ok: false, code: 'MAX_EXPOSURE_CAP', detail: 'Portfolio exposure exceeds $20.00 limit' };
    }
    if (notionalMicro + feeMicro + pending.buyNotionalMicro + pending.buyFeeMicro > state.portfolio.cash_balance_micro) {
      return { ok: false, code: 'INSUFFICIENT_CASH', detail: 'Insufficient simulated cash balance' };
    }
  } else if (!existingPos || existingPos.shares_micro - pending.sellSharesMicro < sharesMicro) {
    return { ok: false, code: 'INSUFFICIENT_POSITION', detail: 'Cannot sell more shares than held (no short/leverage)' };
  }

  if (isResting) {
    // PENDING orders are not auto-matched; manual cancel or settlement only.
    const pendingId = `ord_${crypto.randomUUID()}`;
    await runAtomicBatch(db, [
      db
        .prepare(
          `INSERT INTO beta_orders (order_id, tenant_id, idempotency_key, strategy_id, market_id, token_id, market_question, outcome, side, price_micro, size_shares_micro, filled_shares_micro, fee_micro, status, model_assumption, source_timestamp_ms, created_at_ms, updated_at_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'PENDING', 'Post-only resting queue-back order', ?, ?, ?)`,
        )
        .bind(pendingId, req.tenantId, req.idempotencyKey, req.strategyId, req.market.marketId, tokenId, req.market.question, req.outcome, req.side, priceMicro, sharesMicro, req.market.sourceTimestampMs, req.nowMs, req.nowMs),
      buildExecutionLogStatement(db, req.tenantId, 'INFO', 'ORDER_RESTING', `Resting ${req.side} ${req.sizeShares} ${req.outcome} @ ${req.limitPrice}`, req.nowMs),
    ]);
    return { ok: true, orderId: pendingId, idempotentReplay: false };
  }

  let nextCashMicro = state.portfolio.cash_balance_micro;
  let realizedDeltaMicro = -feeMicro;
  let posStmt: PolyBetaD1BoundStatement;

  if (req.side === 'BUY') {
    nextCashMicro -= notionalMicro + feeMicro;
    const prevShares = existingPos ? existingPos.shares_micro / MICRO_PER_USD : 0;
    const prevAvg = existingPos ? existingPos.avg_entry_micro : 0;
    const nextAvgMicro = Math.round((prevShares * prevAvg + req.sizeShares * priceMicro) / (prevShares + req.sizeShares));
    posStmt = db
      .prepare(
        `INSERT INTO beta_positions (tenant_id, market_id, token_id, market_question, outcome, shares_micro, avg_entry_micro, mark_price_micro, unrealized_micro, updated_at_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
         ON CONFLICT(tenant_id, token_id) DO UPDATE SET shares_micro = beta_positions.shares_micro + excluded.shares_micro, avg_entry_micro = excluded.avg_entry_micro, mark_price_micro = excluded.mark_price_micro, updated_at_ms = excluded.updated_at_ms`,
      )
      .bind(req.tenantId, req.market.marketId, tokenId, req.market.question, req.outcome, sharesMicro, nextAvgMicro, priceMicro, req.nowMs);
  } else {
    nextCashMicro += notionalMicro - feeMicro;
    realizedDeltaMicro = Math.round(req.sizeShares * (priceMicro - existingPos!.avg_entry_micro)) - feeMicro;
    posStmt = db
      .prepare(`UPDATE beta_positions SET shares_micro = ?, updated_at_ms = ? WHERE tenant_id = ? AND token_id = ?`)
      .bind(existingPos!.shares_micro - sharesMicro, req.nowMs, req.tenantId, tokenId);
  }

  const orderId = `ord_${crypto.randomUUID()}`;
  const fillId = `fil_${crypto.randomUUID()}`;
  const seqRow = await db
    .prepare(`SELECT COALESCE(MAX(seq), 0) AS max_seq FROM beta_ledger_entries WHERE tenant_id = ?`)
    .bind(req.tenantId)
    .first<{ max_seq: number }>();
  const nextSeq = (seqRow?.max_seq ?? 0) + 1;

  await runAtomicBatch(db, [
    posStmt,
    db
      .prepare(
        `INSERT INTO beta_orders (order_id, tenant_id, idempotency_key, strategy_id, market_id, token_id, market_question, outcome, side, price_micro, size_shares_micro, filled_shares_micro, fee_micro, status, model_assumption, source_timestamp_ms, created_at_ms, updated_at_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'FILLED', 'Executable top-of-book quote + parabolic fee, zero lookahead', ?, ?, ?)`,
      )
      .bind(orderId, req.tenantId, req.idempotencyKey, req.strategyId, req.market.marketId, tokenId, req.market.question, req.outcome, req.side, priceMicro, sharesMicro, sharesMicro, feeMicro, req.market.sourceTimestampMs, req.nowMs, req.nowMs),
    db
      .prepare(
        `INSERT INTO beta_fills (fill_id, order_id, tenant_id, strategy_id, market_id, token_id, market_question, outcome, side, price_micro, shares_micro, notional_micro, fee_micro, realized_delta_micro, settled_delta_micro, source_timestamp_ms, created_at_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      )
      .bind(fillId, orderId, req.tenantId, req.strategyId, req.market.marketId, tokenId, req.market.question, req.outcome, req.side, priceMicro, sharesMicro, notionalMicro, feeMicro, realizedDeltaMicro, req.market.sourceTimestampMs, req.nowMs),
    db
      .prepare(
        `INSERT INTO beta_ledger_entries (entry_id, tenant_id, seq, entry_type, reference_id, cash_delta_micro, cash_after_micro, realized_delta_micro, settled_delta_micro, fee_micro, note, created_at_ms)
         VALUES (?, ?, ?, 'ORDER_FILL', ?, ?, ?, ?, 0, ?, ?, ?)`,
      )
      .bind(`led_${crypto.randomUUID()}`, req.tenantId, nextSeq, fillId, nextCashMicro - state.portfolio.cash_balance_micro, nextCashMicro, realizedDeltaMicro, feeMicro, `${req.side} ${req.sizeShares} ${req.outcome} @ $${execPrice.toFixed(4)} (${req.strategyId})`, req.nowMs),
    db
      .prepare(
        `UPDATE beta_portfolios SET cash_balance_micro = ?, realized_pnl_micro = realized_pnl_micro + ?, fees_paid_micro = fees_paid_micro + ?, last_tick_at_ms = ?, updated_at_ms = ? WHERE tenant_id = ?`,
      )
      .bind(nextCashMicro, realizedDeltaMicro, feeMicro, req.nowMs, req.nowMs, req.tenantId),
    buildExecutionLogStatement(db, req.tenantId, 'INFO', 'PAPER_FILL', `Filled ${req.side} ${req.sizeShares} ${req.outcome} @ $${execPrice.toFixed(4)}`, req.nowMs),
  ]);
  return { ok: true, orderId, idempotentReplay: false };
}
