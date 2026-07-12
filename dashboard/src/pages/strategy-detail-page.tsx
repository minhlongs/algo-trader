/**
 * Strategy Detail Page
 *
 * Shows detailed backtest results, performance chart, and subscribe button
 * for a single marketplace strategy. Route: /app/strategies/:id
 * Stitch redesign: dark fintech, bilingual VN+EN.
 */
import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApiClient } from '../hooks/use-api-client';
import type { MarketplaceStrategy } from '../types/api';
import { BacktestResults } from '../components/backtest-results';
import { PriceChartLightweight } from '../components/price-chart-lightweight';
import type { ChartDataPoint } from '../components/price-chart-lightweight';
import { COLORS } from '../lib/stitch-design-tokens';

/* ------------------------------------------------------------------ */
/* Copy — bilingual VN + EN                                            */
/* ------------------------------------------------------------------ */

const COPY = {
  en: {
    langToggle: 'Tiếng Việt',
    backToMarketplace: '← Back to Marketplace',
    freeStrategy: 'Free Strategy',
    subscribe: 'Subscribe — $',
    perMonth: '/mo',
    noDescription: 'No description provided.',
    backtestSummary: 'Backtest Summary',
    equityCurve: 'Equity Curve (Estimated)',
    additionalDetails: 'Additional Details',
    totalTrades: 'Total Trades',
    riskLevel: 'Risk Level',
    minAllocation: 'Min Allocation',
    maxAllocation: 'Max Allocation',
    backtestHistory: 'Backtest History',
    noBacktestData: 'No backtest data available for this strategy.',
    sharpeRatio: 'Sharpe Ratio',
    maxDrawdown: 'Max Drawdown',
    winRate: 'Win Rate',
    totalPnl: 'Total P&L',
    profitFactor: 'Profit Factor',
    period: 'Period',
    loadingDetails: 'Loading strategy details...',
    notFound: 'Strategy not found',
    failedLoad: 'Failed to load strategy',
  },
  vi: {
    langToggle: 'English',
    backToMarketplace: '← Quay Lại Thị Trường',
    freeStrategy: 'Chiến Lược Miễn Phí',
    subscribe: 'Đăng Ký — $',
    perMonth: '/tháng',
    noDescription: 'Chưa có mô tả.',
    backtestSummary: 'Tóm Tắt Backtest',
    equityCurve: 'Đường Cong Equity (Ước Tính)',
    additionalDetails: 'Chi Tiết Bổ Sung',
    totalTrades: 'Tổng Giao Dịch',
    riskLevel: 'Mức Độ Rủi Ro',
    minAllocation: 'Phân Bổ Tối Thiểu',
    maxAllocation: 'Phân Bổ Tối Đa',
    backtestHistory: 'Lịch Sử Backtest',
    noBacktestData: 'Chưa có dữ liệu backtest cho chiến lược này.',
    sharpeRatio: 'Tỷ Lệ Sharpe',
    maxDrawdown: 'Drawdown Tối Đa',
    winRate: 'Tỷ Lệ Thắng',
    totalPnl: 'Tổng P&L',
    profitFactor: 'Hệ Số Lợi Nhuận',
    period: 'Kỳ',
    loadingDetails: 'Đang tải chi tiết chiến lược...',
    notFound: 'Không tìm thấy chiến lược',
    failedLoad: 'Không thể tải chiến lược',
  },
};

type Lang = 'en' | 'vi';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function fmtUsd(n: number, decimals = 2): string {
  const abs = Math.abs(n);
  const formatted = abs >= 1000
    ? abs.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : abs.toFixed(decimals);
  return (n < 0 ? '-' : '') + '$' + formatted;
}

