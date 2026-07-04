/**
 * Dashboard widgets grid - maps widget config to rendered components.
 */
import { useTradingStore } from '../stores/trading-store';
import { useDashboardStore } from '../stores/dashboard-store';
import { useAdminControls } from '../hooks/use-admin-controls';

import { CandlestickWidget } from './dashboard-widgets/candlestick-widget';
import { StrategyControlsWidget } from './dashboard-widgets/strategy-controls-widget';
import { PnLAnalyticsWidget } from './dashboard-widgets/pnl-analytics-widget';
import { PositionsWidget } from './dashboard-widgets/positions-widget';
import { AIInsightsWidget } from './dashboard-widgets/ai-insights-widget';

interface DashboardWidgetsGridProps {
  widgets: any[];
  trackEvent: (event: string, props?: any) => void;
}

export function DashboardWidgetsGrid({ widgets, trackEvent }: DashboardWidgetsGridProps) {
  const strategies = useTradingStore((s: any) => s.strategies);
  const botStatus = useTradingStore((s: any) => s.botStatus);
  const positions = useTradingStore((s: any) => s.positions);
  const metrics = useDashboardStore((s) => s.metrics);
  const lastMetricsUpdate = useDashboardStore((s) => s.lastMetricsUpdate);
  const pnlLoading = lastMetricsUpdate === null;
  const { status: adminStatus, halt, resume, loading: adminLoading, error: adminError, refresh: refreshAdmin } = useAdminControls();

  const hasWidgets = widgets.length > 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {hasWidgets ? (
        widgets
          .filter((w) => w.visible)
          .map((w) => {
            if (w.id === 'candlestick') {
              return <CandlestickWidget key={w.id} colSpan={w.colSpan} onClickCapture={() => trackEvent('widget_click', { widget: w.id })} />;
            }
            if (w.id === 'strategy-controls') {
              return (
                <StrategyControlsWidget
                  key={w.id}
                  colSpan={w.colSpan}
                  strategies={strategies}
                  botStatus={botStatus}
                  adminStatus={adminStatus}
                  adminLoading={adminLoading}
                  adminError={adminError}
                  refreshAdmin={refreshAdmin}
                  halt={halt}
                  resume={resume}
                  onClickCapture={() => trackEvent('widget_click', { widget: w.id })}
                  trackEvent={trackEvent}
                />
              );
            }
            if (w.id === 'pnl-analytics') {
              return (
                <PnLAnalyticsWidget
                  key={w.id}
                  colSpan={w.colSpan}
                  metrics={metrics}
                  positions={positions}
                  loading={pnlLoading}
                  error={null}
                  onClickCapture={() => trackEvent('widget_click', { widget: w.id })}
                />
              );
            }
            if (w.id === 'active-positions') {
              return (
                <PositionsWidget
                  key={w.id}
                  colSpan={w.colSpan}
                  positions={positions}
                  loading={pnlLoading}
                  onClickCapture={() => trackEvent('widget_click', { widget: w.id })}
                />
              );
            }
            if (w.id === 'ai-insights-panel') {
              return <AIInsightsWidget key={w.id} colSpan={w.colSpan} onClickCapture={() => trackEvent('widget_click', { widget: w.id })} />;
            }
            return null;
          })
      ) : (
        <>
          <CandlestickWidget colSpan={8} onClickCapture={() => trackEvent('widget_click', { widget: 'candlestick' })} />
          <StrategyControlsWidget colSpan={4} strategies={strategies} botStatus={botStatus} adminStatus={adminStatus} adminLoading={adminLoading} adminError={adminError} refreshAdmin={refreshAdmin} halt={halt} resume={resume} onClickCapture={() => trackEvent('widget_click', { widget: 'strategy-controls' })} trackEvent={trackEvent} />
          <PnLAnalyticsWidget colSpan={12} metrics={metrics} positions={positions} loading={pnlLoading} error={null} onClickCapture={() => trackEvent('widget_click', { widget: 'pnl-analytics' })} />
          <PositionsWidget colSpan={6} positions={positions} loading={pnlLoading} onClickCapture={() => trackEvent('widget_click', { widget: 'active-positions' })} />
        </>
      )}
    </div>
  );
}
