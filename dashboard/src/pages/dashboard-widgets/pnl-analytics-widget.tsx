/**
 * PnL analytics widget for dashboard.
 */
import { Card } from '../../components/ui/card';
import { PnLAnalyticsChart } from '../../components/pnl-analytics-chart';
import { EquityCurveChart } from '../../components/equity-curve-pnl-chart';
import {
  PnlChartSkeleton,
  EquityCurveSkeleton,
} from '../../components/skeleton-loaders';

interface PnLAnalyticsWidgetProps {
  colSpan: number;
  metrics: any;
  positions: any[];
  loading: boolean;
  error: any;
  onClickCapture?: () => void;
}

export function PnLAnalyticsWidget({
  colSpan,
  metrics,
  positions,
  loading,
  error,
  onClickCapture,
}: PnLAnalyticsWidgetProps) {
  const colSpanMap: Record<number, string> = {
    1: 'lg:col-span-1',
    2: 'lg:col-span-2',
    3: 'lg:col-span-3',
    4: 'lg:col-span-4',
    5: 'lg:col-span-5',
    6: 'lg:col-span-6',
    7: 'lg:col-span-7',
    8: 'lg:col-span-8',
    9: 'lg:col-span-9',
    10: 'lg:col-span-10',
    11: 'lg:col-span-11',
    12: 'lg:col-span-12',
  };

  return (
    <Card
      className={`${colSpanMap[colSpan] || 'lg:col-span-12'} grid grid-cols-1 xl:grid-cols-2 gap-6`}
      onClickCapture={onClickCapture}
    >
      <div className="flex flex-col">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-1.5 h-3.5 bg-accent rounded-full" />
          <h3 className="text-white text-sm font-semibold">PnL Analytics</h3>
        </div>
        {loading ? <PnlChartSkeleton /> : <PnLAnalyticsChart metrics={metrics} loading={loading} error={error} />}
      </div>

      <div className="flex flex-col justify-between">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-1.5 h-3.5 bg-accent rounded-full" />
          <h3 className="text-white text-sm font-semibold">Equity Curve</h3>
        </div>
        <div
          className="bg-[#101426] border border-white/5 rounded-xl p-4 flex-grow flex items-center justify-center"
        >
          {loading ? <EquityCurveSkeleton /> : <EquityCurveChart positions={positions} />}
        </div>
      </div>
    </Card>
  );
}
