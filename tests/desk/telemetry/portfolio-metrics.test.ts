import { describe, it, expect } from 'vitest';
import client from 'prom-client';
import {
  PortfolioMetricsRecorder,
  portfolioEquityUsd,
  portfolioMtmPnlUsd,
  portfolioCashBufferRatio,
  portfolioRoceRatio,
  portfolioGrossLeverage,
  portfolioDriftUsd,
  registerPortfolioMetrics,
} from '../../../src/desk/telemetry/portfolio-metrics';
import type { ConsolidatedPortfolioSnapshot } from '../../../src/desk/telemetry/telemetry-types';

describe('PortfolioMetrics & Prometheus Registration', () => {
  it('updates all Prometheus gauges from a snapshot', async () => {
    const snapshot: ConsolidatedPortfolioSnapshot = {
      timestamp: Date.now(),
      totalEquityUsd: 120000,
      unallocatedCashUsd: 30000,
      allocatedCapitalUsd: 90000,
      totalMtmPnlUsd: 4500,
      grossLeverage: 1.25,
      marginUtilizationRatio: 0.3,
      roceAnnualized: 0.18,
      accountingDriftUsd: 0.00002,
      engineSnapshots: {
        arbitrage: { engineId: 'arbitrage', allocatedCapitalUsd: 22500, mtmPnlUsd: 1500, marginUsedUsd: 5000, tradeCount: 10 },
        marl: { engineId: 'marl', allocatedCapitalUsd: 22500, mtmPnlUsd: 1000, marginUsedUsd: 5000, tradeCount: 10 },
        amm: { engineId: 'amm', allocatedCapitalUsd: 22500, mtmPnlUsd: 1000, marginUsedUsd: 5000, tradeCount: 10 },
        'alpha-lab': { engineId: 'alpha-lab', allocatedCapitalUsd: 22500, mtmPnlUsd: 1000, marginUsedUsd: 5000, tradeCount: 10 },
      },
    };

    PortfolioMetricsRecorder.recordSnapshot(snapshot);

    const equityVal = await portfolioEquityUsd.get();
    expect(equityVal.values[0].value).toBe(120000);

    const cashBufferVal = await portfolioCashBufferRatio.get();
    expect(cashBufferVal.values[0].value).toBeCloseTo(30000 / 120000, 4);

    const roceVal = await portfolioRoceRatio.get();
    expect(roceVal.values[0].value).toBe(0.18);

    const leverageVal = await portfolioGrossLeverage.get();
    expect(leverageVal.values[0].value).toBe(1.25);

    const arbPnlVal = await portfolioMtmPnlUsd.get();
    const arbEntry = arbPnlVal.values.find((v) => v.labels.engine === 'arbitrage');
    expect(arbEntry?.value).toBe(1500);
  });

  it('records drift explicitly via recordDrift()', async () => {
    PortfolioMetricsRecorder.recordDrift(12.34);
    const val = await portfolioDriftUsd.get();
    expect(val.values[0].value).toBe(12.34);
  });

  it('registers in a custom registry without error or collision', () => {
    const customRegistry = new client.Registry();
    registerPortfolioMetrics(customRegistry);
    expect(customRegistry.getSingleMetric('portfolio_equity_usd')).toBeDefined();
    expect(customRegistry.getSingleMetric('portfolio_mtm_pnl_usd')).toBeDefined();

    // Calling again does not throw
    expect(() => registerPortfolioMetrics(customRegistry)).not.toThrow();
  });
});
