/**
 * AI insights panel widget for dashboard.
 */
import { Card } from '../../components/ui/card';

interface AIInsightsWidgetProps {
  colSpan: number;
  onClickCapture?: () => void;
}

export function AIInsightsWidget({ colSpan, onClickCapture }: AIInsightsWidgetProps) {
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
      key="ai-insights-panel"
      className={`${colSpanMap[colSpan] || 'lg:col-span-12'} p-6 flex flex-col`}
      onClickCapture={onClickCapture}
    >
      <h3 className="text-white text-sm font-semibold mb-2 flex items-center gap-2">
        <span className="text-accent">✨</span> AI Insights Engine
      </h3>
      <p className="text-muted text-xs">
        Swarm models are analyzing real-time spreads... Recommendations will appear here.
      </p>
    </Card>
  );
}
