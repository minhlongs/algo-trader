/**
 * Subscriber Equity Chart
 * Renders per-subscriber NAV curve using existing PriceChartLightweight.
 * Green when totalReturn >= 0, red otherwise.
 */

import { useMemo } from 'react';
import { PriceChartLightweight } from './price-chart-lightweight';
import type { ChartDataPoint } from './price-chart-lightweight';

export interface EquityCurvePoint {
  date: string;
  nav: number;
  dailyPnl: number;
}

interface SubscriberEquityChartProps {
  curve: EquityCurvePoint[];
  totalReturn: number;
  height?: number;
}

export function SubscriberEquityChart({
  curve,
  totalReturn,
  height = 220,
}: SubscriberEquityChartProps) {
  const chartData = useMemo<ChartDataPoint[]>(
    () => curve.map((p) => ({ time: p.date, value: p.nav })),
    [curve]
  );

  const color = totalReturn >= 0 ? '#00E676' : '#FF4466';

  if (curve.length === 0) {
    return (
      <div className="flex items-center justify-center text-muted text-xs" style={{ height }}>
        No equity data yet
      </div>
    );
  }

  return (
    <PriceChartLightweight
      data={chartData}
      height={height}
      color={color}
      title="Equity Curve (NAV)"
    />
  );
}
