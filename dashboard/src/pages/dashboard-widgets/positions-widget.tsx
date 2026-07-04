/**
 * Active positions widget for dashboard.
 */
import { Card } from '../../components/ui/card';
import { PositionsTableSortable } from '../../components/positions-table-sortable';
import { PositionsTableSkeleton } from '../../components/skeleton-loaders';

interface PositionsWidgetProps {
  colSpan: number;
  positions: any[];
  loading: boolean;
  onClickCapture?: () => void;
}

export function PositionsWidget({ colSpan, positions, loading, onClickCapture }: PositionsWidgetProps) {
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

  const openCount = positions.filter((p) => p.status === 'open').length;

  return (
    <Card
      className={`${colSpanMap[colSpan] || 'lg:col-span-6'} flex flex-col h-[430px]`}
      onClickCapture={onClickCapture}
    >
      <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-3 px-6">
        <span className="text-white text-sm font-semibold">Active Positions</span>
        <span className="text-xs text-muted font-mono">{openCount} open</span>
      </div>
      <div className="flex-grow overflow-y-auto scrollbar-thin px-6">
        {loading ? <PositionsTableSkeleton /> : <PositionsTableSortable positions={positions} />}
      </div>
    </Card>
  );
}
