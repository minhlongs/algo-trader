/**
 * NegRiskScannerPage — Dashboard for Polymarket Negative Risk Arbitrage Scanner
 *
 * Stitch redesign: dark fintech, bilingual VN+EN.
 */

import { useState, useCallback, useEffect } from 'react';
import { COLORS } from '../lib/stitch-design-tokens';
import { useNegRiskScannerStore } from '../stores/neg-risk-scanner-store';

const COPY = {
  en: {
    langToggle: 'Tiếng Việt',
    title: 'Negative Risk Scanner',
    subtitle: 'Polymarket arbitrage opportunities',
    navScanner: 'Scanner',
    navStrategies: 'Strategies',
    navSettings: 'Settings',
    sidebarTitle: 'Neg Risk Scanner',
    thresholdLabel: 'Risk Threshold',
    scanning: 'Scanning...',
    refresh: '↻ Refresh',
    lastScan: 'Last scan',
    sessionStats: 'Session Stats',
    scanned: 'Scanned',
    opportunities: 'Opportunities',
    avgProfit: 'Avg Profit',
    emptyTitle: 'No arbitrage opportunities detected',
    emptyDesc: 'Try lowering the threshold or refreshing',
    colMarket: 'Market',
    colYesAsk: 'YES Ask',
    colNoAsk: 'NO Ask',
    colSum: 'Sum',
    colLockedProfit: 'Locked Profit',
    colAction: 'Action',
    trade: 'Trade',
    arbitrageTitle: 'Arbitrage Opportunities',
    marketsCount: 'markets',
    statOpportunities: 'Opportunities Found',
    statLockedProfit: 'Locked Profit',
    statActiveTrades: 'Active Trades',
  },
  vi: {
    langToggle: 'English',
    title: 'Negative Risk Scanner',
    subtitle: 'Cơ hội arbitrage trên Polymarket',
    navScanner: 'Quét',
    navStrategies: 'Chiến Thuật',
    navSettings: 'Cài Đặt',
    sidebarTitle: 'Neg Risk Scanner',
    thresholdLabel: 'Ngưỡng Rủi Ro',
    scanning: 'Đang quét...',
    refresh: '↻ Làm Mới',
    lastScan: 'Quét lần cuối',
    sessionStats: 'Thống Kê Phiên',
    scanned: 'Đã Quét',
    opportunities: 'Cơ Hội',
    avgProfit: 'Lợi Nhuận TB',
    emptyTitle: 'Không phát hiện cơ hội arbitrage',
    emptyDesc: 'Thử hạ ngưỡng hoặc làm mới lại',
    colMarket: 'Thị Trường',
    colYesAsk: 'YES Ask',
    colNoAsk: 'NO Ask',
    colSum: 'Tổng',
    colLockedProfit: 'Lợi Nhuận',
    colAction: 'Hành Động',
    trade: 'Giao Dịch',
    arbitrageTitle: 'Cơ Hội Arbitrage',
    marketsCount: 'thị trường',
    statOpportunities: 'Cơ Hội Tìm Thấy',
    statLockedProfit: 'Lợi Nhuận',
    statActiveTrades: 'Giao Dịch Đang Hoạt Động',
  },
};

type Lang = 'en' | 'vi';

// ─── Stats Cards ─────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-[${COLORS.surface}]/80 backdrop-blur-xl border border-[${COLORS.outline}] rounded-2xl p-4 transition-all duration-200 hover:border-[${COLORS.primary}]/30">
      <p className="text-[${COLORS.onSurfaceVariant}] text-xs font-medium uppercase tracking-wider mb-1">{label}</p>
      <p className="text-white font-mono font-bold text-2xl">{value}</p>
      {sub && <p className="text-[${COLORS.profit}] text-xs font-mono mt-1">{sub}</p>}
    </div>
  );
}

// ─── Threshold Slider ─────────────────────────────────────────────────────────

function ThresholdControl({
  value,
  onChange,
  t,
}: {
  value: number;
  onChange: (v: number) => void;
  t: typeof COPY['en'];
}) {
  return (
    <div className="space-y-3">
      <label className="text-[${COLORS.onSurfaceVariant}] text-xs font-medium uppercase tracking-wider block">
        {t.thresholdLabel}
      </label>
      <input
        type="range"
        min={0.90}
        max={0.99}
        step={0.01}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-2 bg-[${COLORS.outline}] rounded-lg appearance-none cursor-pointer accent-[${COLORS.primary}]"
        data-testid="threshold-slider"
      />
      <div className="flex justify-between text-[10px] text-[${COLORS.onSurfaceVariant}] font-mono">
        <span>0.90</span>
        <span className="text-[${COLORS.primary}] font-bold">{value.toFixed(2)}</span>
        <span>0.99</span>
      </div>
    </div>
  );
}

// ─── Data Table ──────────────────────────────────────────────────────────────

