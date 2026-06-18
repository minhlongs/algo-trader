/**
 * Main dashboard page: Week 5-6 UI Polish + Beta Launch.
 * Refactored to use Stitch design system components.
 */
import { useEffect } from 'react';
import { useTradingStore } from '../stores/trading-store';
import { useDashboardStore } from '../stores/dashboard-store';
import { useAdminControls } from '../hooks/use-admin-controls';
import { useHealthStatus } from '../hooks/use-health-status';
import { useAuthStore } from '../stores/auth-store';
import { useAbTestStore } from '../stores/ab-test-store';
import { StitchButton, StitchCard, StitchStatCard } from '../components/ui/stitch-components';
import { COLORS } from '../lib/stitch-design-tokens';

import {
  DashboardSkeleton,
  PriceTickerSkeleton,
  SignalsPanelSkeleton,
  SpreadGridSkeleton,
  TradeHistorySkeleton,
} from '../components/skeleton-loaders';

import { PriceTickerStrip } from '../components/price-ticker-strip';
import { SpreadOpportunitiesCardGrid } from '../components/spread-opportunities-card-grid';
import { SignalsPanel } from '../components/signals-panel';
import { TradeHistoryFeed } from '../components/trade-history-feed';

import { DashboardHeader } from './dashboard-header';
import { DashboardWidgetsGrid } from './dashboard-widgets-grid';
import { TerminalLogsWidget } from './dashboard-widgets/logs-widget';

function formatUsd(n: number): string {
  const abs = Math.abs(n);
  const s = abs >= 1000
    ? abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : abs.toFixed(2);
  return (n < 0 ? '-' : '') + '$' + s;
}

