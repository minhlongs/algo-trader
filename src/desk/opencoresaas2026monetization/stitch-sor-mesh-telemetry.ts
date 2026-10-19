// SPDX-License-Identifier: MIT
/**
 * Stitch Screen #13: Smart Order Routing (SOR) & Liquidity Aggregation Mesh Telemetry
 * Powers `site/public/order-routing-mesh.html` with Cont-Kukanov (2017) & Laruelle-Lehalle (2013)
 * multi-venue execution heatmaps, Sankey routing flows, and post-fill mark-out toxicity sentry.
 */

export type SorSplitterAlgorithm =
  | 'ALMGREN_CHRISS_OPTIMAL'
  | 'VOLUME_IN_LINE_VIL'
  | 'IMPLEMENTATION_SHORTFALL'
  | 'DARK_POOL_ICEBERG';

export interface SorVenueHeatmapRow {
  readonly venueId: 'BINANCE' | 'OKX' | 'BYBIT' | 'COINBASE_PRIME' | 'KRAKEN' | 'DERIBIT';
  readonly bestBidUsd: number;
  readonly bestAskUsd: number;
  readonly depthUsd: number;
  readonly makerRebateBps: number;
  readonly takerFeeBps: number;
  readonly fillProbabilityPct: number;
  readonly allocatedNotionalUsd: number;
}

export interface SorMarkoutSentryPoint {
  readonly horizonLabel: '100ms' | '1s' | '10s';
  readonly markoutPnlBps: number;
  readonly toxicityScore: number;
  readonly rerouteTriggered: boolean;
}

export interface SorMeshConsoleSnapshot {
  readonly screenId: 'order-routing-mesh';
  readonly screenNumber: 13;
  readonly symbol: string;
  readonly parentOrderNotionalUsd: number;
  readonly activeAlgorithm: SorSplitterAlgorithm;
  readonly fillCompletionRatePct: number;
  readonly realizedSlippageBps: number;
  readonly venues: readonly SorVenueHeatmapRow[];
  readonly markoutSentry: readonly SorMarkoutSentryPoint[];
}

export const DEFAULT_SOR_VENUES: readonly SorVenueHeatmapRow[] = [
  { venueId: 'BINANCE', bestBidUsd: 94250.5, bestAskUsd: 94251.0, depthUsd: 1450000, makerRebateBps: 1.5, takerFeeBps: 3.5, fillProbabilityPct: 99.2, allocatedNotionalUsd: 850000 },
  { venueId: 'OKX', bestBidUsd: 94250.4, bestAskUsd: 94251.1, depthUsd: 980000, makerRebateBps: 1.2, takerFeeBps: 4.0, fillProbabilityPct: 98.7, allocatedNotionalUsd: 525000 },
  { venueId: 'BYBIT', bestBidUsd: 94250.3, bestAskUsd: 94251.2, depthUsd: 820000, makerRebateBps: 1.0, takerFeeBps: 4.5, fillProbabilityPct: 98.1, allocatedNotionalUsd: 400000 },
  { venueId: 'COINBASE_PRIME', bestBidUsd: 94250.6, bestAskUsd: 94251.3, depthUsd: 760000, makerRebateBps: 0.8, takerFeeBps: 5.0, fillProbabilityPct: 98.5, allocatedNotionalUsd: 350000 },
  { venueId: 'KRAKEN', bestBidUsd: 94250.1, bestAskUsd: 94251.4, depthUsd: 490000, makerRebateBps: 1.0, takerFeeBps: 4.8, fillProbabilityPct: 97.4, allocatedNotionalUsd: 200000 },
  { venueId: 'DERIBIT', bestBidUsd: 94250.7, bestAskUsd: 94251.5, depthUsd: 610000, makerRebateBps: 1.4, takerFeeBps: 3.8, fillProbabilityPct: 98.0, allocatedNotionalUsd: 175000 },
];

export const DEFAULT_MARKOUT_SENTRY: readonly SorMarkoutSentryPoint[] = [
  { horizonLabel: '100ms', markoutPnlBps: 0.68, toxicityScore: 0.14, rerouteTriggered: false },
  { horizonLabel: '1s', markoutPnlBps: 0.51, toxicityScore: 0.19, rerouteTriggered: false },
  { horizonLabel: '10s', markoutPnlBps: 0.42, toxicityScore: 0.22, rerouteTriggered: false },
];

export function buildSorMeshConsoleSnapshot(
  algorithm: SorSplitterAlgorithm = 'ALMGREN_CHRISS_OPTIMAL',
  parentOrderNotionalUsd = 2500000,
): SorMeshConsoleSnapshot {
  const scale = parentOrderNotionalUsd / 2500000;
  const venues = DEFAULT_SOR_VENUES.map((v) => ({
    ...v,
    allocatedNotionalUsd: Number((v.allocatedNotionalUsd * scale).toFixed(2)),
  }));
  return {
    screenId: 'order-routing-mesh',
    screenNumber: 13,
    symbol: 'BTC/USDT',
    parentOrderNotionalUsd,
    activeAlgorithm: algorithm,
    fillCompletionRatePct: 98.4,
    realizedSlippageBps: -0.42,
    venues,
    markoutSentry: DEFAULT_MARKOUT_SENTRY,
  };
}