function OpportunitiesTable({
  opportunities,
  onTrade,
  t,
}: {
  opportunities: Array<{
    id: string;
    market: string;
    yesAsk: number;
    noAsk: number;
    sum: number;
    lockedProfit: number;
  }>;
  onTrade: (id: string) => void;
  t: typeof COPY['en'];
}) {
  if (opportunities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-[${COLORS.onSurfaceVariant}]">
        <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1" viewBox="0 0 24 24" className="mb-3 opacity-30">
          <circle cx="12" cy="12" r="9" />
          <path d="M8 12h8M12 8v8" />
        </svg>
        <p className="text-sm">{t.emptyTitle}</p>
        <p className="text-xs mt-1">{t.emptyDesc}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" data-testid="opportunities-table">
        <thead>
          <tr className="border-b border-[${COLORS.outline}] text-[${COLORS.onSurfaceVariant}] text-xs uppercase tracking-wider">
            <th className="text-left py-3 px-4 font-medium">{t.colMarket}</th>
            <th className="text-right py-3 px-4 font-medium">{t.colYesAsk}</th>
            <th className="text-right py-3 px-4 font-medium">{t.colNoAsk}</th>
            <th className="text-right py-3 px-4 font-medium">{t.colSum}</th>
            <th className="text-right py-3 px-4 font-medium">{t.colLockedProfit}</th>
            <th className="text-center py-3 px-4 font-medium">{t.colAction}</th>
          </tr>
        </thead>
        <tbody>
          {opportunities.map((opp) => (
            <tr
              key={opp.id}
              className="border-b border-[${COLORS.outline}]/50 hover:bg-[${COLORS.surface}]/80 transition-colors"
              data-testid={`opportunity-row-${opp.id}`}
            >
              <td className="py-3 px-4 text-white font-mono text-xs">{opp.market}</td>
              <td className="py-3 px-4 text-right font-mono text-[${COLORS.onSurfaceVariant}]">${opp.yesAsk.toFixed(2)}</td>
              <td className="py-3 px-4 text-right font-mono text-[${COLORS.onSurfaceVariant}]">${opp.noAsk.toFixed(2)}</td>
              <td className="py-3 px-4 text-right font-mono text-[${COLORS.primary}]">{opp.sum.toFixed(3)}</td>
              <td className="py-3 px-4 text-right font-mono text-[${COLORS.profit}]">{(opp.lockedProfit * 100).toFixed(2)}%</td>
              <td className="py-3 px-4 text-center">
                <button
                  onClick={() => onTrade(opp.id)}
                  className="px-3 py-1.5 bg-[${COLORS.primary}]/10 text-[${COLORS.primary}] border border-[${COLORS.primary}]/30 rounded text-xs font-medium hover:bg-[${COLORS.primary}]/20 hover:border-[${COLORS.primary}]/50 transition-all duration-150"
                  data-testid={`trade-btn-${opp.id}`}
                >
                  {t.trade}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export function NegRiskScannerPage() {
  const [lang, setLang] = useState<Lang>('en');
  const [threshold, setThreshold] = useState(0.98);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const t = COPY[lang];

  const opportunities = useNegRiskScannerStore((s) => s.opportunities);
  const stats = useNegRiskScannerStore((s) => s.stats);
  const loading = useNegRiskScannerStore((s) => s.loading);
  const lastRefresh = useNegRiskScannerStore((s) => s.lastRefresh);
  const fetchOpportunities = useNegRiskScannerStore((s) => s.fetchOpportunities);
  const executeTrade = useNegRiskScannerStore((s) => s.executeTrade);

  // Initial fetch
  useEffect(() => {
    fetchOpportunities(threshold);
  }, []);

  const handleRefresh = useCallback(() => {
    fetchOpportunities(threshold);
  }, [threshold, fetchOpportunities]);

  const handleThresholdChange = useCallback(
    (newThreshold: number) => {
      setThreshold(newThreshold);
      fetchOpportunities(newThreshold);
    },
    [fetchOpportunities]
  );

  const handleTrade = useCallback(
    (id: string) => {
      executeTrade(id);
    },
    [executeTrade]
  );

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="min-h-screen bg-[${COLORS.bg}] text-[${COLORS.onSurface}] font-sans">
      {/* Lang toggle */}
      <div className="flex justify-end px-4 sm:px-6 pt-4">
        <button
          onClick={() => setLang((l: Lang) => (l === 'en' ? 'vi' : 'en'))}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[${COLORS.outline}] bg-[${COLORS.surface}]/80 text-[${COLORS.onSurfaceVariant}] text-xs hover:border-[${COLORS.primary}] hover:text-[${COLORS.primary}] transition-colors"
          aria-label="Toggle language"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10" />
          </svg>
          {t.langToggle}
        </button>
      </div>

      <div className="flex h-screen overflow-hidden">
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 w-64 bg-[${COLORS.surface}]/80 backdrop-blur-xl border-r border-[${COLORS.outline}] transform transition-transform duration-300 md:relative md:translate-x-0 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
          }`}
        >
          {/* Sidebar header */}
          <div className="flex items-center justify-between h-14 px-4 border-b border-[${COLORS.outline}]">
            <div>
              <h1 className="text-[${COLORS.primary}] font-bold text-base tracking-tight">CashClaw</h1>
              <p className="text-[${COLORS.onSurfaceVariant}] text-[10px] mt-0.5">{t.sidebarTitle}</p>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="md:hidden p-2 text-[${COLORS.onSurfaceVariant}] hover:text-white"
              aria-label="Close sidebar"
            >
              ✕
            </button>
          </div>

          {/* Controls */}
          <div className="p-4 space-y-6">
            <ThresholdControl value={threshold} onChange={handleThresholdChange} t={t} />

            <div className="space-y-2">
              <button
                onClick={handleRefresh}
                disabled={loading}
                className="w-full py-2.5 bg-[${COLORS.primary}]/10 text-[${COLORS.primary}] border border-[${COLORS.primary}]/30 rounded-lg text-sm font-medium hover:bg-[${COLORS.primary}]/20 hover:border-[${COLORS.primary}]/50 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                data-testid="refresh-btn"
              >
                {loading ? (
                  <>
                    <span className="animate-spin">⟳</span> {t.scanning}
                  </>
                ) : (
                  <>↻ {t.refresh}</>
                )}
              </button>
              {lastRefresh > 0 && (
                <p className="text-[10px] text-[${COLORS.onSurfaceVariant}] text-center">
                  {t.lastScan}: {formatTime(lastRefresh)}
                </p>
              )}
            </div>

            {/* Mini stats */}
            <div className="space-y-2 pt-4 border-t border-[${COLORS.outline}]">
              <p className="text-[${COLORS.onSurfaceVariant}] text-[10px] uppercase tracking-wider">{t.sessionStats}</p>
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-[${COLORS.onSurfaceVariant}]">{t.scanned}</span>
                  <span className="text-white font-mono">{stats.totalScanned}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[${COLORS.onSurfaceVariant}]">{t.opportunities}</span>
                  <span className="text-[${COLORS.primary}] font-mono">{stats.opportunitiesFound}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[${COLORS.onSurfaceVariant}]">{t.avgProfit}</span>
                  <span className="text-[${COLORS.profit}] font-mono">
                    {stats.avgProfit > 0 ? `${(stats.avgProfit * 100).toFixed(2)}%` : '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto flex flex-col min-w-0">
          {/* Mobile header */}
          <header className="sticky top-0 z-30 md:hidden bg-[${COLORS.bg}]/95 backdrop-blur border-b border-[${COLORS.outline}]">
            <div className="flex items-center justify-between h-14 px-4">
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 -ml-2 text-[${COLORS.onSurfaceVariant}] hover:text-white min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Open menu"
              >
                <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
              </button>
              <span className="text-[${COLORS.primary}] font-bold text-base">CashClaw</span>
              <div className="w-10" />
            </div>
          </header>

          {/* Desktop header */}
          <header className="hidden md:flex items-center justify-between h-14 px-6 border-b border-[${COLORS.outline}] bg-[${COLORS.bg}]/80 backdrop-blur">
            <div>
              <h2 className="text-white font-semibold text-lg">{t.title}</h2>
              <p className="text-[${COLORS.onSurfaceVariant}] text-xs">{t.subtitle}</p>
            </div>
            <nav className="flex items-center gap-6 text-sm">
              <span className="text-[${COLORS.primary}] cursor-pointer">{t.navScanner}</span>
              <span className="text-[${COLORS.onSurfaceVariant}] hover:text-white cursor-pointer transition-colors">{t.navStrategies}</span>
              <span className="text-[${COLORS.onSurfaceVariant}] hover:text-white cursor-pointer transition-colors">{t.navSettings}</span>
            </nav>
          </header>

          {/* Content */}
          <div className="flex-1 p-4 md:p-6 space-y-6">
            {/* Stats cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard label={t.statOpportunities} value={stats.opportunitiesFound} />
              <StatCard
                label={t.statLockedProfit}
                value={stats.totalLockedProfit > 0 ? `$${stats.totalLockedProfit.toFixed(2)}` : '$0.00'}
                sub={stats.avgProfit > 0 ? `${(stats.avgProfit * 100).toFixed(2)}% avg` : undefined}
              />
              <StatCard label={t.statActiveTrades} value={stats.activeTrades} />
            </div>

            {/* Table */}
            <div className="bg-[${COLORS.surface}]/80 backdrop-blur-xl border border-[${COLORS.outline}] rounded-2xl">
              <div className="px-4 py-3 border-b border-[${COLORS.outline}] flex items-center justify-between">
                <h3 className="text-white font-medium text-sm">{t.arbitrageTitle}</h3>
                <span className="text-[${COLORS.onSurfaceVariant}] text-xs font-mono">
                  {opportunities.length} {t.marketsCount}
                </span>
              </div>
              <OpportunitiesTable opportunities={opportunities} onTrade={handleTrade} t={t} />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
