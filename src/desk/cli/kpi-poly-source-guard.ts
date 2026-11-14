/**
 * Source-provenance gate for the Polymarket governance KPI layer.
 *
 * Every snapshot, market tick, price point, trade print, and replayed L2 book
 * step entering `evaluatePolymarketKpis` MUST carry a valid `L2SourceLabel`
 * (`recorded-l2` | `data-api-v2` | `prices-history`).
 *
 * Any row stamped with `'synthetic-regime'` (from `simulateMarketRegimeTick`),
 * `'ohlcv-store'`, `undefined`, or any unknown string throws immediately so a
 * synthetic price path can never feed a governance KPI.
 */

import { assertL2SourceLabel, type L2SourceLabel } from '../polymarket/l2/l2-source-labels';
import type { KpiProvenanceBundle, VerifiedProvenanceSummary } from './kpi-poly-types';

export class KpiProvenanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KpiProvenanceError';
  }
}

function guardLabel(context: string, value: unknown, seen: Set<L2SourceLabel>): void {
  try {
    assertL2SourceLabel(value);
    seen.add(value);
  } catch {
    throw new KpiProvenanceError(
      `KPI layer rejected non-observed source at ${context}: ${JSON.stringify(value)}`,
    );
  }
}

export function verifyKpiProvenance(bundle: KpiProvenanceBundle): VerifiedProvenanceSummary {
  const seen = new Set<L2SourceLabel>();
  let marketTickCount = 0;

  bundle.snapshots.forEach((snapshot, sIdx) => {
    guardLabel(`snapshots[${sIdx}].source`, snapshot.source, seen);
    snapshot.markets.forEach((market, mIdx) => {
      guardLabel(
        `snapshots[${sIdx}].markets[${mIdx}](${market.conditionId}).source`,
        market.source,
        seen,
      );
      marketTickCount += 1;
    });
  });

  bundle.priceRows.forEach((row, idx) => {
    guardLabel(`priceRows[${idx}].source`, row.source, seen);
  });

  bundle.tradeRows.forEach((row, idx) => {
    guardLabel(`tradeRows[${idx}].source`, row.source, seen);
  });

  bundle.l2Steps.forEach((step, idx) => {
    guardLabel(`l2Steps[${idx}].source`, step.source, seen);
    guardLabel(`l2Steps[${idx}].row.source`, step.row?.source, seen);
  });

  const totalObserved =
    marketTickCount +
    bundle.priceRows.length +
    bundle.tradeRows.length +
    bundle.l2Steps.length;

  if (totalObserved === 0) {
    throw new KpiProvenanceError(
      'KPI layer requires at least one observed Polymarket data row (`recorded-l2`, `data-api-v2`, or `prices-history`)',
    );
  }

  return {
    snapshotCount: bundle.snapshots.length,
    marketTickCount,
    pricesHistoryRows: bundle.priceRows.length,
    dataApiV2Trades: bundle.tradeRows.length,
    recordedL2Steps: bundle.l2Steps.length,
    sourcesSeen: [...seen].sort(),
  };
}