function pctStr(v: number | null | undefined, decimals = 1): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${(v * 100).toFixed(decimals)}%`;
}

/* ------------------------------------------------------------------ */
/* Detail page                                                         */
/* ------------------------------------------------------------------ */

export function StrategyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { fetchApi } = useApiClient();
  const [lang, setLang] = useState<Lang>('en');
  const t = COPY[lang];

  const [strategy, setStrategy] = useState<MarketplaceStrategy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchApi<MarketplaceStrategy>(`/v1/marketplace/strategies/${encodeURIComponent(id!)}`);
        if (!cancelled) {
          if (data) setStrategy(data);
          else setError(t.notFound);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t.failedLoad);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [id, fetchApi, t.notFound, t.failedLoad]);

  /* ── Loading state ── */
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm" style={{ color: COLORS.onSurfaceVariant }}>
        {t.loadingDetails}
      </div>
    );
  }

  /* ── Error state ── */
  if (error || !strategy) {
    return (
      <div className="p-4 rounded-lg text-sm space-y-3 glass-card">
        <p style={{ color: COLORS.loss }}>{error || t.notFound}</p>
        <button
          onClick={() => navigate('/app/strategies')}
          className="px-3 py-1 rounded text-xs transition-colors"
          style={{ background: 'rgba(255,180,171,0.2)', color: COLORS.loss }}
        >
          {t.backToMarketplace}
        </button>
      </div>
    );
  }

  const bs = strategy.backtestSummary;

  const chartData = useMemo<ChartDataPoint[]>(() => {
    if (!bs || !bs.periodDays || bs.periodDays <= 0) return [];
    const points: ChartDataPoint[] = [];
    const dailyReturn = bs.totalPnlUsd / 10000 / bs.periodDays;
    let equity = 10000;
    const start = new Date();
    start.setDate(start.getDate() - bs.periodDays);
    for (let i = 0; i <= bs.periodDays; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      equity += equity * dailyReturn;
      points.push({
        time: d.toISOString().slice(0, 10),
        value: Math.round(equity * 100) / 100,
      });
    }
    return points;
  }, [bs]);

  const accentColor = (bs?.totalPnlUsd ?? 0) >= 0 ? COLORS.profit : COLORS.loss;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e3e2e2] font-sans">
      {/* Lang toggle */}
      <div className="flex justify-end px-4 sm:px-8 pt-6">
        <button
          onClick={() => setLang((l: Lang) => (l === 'en' ? 'vi' : 'en'))}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#414754] bg-[#121414]/80 text-[#c1c6d7] text-xs hover:border-[#aec6ff] hover:text-[#aec6ff] transition-colors"
          aria-label="Toggle language"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10" />
          </svg>
          {t.langToggle}
        </button>
      </div>

      <div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-8 space-y-6">
        {/* Back button + header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <button
              onClick={() => navigate('/app/strategies')}
              className="text-xs hover:text-white transition-colors mb-2 inline-flex items-center gap-1"
              style={{ color: COLORS.onSurfaceVariant }}
            >
              {t.backToMarketplace}
            </button>
            <h1 className="text-white text-2xl font-bold">{strategy.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span
                className="text-[10px] border px-1.5 py-0.5 rounded"
                style={{ borderColor: COLORS.outline, color: COLORS.onSurfaceVariant }}
              >
                {strategy.category}
              </span>
              {strategy.status && (
                <span
                  className="text-[10px] border px-1.5 py-0.5 rounded"
                  style={{ borderColor: `${COLORS.primary}4D`, color: COLORS.primary }}
                >
                  {strategy.status}
                </span>
              )}
            </div>
          </div>

          {/* Subscribe button */}
          {!strategy.listingPriceUsdMonthly || strategy.listingPriceUsdMonthly === 0 ? (
            <span
              className="text-xs font-bold border px-4 py-2 rounded"
              style={{
                background: `${COLORS.primaryContainer}33`,
                color: COLORS.primary,
                borderColor: `${COLORS.primary}4D`,
              }}
            >
              {t.freeStrategy}
            </span>
          ) : (
            <a
              href="/app/strategies"
              className="text-xs font-bold px-5 py-2.5 rounded hover:opacity-80 transition-opacity inline-block"
              style={{ background: COLORS.primary, color: COLORS.onPrimary }}
            >
              {t.subscribe}{(strategy.listingPriceUsdMonthly / 100).toFixed(2)}{t.perMonth}
            </a>
          )}
        </div>

        {/* Description */}
        <p className="text-sm leading-relaxed" style={{ color: COLORS.onSurfaceVariant }}>
          {strategy.description || t.noDescription}
        </p>

        {/* Backtest Summary */}
        {bs ? (
          <>
            <section className="glass-card p-5">
              <h2 className="text-xs font-semibold mb-3" style={{ color: COLORS.primary }}>{t.backtestSummary}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                {[
                  { label: t.sharpeRatio, value: bs.sharpe?.toFixed(2) ?? '—', accent: (bs.sharpe ?? 0) >= 1 ? 'profit' : 'loss' as const },
                  { label: t.maxDrawdown, value: pctStr(bs.maxDrawdown), accent: ((bs.maxDrawdown ?? 0) < 0.2) ? 'profit' : 'loss' as const },
                  { label: t.winRate, value: pctStr(bs.winRate), accent: ((bs.winRate ?? 0) >= 0.5) ? 'profit' : 'loss' as const },
                  { label: t.totalPnl, value: fmtUsd(bs.totalPnlUsd ?? 0), accent: (bs.totalPnlUsd ?? 0) >= 0 ? 'profit' : 'loss' as const },
                  { label: t.profitFactor, value: bs.profitFactor?.toFixed(2) ?? '—', accent: (bs.profitFactor ?? 0) >= 1 ? 'profit' : 'loss' as const },
                  { label: t.period, value: bs.periodDays ? `${bs.periodDays}d` : '—', accent: 'default' as const },
                ].map((m) => (
                  <div key={m.label} className="flex flex-col gap-1 p-4 rounded-lg" style={{ background: COLORS.surface, border: `1px solid ${COLORS.outline}` }}>
                    <p className="text-[10px] uppercase tracking-widest" style={{ color: COLORS.onSurfaceVariant }}>{m.label}</p>
                    <p className="text-2xl font-bold" style={{ color: m.accent === 'profit' ? COLORS.profit : m.accent === 'loss' ? COLORS.loss : COLORS.onSurface }}>{m.value}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Performance Chart */}
            {chartData.length > 0 && (
              <section className="glass-card p-5">
                <h2 className="text-xs font-semibold mb-3" style={{ color: COLORS.primary }}>{t.equityCurve}</h2>
                <PriceChartLightweight
                  data={chartData}
                  height={280}
                  color={accentColor}
                  title="Simulated Equity Curve"
                />
              </section>
            )}

            {/* Additional metrics */}
            <section className="glass-card p-5">
              <h2 className="text-xs font-semibold mb-3" style={{ color: COLORS.primary }}>{t.additionalDetails}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: t.totalTrades, value: bs.totalTrades ?? '—' },
                  { label: t.riskLevel, value: strategy.riskLevel ?? '—' },
                  { label: t.minAllocation, value: strategy.minAllocationUsd ? fmtUsd(strategy.minAllocationUsd) : '—' },
                  { label: t.maxAllocation, value: strategy.maxAllocationUsd ? fmtUsd(strategy.maxAllocationUsd) : '—' },
                ].map((m) => (
                  <div key={m.label}>
                    <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: COLORS.onSurfaceVariant }}>{m.label}</p>
                    <p className="font-bold text-lg" style={{ color: COLORS.onSurface }}>{m.value}</p>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : (
          <div
            className="text-xs py-8 text-center border border-dashed rounded-lg"
            style={{ color: COLORS.onSurfaceVariant, borderColor: COLORS.outline }}
          >
            {t.noBacktestData}
          </div>
        )}

        {/* Backtest History */}
        {id && (
          <section className="glass-card p-5">
            <h2 className="text-xs font-semibold mb-3" style={{ color: COLORS.primary }}>{t.backtestHistory}</h2>
            <BacktestResults strategyId={id} />
          </section>
        )}
      </div>
    </div>
  );
}

export default StrategyDetailPage;
