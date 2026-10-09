/**
 * Breakdown builders for Alpha-Lab Evaluation Engine.
 */

import type { MarketRegime } from '../regimes/regime-types';
import type {
  RegimeBreakdown,
  MonthBreakdown,
  VolatilityBucketBreakdown,
} from './evaluation-types';

export interface GroupData {
  labels: number[];
  pnls: number[];
}

export function buildRegimeBreakdown(
  regimeGroups: Map<MarketRegime, GroupData>,
): RegimeBreakdown[] {
  const out: RegimeBreakdown[] = [];
  for (const [regime, group] of regimeGroups) {
    const wins = group.labels.filter((l) => l === 1).length;
    const losses = group.labels.filter((l) => l === -1).length;
    const n = group.labels.length;
    out.push({
      regime,
      numTrades: n,
      winRate: wins / n,
      lossRate: losses / n,
      meanLabel: group.labels.reduce((a, b) => a + b, 0) / n,
      netPnl: group.pnls.reduce((a, b) => a + b, 0),
    });
  }
  return out;
}

export function buildMonthBreakdown(
  monthGroups: Map<string, GroupData>,
): MonthBreakdown[] {
  const out: MonthBreakdown[] = [];
  for (const [month, group] of monthGroups) {
    const wins = group.labels.filter((l) => l === 1).length;
    const n = group.labels.length;
    out.push({
      month,
      numTrades: n,
      winRate: wins / n,
      netPnl: group.pnls.reduce((a, b) => a + b, 0),
    });
  }
  return out.sort((a, b) => a.month.localeCompare(b.month));
}

export function buildVolatilityBreakdown(
  volGroups: Map<string, GroupData>,
): VolatilityBucketBreakdown[] {
  const out: VolatilityBucketBreakdown[] = [];
  for (const [bucket, group] of volGroups) {
    const wins = group.labels.filter((l) => l === 1).length;
    const n = group.labels.length;
    out.push({
      bucket: bucket as 'low' | 'medium' | 'high',
      numTrades: n,
      winRate: wins / n,
      netPnl: group.pnls.reduce((a, b) => a + b, 0),
    });
  }
  return out;
}
