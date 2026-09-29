/**
 * Portfolio Prometheus Metrics
 * Instruments Prometheus metrics for portfolio equity, PnL, cash buffer, ROCE, leverage, and drift.
 */

import client from 'prom-client';
import type { ConsolidatedPortfolioSnapshot } from './telemetry-types';

function getOrCreateMetric<T extends client.Metric<string>>(
  registry: client.Registry,
  name: string,
  createFn: () => T,
): T {
  const existing = registry.getSingleMetric(name);
  if (existing) {
    return existing as T;
  }
  return createFn();
}

const defaultRegister = client.register;

export const portfolioEquityUsd = getOrCreateMetric(
  defaultRegister,
  'portfolio_equity_usd',
  () => new client.Gauge({
    name: 'portfolio_equity_usd',
    help: 'Total consolidated portfolio equity in USD',
  })
);

export const portfolioMtmPnlUsd = getOrCreateMetric(
  defaultRegister,
  'portfolio_mtm_pnl_usd',
  () => new client.Gauge({
    name: 'portfolio_mtm_pnl_usd',
    help: 'Mark-to-market PnL in USD partitioned by trading engine',
    labelNames: ['engine'] as const,
  })
);

export const portfolioCashBufferRatio = getOrCreateMetric(
  defaultRegister,
  'portfolio_cash_buffer_ratio',
  () => new client.Gauge({
    name: 'portfolio_cash_buffer_ratio',
    help: 'Ratio of unallocated liquid cash buffer to total equity',
  })
);

export const portfolioRoceRatio = getOrCreateMetric(
  defaultRegister,
  'portfolio_roce_ratio',
  () => new client.Gauge({
    name: 'portfolio_roce_ratio',
    help: 'Consolidated annualized Return on Capital Employed ratio',
  })
);

export const portfolioGrossLeverage = getOrCreateMetric(
  defaultRegister,
  'portfolio_gross_leverage',
  () => new client.Gauge({
    name: 'portfolio_gross_leverage',
    help: 'Consolidated portfolio gross leverage ratio',
  })
);

export const portfolioDriftUsd = getOrCreateMetric(
  defaultRegister,
  'portfolio_drift_usd',
  () => new client.Gauge({
    name: 'portfolio_drift_usd',
    help: 'Accounting drift discrepancy in USD between equity and engine balances',
  })
);

export const PORTFOLIO_METRIC_ENTRIES = [
  { name: 'portfolio_equity_usd', metric: portfolioEquityUsd },
  { name: 'portfolio_mtm_pnl_usd', metric: portfolioMtmPnlUsd },
  { name: 'portfolio_cash_buffer_ratio', metric: portfolioCashBufferRatio },
  { name: 'portfolio_roce_ratio', metric: portfolioRoceRatio },
  { name: 'portfolio_gross_leverage', metric: portfolioGrossLeverage },
  { name: 'portfolio_drift_usd', metric: portfolioDriftUsd },
] as const;

/**
 * Registers portfolio telemetry metrics into the target Prometheus registry.
 */
export function registerPortfolioMetrics(targetRegistry: client.Registry): void {
  for (const item of PORTFOLIO_METRIC_ENTRIES) {
    try {
      if (!targetRegistry.getSingleMetric(item.name)) {
        targetRegistry.registerMetric(item.metric);
      }
    } catch {
      // Safe no-op if already registered
    }
  }
}

export class PortfolioMetricsRecorder {
  /**
   * Updates all portfolio telemetry gauges from a consolidated snapshot.
   */
  public static recordSnapshot(snapshot: ConsolidatedPortfolioSnapshot): void {
    portfolioEquityUsd.set(snapshot.totalEquityUsd);
    portfolioCashBufferRatio.set(
      snapshot.totalEquityUsd > 0
        ? snapshot.unallocatedCashUsd / snapshot.totalEquityUsd
        : 0
    );
    portfolioRoceRatio.set(snapshot.roceAnnualized);
    portfolioGrossLeverage.set(snapshot.grossLeverage);
    portfolioDriftUsd.set(snapshot.accountingDriftUsd);

    for (const [engineId, engineSnapshot] of Object.entries(snapshot.engineSnapshots)) {
      portfolioMtmPnlUsd.set({ engine: engineId }, engineSnapshot.mtmPnlUsd);
    }
  }

  /**
   * Explicitly updates drift gauge.
   */
  public static recordDrift(driftUsd: number): void {
    portfolioDriftUsd.set(driftUsd);
  }
}
