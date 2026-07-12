/**
 * Main dashboard page: Week 5-6 UI Polish + Beta Launch.
 * Refactored to use Stitch design system components.
 * Dark fintech bilingual VN+EN pattern.
 */
import { useEffect, useState } from 'react';
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
import { RiskGauge } from '../components/ui/risk-gauge';
import { ExposureHeatmap } from '../components/ui/exposure-heatmap';
import { PnlSparkline } from '../components/ui/pnl-sparkline';

import { DashboardHeader } from './dashboard-header';
import { DashboardWidgetsGrid } from './dashboard-widgets-grid';
import { TerminalLogsWidget } from './dashboard-widgets/logs-widget';

type Lang = 'en' | 'vi';

const COPY: Record<Lang, Record<string, string>> = {
  en: {
    langToggle: 'Tiếng Việt',
    title: 'Dashboard',
    subtitle: 'Portfolio overview, signals, and trade execution at a glance',
    totalEquity: 'Total Equity',
    openPositions: 'Open Positions',
    todayPnl: "Today's P&L",
    activeStrategies: 'Active Strategies',
    spreadOpportunities: 'Spread Opportunities',
    realTimeSignals: 'Real-Time Arbitrage Signals',
    tradesFeed: 'Trades Execution Feed',
    riskOverview: 'Risk Overview',
    portfolioRisk: 'Portfolio Risk',
    exposureHeatmap: 'Exposure Heatmap',
    cumulativePnl: 'Cumulative P&L',
    upgradePro: '⚡ Upgrade to Algo-Trader PRO',
    upgradeCta: 'Upgrade Now',
    upgradeSub: 'Unlock real-time strategy toggles, unlimited strategies, and advanced AI Insights!',
  },
  vi: {
    langToggle: 'English',
    title: 'Bảng điều khiển',
    subtitle: 'Tổng quan danh mục, tín hiệu và thực thi giao dịch trong một cái nhìn',
    totalEquity: 'Tổng Vốn',
    openPositions: 'Vị thế Mở',
    todayPnl: 'P&L Hôm nay',
    activeStrategies: 'Chiến lược Hoạt động',
    spreadOpportunities: 'Cơ hội Spread',
    realTimeSignals: 'Tín hiệu Arbitrage Thời gian thực',
    tradesFeed: 'Feed Thực thi Giao dịch',
    riskOverview: 'Tổng quan Rủi ro',
    portfolioRisk: 'Rủi ro Danh mục',
    exposureHeatmap: 'Bản đồ Phơi nhiễm',
    cumulativePnl: 'P&L Tích lũy',
    upgradePro: '⚡ Nâng cấp Algo-Trader PRO',
    upgradeCta: 'Nâng cấp Ngay',
    upgradeSub: 'Mở khóa bật/tắt chiến lược thời gian thực, chiến lược không giới hạn, và AI Insights nâng cao!',
  },
};

function formatUsd(n: number): string {
  const abs = Math.abs(n);
  const s =
    abs >= 1000
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

  const [lang, setLang] = useState<Lang>('en');
  const t = COPY[lang];

  const isInitialLoading = pnlLoading || signalsLoading || adminLoading;
  const openCount = positions.filter((p: any) => p.status === 'open').length;
  const activeStrategies = strategies?.filter((s: any) => s.enabled).length ?? 0;
  const pnlValue = metrics?.dailyPnl ?? 0;
  const pnlTone: 'profit' | 'loss' | 'primary' = pnlValue >= 0 ? 'profit' : 'loss';

  if (isInitialLoading) return <DashboardSkeleton />;

  const langLabel = lang === 'en' ? COPY.vi.langToggle : COPY.en.langToggle;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e3e2e2] font-sans">
      <div className="space-y-6 p-6">
        {/* Header + language toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: COLORS.onSurface }}>{t.title}</h1>
            <p className="text-sm mt-1" style={{ color: COLORS.onSurfaceVariant }}>{t.subtitle}</p>
          </div>
          <button
            onClick={() => setLang(lang === 'en' ? 'vi' : 'en')}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors self-start"
            style={{
              backgroundColor: COLORS.surface,
              border: `1px solid ${COLORS.outline}`,
              color: COLORS.onSurfaceVariant,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
            </svg>
            {langLabel}
          </button>
        </div>

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
              <StitchStatCard label={t.totalEquity} value={metrics?.totalPnl ? formatUsd(metrics.totalPnl) : '—'} />
              <StitchStatCard label={t.openPositions} value={String(openCount)} />
              <StitchStatCard label={t.todayPnl} value={formatUsd(pnlValue)} tone={pnlTone} />
              <StitchStatCard label={t.activeStrategies} value={String(activeStrategies)} tone="primary" />
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
                <h4 className="text-sm font-semibold" style={{ color: COLORS.onSurface }}>{t.upgradePro}</h4>
                <p className="text-xs mt-0.5" style={{ color: COLORS.onSurfaceVariant }}>
                  {t.upgradeSub}
                </p>
              </div>
              <StitchButton variant="primary">{t.upgradeCta}</StitchButton>
            </div>
          </div>
        )}

        <DashboardWidgetsGrid widgets={widgets} trackEvent={trackEvent} />

        <section className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: COLORS.onSurface }}>
            <span className="w-1.5 h-3.5 rounded-full" style={{ backgroundColor: COLORS.primary }} />
            {t.spreadOpportunities}
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
            {t.realTimeSignals}
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
            {t.tradesFeed}
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

        {/* Risk Overview Section */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: COLORS.onSurface }}>
            <span className="w-1.5 h-3.5 rounded-full" style={{ backgroundColor: COLORS.primary }} />
            {t.riskOverview}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StitchCard className="p-4 flex flex-col items-center">
              <div className="mb-2 text-xs" style={{ color: COLORS.onSurfaceVariant }}>{t.portfolioRisk}</div>
              <RiskGauge
                value={Math.min(positions.length / 10, 1)}
                threshold={0.8}
                size="md"
              />
            </StitchCard>
            <StitchCard className="p-4">
              <div className="mb-2 text-xs" style={{ color: COLORS.onSurfaceVariant }}>{t.exposureHeatmap}</div>
              <ExposureHeatmap
                data={positions.map((p: any) => ({
                  marketId: p.id,
                  marketName: p.symbol,
                  exposure: p.pnl,
                  notional: p.amount * p.buyPrice,
                }))}
              />
            </StitchCard>
            <StitchCard className="p-4">
              <div className="mb-2 text-xs" style={{ color: COLORS.onSurfaceVariant }}>{t.cumulativePnl}</div>
              <PnlSparkline
                values={trades
                  .slice()
                  .sort((a: any, b: any) => a.timestamp - b.timestamp)
                  .reduce((acc: number[], t: any) => {
                    const prev = acc.length > 0 ? acc[acc.length - 1] : 0;
                    acc.push(prev + t.pnl);
                    return acc;
                  }, [])}
                width={300}
                height={100}
              />
            </StitchCard>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6">
            <TerminalLogsWidget />
          </div>
        </div>
      </div>
    </div>
  );
}

export default DashboardPage;