export function DashboardPage() {
  const { tier, tenantId } = useAuthStore();
  const { config, widgets, fetchAbConfig, fetchPersonalizationConfig, trackEvent } = useAbTestStore();

  const signals = useDashboardStore((s) => s.signals);
  const lastSignalsUpdate = useDashboardStore((s) => s.lastSignalsUpdate);
  const signalsLoading = lastSignalsUpdate === null;

  const metrics = useDashboardStore((s) => s.metrics);
  const lastMetricsUpdate = useDashboardStore((s) => s.lastMetricsUpdate);
  const pnlLoading = lastMetricsUpdate === null;

  const { loading: adminLoading } = useAdminControls();
  useHealthStatus();

  const positions = useTradingStore((s: any) => s.positions);
  const spreads = useTradingStore((s: any) => s.spreads);
  const strategies = useTradingStore((s: any) => s.strategies);
  const trades = useTradingStore((s: any) => s.trades);

  useEffect(() => {
    if (tenantId) fetchAbConfig(tenantId);
    if (tier) fetchPersonalizationConfig(tier);
    trackEvent('dashboard_page_load');
    const startTime = Date.now();
    return () => {
      const durationSec = Math.floor((Date.now() - startTime) / 1000);
      trackEvent('dashboard_session_close', { durationSeconds: durationSec });
    };
  }, [tenantId, tier]);

  const isInitialLoading = pnlLoading || signalsLoading || adminLoading;
  const openCount = positions.filter((p: any) => p.status === 'open').length;
  const activeStrategies = strategies?.filter((s: any) => s.enabled).length ?? 0;
  const pnlValue = metrics?.dailyPnl ?? 0;
  const pnlTone: 'profit' | 'loss' | 'primary' = pnlValue >= 0 ? 'profit' : 'loss';

  if (isInitialLoading) return <DashboardSkeleton />;

  return (
    <div className={`space-y-6 ${config?.theme === 'cyberpunk' ? 'font-mono' : ''}`}>
      {config?.theme === 'cyberpunk' && (
        <style>{`
          .theme-cyberpunk .border-white\\/5 { border-color: #ff007f !important; }
          .theme-cyberpunk .text-white { color: #00ffff !important; }
          .theme-cyberpunk button.bg-accent { background-color: #00ffff !important; color: #000000 !important; }
        `}</style>
      )}

      <DashboardHeader />

      {(!widgets.length || widgets.find(w => w.id === 'price-ticker')?.visible !== false) && (
        <StitchCard className="p-3" onClick={() => trackEvent('widget_click', { widget: 'price-ticker' })}>
          {pnlLoading ? <PriceTickerSkeleton /> : <PriceTickerStrip />}
        </StitchCard>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {pnlLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-xl border p-5" style={{ backgroundColor: COLORS.surface, borderColor: COLORS.outline }}>
                <div className="h-3 w-20 rounded" style={{ backgroundColor: COLORS.outline }} />
                <div className="mt-3 h-8 w-24 rounded" style={{ backgroundColor: COLORS.outline }} />
              </div>
            ))}
          </div>
        ) : (
          <>
            <StitchStatCard label="Total Equity" value={metrics?.totalPnl ? formatUsd(metrics.totalPnl) : '—'} />
            <StitchStatCard label="Open Positions" value={String(openCount)} />
            <StitchStatCard label="Today's P&L" value={formatUsd(pnlValue)} tone={pnlTone} />
            <StitchStatCard label="Active Strategies" value={String(activeStrategies)} tone="primary" />
          </>
        )}
      </div>

      {config?.promoBanner && (
        <div
          className="p-4 cursor-pointer border rounded-xl"
          style={{
            backgroundColor: `${COLORS.primary}1a`,
            borderColor: `${COLORS.primary}4d`,
          }}
          onClick={() => trackEvent('upgrade_banner_click')}
        >
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
            <div>
              <h4 className="text-sm font-semibold" style={{ color: COLORS.onSurface }}>⚡ Upgrade to Algo-Trader PRO</h4>
              <p className="text-xs mt-0.5" style={{ color: COLORS.onSurfaceVariant }}>
                Unlock real-time strategy toggles, unlimited strategies, and advanced AI Insights!
              </p>
            </div>
            <StitchButton variant="primary">Upgrade Now</StitchButton>
          </div>
        </div>
      )}

      <DashboardWidgetsGrid widgets={widgets} trackEvent={trackEvent} />

      <section className="space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: COLORS.onSurface }}>
          <span className="w-1.5 h-3.5 rounded-full" style={{ backgroundColor: COLORS.primary }} />
          Spread Opportunities
          {spreads.length > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-mono" style={{ backgroundColor: `${COLORS.surfaceHigh}66`, color: COLORS.onSurfaceVariant }}>
              {spreads.length}
            </span>
          )}
        </h3>
        {pnlLoading ? <SpreadGridSkeleton /> : <SpreadOpportunitiesCardGrid spreads={spreads} />}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: COLORS.onSurface }}>
          <span className="w-1.5 h-3.5 rounded-full" style={{ backgroundColor: COLORS.primary }} />
          Real-Time Arbitrage Signals
          {signals.length > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-mono" style={{ backgroundColor: `${COLORS.surfaceHigh}66`, color: COLORS.onSurfaceVariant }}>
              {signals.length}
            </span>
          )}
        </h3>
        {signalsLoading ? (
          <SignalsPanelSkeleton />
        ) : (
          <SignalsPanel signals={signals} loading={signalsLoading} error={null} onRefresh={() => Promise.resolve()} />
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: COLORS.onSurface }}>
          <span className="w-1.5 h-3.5 rounded-full" style={{ backgroundColor: COLORS.primary }} />
          Trades Execution Feed
          {trades.length > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-mono" style={{ backgroundColor: `${COLORS.surfaceHigh}66`, color: COLORS.onSurfaceVariant }}>
              {trades.length}
            </span>
          )}
        </h3>
        <StitchCard className="p-0 overflow-hidden">
          {pnlLoading ? <TradeHistorySkeleton /> : <TradeHistoryFeed trades={trades} />}
        </StitchCard>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6">
          <TerminalLogsWidget />
        </div>
      </div>
    </div>
  );
}

export default DashboardPage;
