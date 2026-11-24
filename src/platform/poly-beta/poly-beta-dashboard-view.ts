/**
 * POLY-G5 Public Beta — Authoritative Portfolio & Ledger Dashboard Presenter.
 *
 * Reads strictly from integer micro-USD rows in `poly-beta-db` scoped to `tenant_id`.
 * Zero placeholder or inferred values.
 */

import {
  APPROVED_PAPER_STRATEGIES,
  INITIAL_VIRTUAL_CAPITAL_MICRO,
  MARKET_STALENESS_LIMIT_MS,
  MAX_CUMULATIVE_DRAWDOWN_BPS,
  MAX_PORTFOLIO_EXPOSURE_MICRO,
  MAX_SINGLE_ORDER_MICRO,
  type PolyBetaD1Database,
  type PolyBetaMarketSnapshot,
} from './poly-beta-types';
import { microToUsd, refreshMarksAndDrawdown } from './poly-beta-ledger';

export async function buildAuthoritativeDashboardView(
  db: PolyBetaD1Database,
  tenantId: string,
  markets: PolyBetaMarketSnapshot[],
  feedHealthy: boolean,
  staleReason: string | null,
  nowMs: number,
  marketDataEnabled = true,
) {
  const marketsById = new Map(markets.map((m) => [m.marketId, m]));
  const state = await refreshMarksAndDrawdown(db, tenantId, marketsById, nowMs, false);
  const ordersRes = await db
    .prepare(`SELECT * FROM beta_orders WHERE tenant_id = ? ORDER BY created_at_ms DESC LIMIT 50`)
    .bind(tenantId)
    .all<Record<string, unknown>>();
  const fillsRes = await db
    .prepare(`SELECT * FROM beta_fills WHERE tenant_id = ? ORDER BY created_at_ms DESC LIMIT 50`)
    .bind(tenantId)
    .all<Record<string, unknown>>();
  const ledgerRes = await db
    .prepare(`SELECT * FROM beta_ledger_entries WHERE tenant_id = ? ORDER BY seq DESC LIMIT 50`)
    .bind(tenantId)
    .all<Record<string, unknown>>();
  const logsRes = await db
    .prepare(`SELECT * FROM beta_execution_logs WHERE tenant_id = ? ORDER BY created_at_ms DESC LIMIT 40`)
    .bind(tenantId)
    .all<Record<string, unknown>>();

  return {
    mode: 'PAPER_ONLY' as const,
    liveTradingEnabled: false as const,
    tenantId,
    summary: {
      initialCapitalUsd: microToUsd(INITIAL_VIRTUAL_CAPITAL_MICRO),
      cashBalanceUsd: microToUsd(state.portfolio.cash_balance_micro),
      totalEquityUsd: microToUsd(state.totalEquityMicro),
      openExposureUsd: microToUsd(state.exposureMicro),
      realizedTradingPnlUsd: microToUsd(state.portfolio.realized_pnl_micro),
      unrealizedMtmPnlUsd: microToUsd(state.unrealizedPnlMicro),
      settledRedemptionPnlUsd: microToUsd(state.portfolio.settled_pnl_micro),
      feesPaidUsd: microToUsd(state.portfolio.fees_paid_micro),
      currentDrawdownPct: Number((state.currentDrawdownBps / 100).toFixed(2)),
      maxDrawdownPct: Number((state.portfolio.max_drawdown_bps / 100).toFixed(2)),
    },
    limits: {
      maxPortfolioExposureUsd: microToUsd(MAX_PORTFOLIO_EXPOSURE_MICRO),
      maxSingleOrderUsd: microToUsd(MAX_SINGLE_ORDER_MICRO),
      maxDrawdownPct: MAX_CUMULATIVE_DRAWDOWN_BPS / 100,
    },
    engine: {
      state: state.portfolio.engine_state,
      haltReason: state.portfolio.halt_reason,
      selectedStrategyId: state.portfolio.selected_strategy_id,
      selectedMarketId: state.portfolio.selected_market_id,
      lastTickAtMs: state.portfolio.last_tick_at_ms,
    },
    health: {
      marketDataEnabled,
      marketFeedHealthy: marketDataEnabled && feedHealthy,
      staleReason,
      ghostGuardMode: 'OFFLINE_DRILL_VERIFIED_NO_LIVE_CHAIN',
      cryptoFiveMinuteGuard: 'ENFORCED_BLOCKED',
      liveExecutionLock: 'LOCKED_FALSE',
      marketDataProvenance: {
        gammaApi: 'https://gamma-api.polymarket.com',
        clobApi: 'https://clob.polymarket.com',
        stalenessLimitMs: MARKET_STALENESS_LIMIT_MS,
        accountingCurrency: 'USD' as const,
        dataRightsStatus: 'HOLD' as const,
        mode: marketDataEnabled
          ? ('READ_ONLY_PUBLIC_PAPER_FEED' as const)
          : ('DISABLED_DEFAULT_DENY' as const),
      },
    },
    strategies: APPROVED_PAPER_STRATEGIES,
    openPositions: state.openPositions.map((p) => ({
      marketId: p.market_id,
      tokenId: p.token_id,
      marketQuestion: p.market_question,
      outcome: p.outcome,
      shares: microToUsd(p.shares_micro),
      avgEntryPrice: microToUsd(p.avg_entry_micro),
      markPrice: microToUsd(p.mark_price_micro),
      unrealizedPnlUsd: microToUsd(p.unrealized_micro),
    })),
    pendingOrders: (ordersRes.results ?? []).filter((o) => o.status === 'PENDING'),
    orders: ordersRes.results ?? [],
    fills: fillsRes.results ?? [],
    ledgerEntries: ledgerRes.results ?? [],
    executionLogs: logsRes.results ?? [],
  };
}
