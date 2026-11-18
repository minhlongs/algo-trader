/**
 * POLY-G5 Public Beta — C1 Authoritative Ledger Accounting Regression Suite.
 *
 * Verifies:
 *  - C1a: BUY fills debit fee into `realized_pnl_micro` so `initial + realized + unrealized + settled === totalEquity`
 *  - C1b: Resting `PENDING` limit orders enforce cash, $20 exposure, and share ownership reservations
 *  - C1c: Settlement cancels `PENDING` orders on the resolved market, inserts `SETTLE` fills, and refreshes drawdown
 */

import { describe, expect, it } from 'vitest';
import {
  executeSerializedPaperOrder,
  settleSerializedPaperMarket,
} from '../../src/platform/poly-beta/poly-beta-execution';
import { provisionTenantGenesisLedger } from '../../src/platform/poly-beta/poly-beta-genesis';
import { refreshMarksAndDrawdown } from '../../src/platform/poly-beta/poly-beta-ledger';
import { createSqliteD1, seedMarketSnapshots } from './poly-beta-test-harness';

describe('POLY-G5 C1 — Authoritative Ledger PnL & Settlement Accounting', () => {
  it('preserves equity identity on BUY fills, guards resting limit orders, and settles completely', async () => {
    const { db } = createSqliteD1();
    const tenantId = 'tn_c1_test';
    const nowMs = Date.now();
    await provisionTenantGenesisLedger(db, {
      userId: 'usr_c1',
      tenantId,
      email: 'c1-ledger@example.com',
      passwordHash: 'h',
      passwordSalt: 's',
      sessionHash: 'sh',
      csrfToken: 'csrf',
      expiresAtMs: nowMs + 3_600_000,
      nowMs,
    });
    const snap = seedMarketSnapshots()[0]!;
    const marketsById = new Map([[snap.marketId, snap]]);

    // C1a: BUY 5 shares @ $0.46 -> realized_pnl_micro === -fees_paid_micro, and equity identity holds
    const buyRes = await executeSerializedPaperOrder(db, {
      tenantId,
      idempotencyKey: 'c1-buy-5',
      strategyId: 'toxicity-aware-mm-paper',
      market: snap,
      outcome: 'YES',
      side: 'BUY',
      sizeShares: 5,
      nowMs,
    });
    expect(buyRes.ok).toBe(true);

    const state1 = await refreshMarksAndDrawdown(db, tenantId, marketsById, nowMs);
    expect(state1.portfolio.realized_pnl_micro).toBe(-state1.portfolio.fees_paid_micro);
    expect(
      state1.portfolio.initial_capital_micro +
        state1.portfolio.realized_pnl_micro +
        state1.unrealizedPnlMicro +
        state1.portfolio.settled_pnl_micro,
    ).toBe(state1.totalEquityMicro);

    // C1b-1: Resting SELL exceeding held shares (8 > 5, notional $4.80 <= $5.00) -> INSUFFICIENT_POSITION
    const unbackedSell = await executeSerializedPaperOrder(db, {
      tenantId,
      idempotencyKey: 'c1-unbacked-sell',
      strategyId: 'toxicity-aware-mm-paper',
      market: snap,
      outcome: 'YES',
      side: 'SELL',
      sizeShares: 8,
      limitPrice: 0.6,
      nowMs,
    });
    expect(unbackedSell).toEqual({
      ok: false,
      code: 'INSUFFICIENT_POSITION',
      detail: expect.any(String),
    });

    // C1b-2: Stack resting BUY orders up to exposure cap; 4th ($4.50 * 4 + $2.20 > $20.00) -> MAX_EXPOSURE_CAP
    for (let i = 1; i <= 3; i++) {
      const r = await executeSerializedPaperOrder(db, {
        tenantId,
        idempotencyKey: `c1-rest-buy-${i}`,
        strategyId: 'toxicity-aware-mm-paper',
        market: snap,
        outcome: 'YES',
        side: 'BUY',
        sizeShares: 15,
        limitPrice: 0.3,
        nowMs,
      });
      expect(r.ok).toBe(true);
    }
    const overExp = await executeSerializedPaperOrder(db, {
      tenantId,
      idempotencyKey: 'c1-rest-buy-over-exp',
      strategyId: 'toxicity-aware-mm-paper',
      market: snap,
      outcome: 'YES',
      side: 'BUY',
      sizeShares: 15,
      limitPrice: 0.3,
      nowMs,
    });
    expect(overExp).toEqual({ ok: false, code: 'MAX_EXPOSURE_CAP', detail: expect.any(String) });

    // C1b-3: Resting BUY exceeding simulated cash balance -> INSUFFICIENT_CASH
    await db
      .prepare(`UPDATE beta_portfolios SET cash_balance_micro = 14_000_000, peak_equity_micro = 16_200_000 WHERE tenant_id = ?`)
      .bind(tenantId)
      .run();
    const overCash = await executeSerializedPaperOrder(db, {
      tenantId,
      idempotencyKey: 'c1-rest-buy-over-cash',
      strategyId: 'toxicity-aware-mm-paper',
      market: snap,
      outcome: 'YES',
      side: 'BUY',
      sizeShares: 5,
      limitPrice: 0.2,
      nowMs,
    });
    expect(overCash).toEqual({ ok: false, code: 'INSUFFICIENT_CASH', detail: expect.any(String) });

    // Set cash to $94.00 (equity $96.20 vs peak $100.00 = 3.8% dd) -> losing settlement drops equity to $94.00 (6.0% dd) -> auto-halt
    await db
      .prepare(`UPDATE beta_portfolios SET cash_balance_micro = 94_000_000, peak_equity_micro = 100_000_000 WHERE tenant_id = ?`)
      .bind(tenantId)
      .run();

    // C1c: Settlement cancels PENDING orders, records SETTLE fill, and halts engine on >= 5% drawdown
    const settled = await settleSerializedPaperMarket(db, tenantId, snap.marketId, 'NO', nowMs);
    expect(settled.settledCount).toBe(1);

    const pendingRows = await db
      .prepare(`SELECT order_id FROM beta_orders WHERE tenant_id = ? AND status = 'PENDING'`)
      .bind(tenantId)
      .all();
    expect(pendingRows.results).toHaveLength(0);

    const fills = await db
      .prepare(`SELECT side, settled_delta_micro FROM beta_fills WHERE tenant_id = ?`)
      .bind(tenantId)
      .all<{ side: string; settled_delta_micro: number }>();
    expect(fills.results.some((f) => f.side === 'SETTLE' && f.settled_delta_micro < 0)).toBe(true);

    const pfAfter = await db
      .prepare(`SELECT engine_state, max_drawdown_bps FROM beta_portfolios WHERE tenant_id = ?`)
      .bind(tenantId)
      .first<{ engine_state: string; max_drawdown_bps: number }>();
    expect(pfAfter?.engine_state).toBe('HALTED');
    expect(pfAfter?.max_drawdown_bps).toBe(600);
  });
});
