/**
 * Candlestick chart widget for dashboard.
 */
import { Card } from '../../components/ui/card';
import { CandlestickChart } from '../../components/candlestick-chart';

interface CandlestickWidgetProps {
  colSpan: number;
  onClickCapture?: () => void;
}

export function CandlestickWidget({ colSpan, onClickCapture }: CandlestickWidgetProps) {
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
      className={`${colSpanMap[colSpan] || 'lg:col-span-8'} flex flex-col h-[450px]`}
      onClickCapture={onClickCapture}
    >
      <CandlestickChart />
    </Card>
  );
}
