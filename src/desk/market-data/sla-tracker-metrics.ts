// SPDX-License-Identifier: MIT
/**
 * SLA Tracker metrics emission
 * Prometheus gauge updates extracted from the SlaTracker class (S16 tranche 2 split).
 */

import type { MarketDataSource } from './types';
import type { SlaReport } from './sla-tracker-types';
import {
  setProviderAvailability,
  setProviderErrorRate,
  recordSlaCompliance,
} from '../../platform/middleware/prometheus-metrics';

/**
 * Update Prometheus gauges (availability, error rate, SLA compliance)
 * for each window of a provider SLA report. No-op when no report exists.
 */
export function updateProviderMetrics(
  provider: MarketDataSource,
  targetAvailability: number,
  report: SlaReport | null
): void {
  if (!report) return;

  // Update gauges for each window
  for (const window of Object.values(report.windows)) {
    setProviderAvailability(provider as string, window.availability / 100);
    setProviderErrorRate(provider as string, window.errorRate);
    recordSlaCompliance(provider as string, window.availability >= targetAvailability);
  }
}
