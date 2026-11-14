/**
 * FIFO open+closed capital lockup schedule for Polymarket Governance KPI #8.
 *
 * Computes notional-weighted holding duration from actual `(closeMs - openMs)`
 * on closed slices plus remaining `(endDate - refMs)` lockup on open inventory,
 * never attributing remaining contract expiry to already-exited round-trips.
 */

import type { BacktestTrade, HistoricalSnapshot } from '../backtesting/types';
import type { KpiEvaluationInput } from './kpi-poly-types';

export interface LockupMarketMeta {
  yesTokenId?: string;
  noTokenId?: string;
  endDate: string;
  closed: boolean;
}

export function computeCapitalLockupFromTrades(
  snapshots: readonly HistoricalSnapshot[],
  allTrades: readonly BacktestTrade[],
  refMs: number,
  extraMarkets: readonly LockupMarketMeta[] = [],
): KpiEvaluationInput['capital'] {
  if (allTrades.length === 0 || (snapshots.length === 0 && extraMarkets.length === 0)) {
    return { weightedAvgLockupDays: null, awaitingResolutionPct: null, lockedOver30dPct: null };
  }
  const mktList: LockupMarketMeta[] = [
    ...(snapshots[snapshots.length - 1]?.markets ?? []),
    ...extraMarkets,
  ];
  const byToken = new Map<string, LockupMarketMeta>();
  for (const m of mktList) {
    if (m.yesTokenId) byToken.set(m.yesTokenId, m);
    if (m.noTokenId) byToken.set(m.noTokenId, m);
  }

  const openLots = new Map<string, Array<{ size: number; price: number; openMs: number }>>();
  let totalWeight = 0;
  let weightedDays = 0;
  let over30Weight = 0;
  let awaitingWeight = 0;

  for (const tr of allTrades) {
    const trMs = Date.parse(tr.timestamp);
    if (tr.pnl === null) {
      const lots = openLots.get(tr.tokenId) ?? [];
      lots.push({ size: tr.size, price: tr.price, openMs: trMs });
      openLots.set(tr.tokenId, lots);
      continue;
    }
    const lots = openLots.get(tr.tokenId);
    if (lots && lots.length > 0) {
      let rem = tr.size;
      while (rem > 1e-9 && lots.length > 0) {
        const lot = lots[0]!;
        const matched = Math.min(rem, lot.size);
        const holdDays =
          Number.isFinite(lot.openMs) && Number.isFinite(trMs)
            ? Math.max(0, (trMs - lot.openMs) / 86_400_000)
            : 0;
        const notional = Math.max(0.01, lot.price * matched);
        totalWeight += notional;
        weightedDays += notional * holdDays;
        if (holdDays > 30) over30Weight += notional;
        lot.size -= matched;
        rem -= matched;
        if (lot.size <= 1e-9) lots.shift();
      }
      continue;
    }
    const mkt = byToken.get(tr.tokenId);
    if (!mkt) continue;
    const notional = Math.max(0.01, tr.price * tr.size);
    const endMs = Date.parse(mkt.endDate);
    const daysToExpiry = Number.isFinite(endMs) ? Math.max(0, (endMs - refMs) / 86_400_000) : 0;
    totalWeight += notional;
    weightedDays += notional * daysToExpiry;
    if (daysToExpiry > 30) over30Weight += notional;
    if (mkt.closed) awaitingWeight += notional;
  }

  for (const [tokenId, lots] of openLots) {
    const mkt = byToken.get(tokenId);
    if (!mkt) continue;
    const endMs = Date.parse(mkt.endDate);
    const daysToExpiry = Number.isFinite(endMs) ? Math.max(0, (endMs - refMs) / 86_400_000) : 0;
    for (const lot of lots) {
      if (lot.size <= 1e-9) continue;
      const notional = Math.max(0.01, lot.price * lot.size);
      totalWeight += notional;
      weightedDays += notional * daysToExpiry;
      if (daysToExpiry > 30) over30Weight += notional;
      if (mkt.closed) awaitingWeight += notional;
    }
  }

  if (totalWeight <= 0) {
    return { weightedAvgLockupDays: null, awaitingResolutionPct: null, lockedOver30dPct: null };
  }
  return {
    weightedAvgLockupDays: weightedDays / totalWeight,
    awaitingResolutionPct: (awaitingWeight / totalWeight) * 100,
    lockedOver30dPct: (over30Weight / totalWeight) * 100,
  };
}
