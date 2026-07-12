/**
 * Strategy Performance Dashboard
 *
 * Displays backtest results from the strategy-performance API.
 * Sortable table, expandable strategy detail with recharts visualisation.
 * FREE tier sees summary table; PRO+ tier gets strategy comparison.
 * Stitch redesign: dark fintech, bilingual VN+EN.
 */
import { useState, useEffect, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { useApiClient } from '../hooks/use-api-client';
import { useAuthStore } from '../stores/auth-store';
import { COLORS } from '../lib/stitch-design-tokens';

/* ------------------------------------------------------------------ */
/* Copy (bilingual VN + EN)                                           */
/* ------------------------------------------------------------------ */

const COPY = {
  en: {
    langToggle: 'Tiếng Việt',
    title: 'Strategy Performance',
    subtitle: 'Backtest results across all configured strategies. Sort by any column or expand a strategy for details.',
    loading: 'Loading strategy performance…',
    retry: 'Retry',
    noData: 'No strategy performance data available.',
    noDataHint: 'Backtest results will appear here once strategies have been evaluated.',
    freeBadge: 'FREE tier — summary view. Upgrade to PRO+ for comparison.',
    colStrategy: 'Strategy',
    colSharpe: 'Sharpe',
    colWinRate: 'Win Rate',
    colPnl: 'Total PnL',
    colProfitFactor: 'Profit Factor',
    colMaxDD: 'Max DD',
    colTrades: 'Trades',
    statActiveStrategies: 'Active Strategies',
    statTotalTrades: 'Total Trades',
    statAvgSharpe: 'Avg Sharpe',
    statCombinedPnl: 'Combined PnL',
    metricTotalTrades: 'Total Trades',
    metricWinLose: 'Winning / Losing',
    metricTotalPnl: 'Total PnL',
    metricAvgPnl: 'Avg PnL / Trade',
    metricBestTrade: 'Best Trade',
    metricWorstTrade: 'Worst Trade',
    metricMaxDrawdown: 'Max Drawdown',
    metricDuration: 'Duration (ms)',
    chartLabel: 'Strategy vs Average Benchmark',
    expand: 'Expand',
    collapse: 'Collapse',
    errorLoad: 'Failed to load data.',
  },
  vi: {
    langToggle: 'English',
    title: 'Hiệu Suất Chiến Lược',
    subtitle: 'Kết quả backtest trên tất cả chiến lược đã cấu hình. Sắp xếp theo cột hoặc mở rộng để xem chi tiết.',
    loading: 'Đang tải hiệu suất chiến lược…',
    retry: 'Thử Lại',
    noData: 'Chưa có dữ liệu hiệu suất chiến lược.',
    noDataHint: 'Kết quả backtest sẽ hiện sau khi các chiến lược được đánh giá.',
    freeBadge: 'Gói FREE — xem tóm tắt. Nâng cấp PRO+ để so sánh.',
    colStrategy: 'Chiến Lược',
    colSharpe: 'Sharpe',
    colWinRate: 'Win Rate',
    colPnl: 'Tổng PnL',
    colProfitFactor: 'Profit Factor',
    colMaxDD: 'Max DD',
    colTrades: 'Giao Dịch',
    statActiveStrategies: 'Chiến Lược Hoạt Động',
    statTotalTrades: 'Tổng Giao Dịch',
    statAvgSharpe: 'Sharpe TB',
    statCombinedPnl: 'PnL Tổng',
    metricTotalTrades: 'Tổng Giao Dịch',
    metricWinLose: 'Thắng / Thua',
    metricTotalPnl: 'Tổng PnL',
    metricAvgPnl: 'PnL / Giao Dịch',
    metricBestTrade: 'Giao Dịch Tốt Nhất',
    metricWorstTrade: 'Giao Dịch Xấu Nhất',
    metricMaxDrawdown: 'Max Drawdown',
    metricDuration: 'Thời Gian (ms)',
    chartLabel: 'So Sánh Chiến Lược & Trung Bình',
    expand: 'Mở Rộng',
    collapse: 'Thu Gọn',
    errorLoad: 'Không tải được dữ liệu.',
  },
};

type Lang = 'en' | 'vi';

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

interface StrategyResult {
  strategy: string;
  sharpe_ratio: number;
  win_rate_pct: number;
  total_pnl_usd: number;
  profit_factor: number;
  max_drawdown_pct: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  avg_pnl_per_trade_usd: number;
  best_trade_usd: number;
  worst_trade_usd: number;
  duration_ms: number;
  status: string;
}

type SortKey = keyof Pick<
  StrategyResult,
  'strategy' | 'sharpe_ratio' | 'win_rate_pct' | 'total_pnl_usd' | 'profit_factor' | 'max_drawdown_pct' | 'total_trades'
>;

type SortDir = 'asc' | 'desc';

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function fmtUsd(n: number): string {
  const abs = Math.abs(n);
  const formatted =
    abs >= 1000
      ? abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : abs.toFixed(2);
  return (n < 0 ? '-' : '') + '$' + formatted;
}

function pnlClass(v: number): string {
  return v > 0 ? 'text-profit' : v < 0 ? 'text-loss' : 'text-muted';
}

function numClass(v: number, invert = false): string {
  if (v === 0) return 'text-muted';
  if (invert) return v < 0 ? 'text-profit' : 'text-loss';
  return v > 0 ? 'text-profit' : 'text-loss';
}

function fmtPercent(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}

function fmtProfitFactor(v: number): string {
  if (v === Infinity) return 'Infinity';
  return v.toFixed(2);
}

function humanizeStrategy(key: string): string {
  return key.replace(/-/g, ' ');
}

/* ------------------------------------------------------------------ */
/* Sort header component                                              */
/* ------------------------------------------------------------------ */

interface SortHeaderProps {
  label: string;
  col: SortKey;
  current: SortKey;
  dir: SortDir;
  onSort: (col: SortKey) => void;
}

function SortHeader({ label, col, current, dir, onSort }: SortHeaderProps) {
  const active = current === col;
  return (
    <th
      onClick={() => onSort(col)}
      className="px-3 py-2 text-left text-[10px] uppercase tracking-widest text-muted cursor-pointer hover:text-accent select-none whitespace-nowrap"
      style={{ color: active ? COLORS.primary : undefined }}
    >
      {label}
      {active && <span className="ml-1" style={{ color: COLORS.primary }}>{dir === 'asc' ? '▲' : '▼'}</span>}
    </th>
  );
}

/* ------------------------------------------------------------------ */
/* Equity curve chart (recharts bar chart for selected strategy)       */
/* ------------------------------------------------------------------ */

interface EquityCurveChartProps {
  strategy: StrategyResult;
  allStrategies: StrategyResult[];
}

function EquityCurveChart({ strategy, allStrategies }: EquityCurveChartProps) {
  const traded = allStrategies.filter((s) => s.total_trades > 0);
  const avg = traded.length > 0
    ? {
        sharpe_ratio: traded.reduce((a, s) => a + s.sharpe_ratio, 0) / traded.length,
        win_rate_pct: traded.reduce((a, s) => a + s.win_rate_pct, 0) / traded.length,
        profit_factor: traded.reduce((a, s) => a + (s.profit_factor === Infinity ? 5 : s.profit_factor), 0) / traded.length,
      }
    : { sharpe_ratio: 0, win_rate_pct: 0, profit_factor: 0 };

  const chartData = [
    {
      name: 'Sharpe',
      [strategy.strategy]: parseFloat(strategy.sharpe_ratio.toFixed(2)),
      Average: parseFloat(avg.sharpe_ratio.toFixed(2)),
    },
    {
      name: 'Win Rate %',
      [strategy.strategy]: parseFloat(strategy.win_rate_pct.toFixed(1)),
      Average: parseFloat(avg.win_rate_pct.toFixed(1)),
    },
    {
      name: 'Profit Factor',
      [strategy.strategy]: strategy.profit_factor === Infinity ? 5 : parseFloat(strategy.profit_factor.toFixed(2)),
      Average: parseFloat(avg.profit_factor.toFixed(2)),
    },
  ];

  const BAR_COLORS: [string, string] = [COLORS.primary, COLORS.loss];

  return (
    <div className="w-full h-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1a1a2e" />
          <XAxis dataKey="name" tick={{ fill: '#888', fontSize: 11 }} />
          <YAxis tick={{ fill: '#888', fontSize: 11 }} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#0f0f1a',
              border: '1px solid #1a1a2e',
              borderRadius: 6,
              fontSize: 12,
              color: '#eee',
            }}
          />
          <Bar dataKey={strategy.strategy} radius={[3, 3, 0, 0]}>
            {chartData.map((_entry, idx) => (
              <Cell key={idx} fill={BAR_COLORS[0]} />
            ))}
          </Bar>
          <Bar dataKey="Average" radius={[3, 3, 0, 0]}>
            {chartData.map((_entry, idx) => (
              <Cell key={idx} fill={BAR_COLORS[1]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Detail card for selected strategy                                  */
/* ------------------------------------------------------------------ */

interface StrategyDetailProps {
  strategy: StrategyResult;
  allStrategies: StrategyResult[];
  onClose: () => void;
  t: typeof COPY.en;
}

function StrategyDetailCard({ strategy, allStrategies, onClose, t }: StrategyDetailProps) {
  const metrics: { label: keyof typeof COPY.en; value: string; cls: string }[] = [
    { label: 'metricTotalTrades', value: String(strategy.total_trades), cls: 'text-white' },
    { label: 'metricWinLose', value: `${strategy.winning_trades} / ${strategy.losing_trades}`, cls: 'text-white' },
    { label: 'metricTotalPnl', value: fmtUsd(strategy.total_pnl_usd), cls: pnlClass(strategy.total_pnl_usd) },
    { label: 'metricAvgPnl', value: fmtUsd(strategy.avg_pnl_per_trade_usd), cls: pnlClass(strategy.avg_pnl_per_trade_usd) },
    { label: 'metricBestTrade', value: fmtUsd(strategy.best_trade_usd), cls: 'text-profit' },
    { label: 'metricWorstTrade', value: fmtUsd(strategy.worst_trade_usd), cls: 'text-loss' },
    { label: 'metricMaxDrawdown', value: fmtPercent(strategy.max_drawdown_pct), cls: numClass(strategy.max_drawdown_pct, true) },
    { label: 'metricDuration', value: String(strategy.duration_ms), cls: 'text-muted' },
  ];

  return (
    <div className="glass-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-white text-sm font-bold capitalize">
          {humanizeStrategy(strategy.strategy)}
        </h3>
        <button
          onClick={onClose}
          className="text-muted hover:text-white text-xs transition-colors min-h-touch min-w-touch"
          style={{ color: COLORS.onSurfaceVariant }}
          aria-label="Close detail"
        >
          ✕
        </button>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {metrics.map((m) => (
          <div key={m.label}>
            <p className="text-muted text-[10px] uppercase tracking-wider">{t[m.label]}</p>
            <p className={`font-mono text-sm font-bold ${m.cls}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div>
        <p className="text-muted text-[10px] uppercase tracking-wider mb-2">{t.chartLabel}</p>
        <EquityCurveChart strategy={strategy} allStrategies={allStrategies} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main page component                                                 */
/* ------------------------------------------------------------------ */

export function StrategyPerformancePage() {
  const { fetchApi } = useApiClient();
  const tier = useAuthStore((s) => s.tier);

  const [lang, setLang] = useState<Lang>('en');
  const t = COPY[lang];

  const [data, setData] = useState<StrategyResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>('total_pnl_usd');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedStrategy, setSelectedStrategy] = useState<string | null>(null);

  const isProOrAbove = tier === 'pro' || tier === 'enterprise';
  const canExpandDetail = isProOrAbove;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchApi<StrategyResult[]>('/v1/strategy-performance');
        if (!cancelled) {
          setData(result ?? []);
        }
      } catch {
        if (!cancelled) setError(t.errorLoad);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [fetchApi]);

  // Filter to only strategies with trades > 0
  const tradedStrategies = useMemo(() => {
    return data.filter((s) => s.total_trades > 0);
  }, [data]);

  // Sort strategies
  const sorted = useMemo(() => {
    return [...tradedStrategies].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const aVal = av === Infinity ? 999999 : (typeof av === 'number' ? av : String(av));
      const bVal = bv === Infinity ? 999999 : (typeof bv === 'number' ? bv : String(bv));
      const cmp = typeof aVal === 'number' && typeof bVal === 'number'
        ? aVal - bVal
        : String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [tradedStrategies, sortKey, sortDir]);

  function handleSort(col: SortKey) {
    if (col === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(col);
      setSortDir('desc');
    }
  }

  const selectedStrategyData = useMemo(() => {
    if (!selectedStrategy) return null;
    return tradedStrategies.find((s) => s.strategy === selectedStrategy) ?? null;
  }, [selectedStrategy, tradedStrategies]);

  const COLS: { label: string; key: SortKey }[] = [
    { label: t.colStrategy, key: 'strategy' },
    { label: t.colSharpe, key: 'sharpe_ratio' },
    { label: t.colWinRate, key: 'win_rate_pct' },
    { label: t.colPnl, key: 'total_pnl_usd' },
    { label: t.colProfitFactor, key: 'profit_factor' },
    { label: t.colMaxDD, key: 'max_drawdown_pct' },
    { label: t.colTrades, key: 'total_trades' },
  ];

  /* ── Loading state ── */
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-[#e3e2e2] font-sans space-y-4">
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
        <h1 className="text-accent text-2xl font-bold" style={{ color: COLORS.primary }}>{t.title}</h1>
        <div className="glass-card p-8">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-bg-border rounded w-1/3" style={{ backgroundColor: COLORS.outline }} />
            <div className="h-8 rounded" style={{ backgroundColor: COLORS.surfaceHigh }} />
            <div className="h-8 rounded" style={{ backgroundColor: COLORS.surfaceHigh }} />
            <div className="h-8 rounded" style={{ backgroundColor: COLORS.surfaceHigh }} />
          </div>
        </div>
      </div>
    );
  }

  /* ── Error state ── */
  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-[#e3e2e2] font-sans space-y-4">
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
        <h1 className="text-accent text-2xl font-bold" style={{ color: COLORS.primary }}>{t.title}</h1>
        <div className="glass-card p-8 text-center" style={{ borderColor: `${COLORS.loss}4D` }}>
          <p className="text-loss text-sm" style={{ color: COLORS.loss }}>{t.errorLoad}</p>
          <p className="text-muted text-xs mt-1" style={{ color: COLORS.onSurfaceVariant }}>{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 text-xs bg-accent text-bg font-bold px-4 py-2 rounded hover:opacity-90 transition-opacity min-h-touch"
            style={{ backgroundColor: COLORS.primary, color: COLORS.bg }}
          >
            {t.retry}
          </button>
        </div>
      </div>
    );
  }

  /* ── Empty state ── */
  if (tradedStrategies.length === 0) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-[#e3e2e2] font-sans space-y-4">
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
        <h1 className="text-accent text-2xl font-bold" style={{ color: COLORS.primary }}>{t.title}</h1>
        <div className="glass-card p-8 text-center">
          <p className="text-muted text-sm" style={{ color: COLORS.onSurfaceVariant }}>{t.noData}</p>
          <p className="text-muted text-xs mt-1" style={{ color: COLORS.onSurfaceVariant }}>{t.noDataHint}</p>
        </div>
      </div>
    );
  }

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
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">{t.title}</h1>
            <p className="text-xs mt-1" style={{ color: COLORS.onSurfaceVariant }}>{t.subtitle}</p>
          </div>
          {!isProOrAbove && (
            <span
              className="text-xs border border-[#414754] rounded px-2 py-1"
              style={{ color: COLORS.onSurfaceVariant }}
            >
              {t.freeBadge}
            </span>
          )}
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="glass-card p-4">
            <p className="text-muted text-[10px] uppercase tracking-widest mb-1" style={{ color: COLORS.onSurfaceVariant }}>
              {t.statActiveStrategies}
            </p>
            <p className="text-white font-mono text-lg font-bold">{tradedStrategies.length}</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-muted text-[10px] uppercase tracking-widest mb-1" style={{ color: COLORS.onSurfaceVariant }}>
              {t.statTotalTrades}
            </p>
            <p className="text-white font-mono text-lg font-bold">
              {tradedStrategies.reduce((s, r) => s + r.total_trades, 0)}
            </p>
          </div>
          <div className="glass-card p-4">
            <p className="text-muted text-[10px] uppercase tracking-widest mb-1" style={{ color: COLORS.onSurfaceVariant }}>
              {t.statAvgSharpe}
            </p>
            <p
              className={`font-mono text-lg font-bold ${numClass(tradedStrategies.reduce((s, r) => s + r.sharpe_ratio, 0) / tradedStrategies.length)}`}
            >
              {(tradedStrategies.reduce((s, r) => s + r.sharpe_ratio, 0) / tradedStrategies.length).toFixed(2)}
            </p>
          </div>
          <div className="glass-card p-4">
            <p className="text-muted text-[10px] uppercase tracking-widest mb-1" style={{ color: COLORS.onSurfaceVariant }}>
              {t.statCombinedPnl}
            </p>
            <p
              className={`font-mono text-lg font-bold ${pnlClass(tradedStrategies.reduce((s, r) => s + r.total_pnl_usd, 0))}`}
            >
              {fmtUsd(tradedStrategies.reduce((s, r) => s + r.total_pnl_usd, 0))}
            </p>
          </div>
        </div>

        {/* Strategies table */}
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-xs">
              <thead className="border-b" style={{ borderColor: COLORS.outline, backgroundColor: COLORS.bg }}>
                <tr>
                  {COLS.map((c) => (
                    <SortHeader
                      key={c.key}
                      label={c.label}
                      col={c.key}
                      current={sortKey}
                      dir={sortDir}
                      onSort={handleSort}
                    />
                  ))}
                  {canExpandDetail && (
                    <th className="px-3 py-2 text-[10px] uppercase tracking-widest text-muted" style={{ color: COLORS.onSurfaceVariant }} />
                  )}
                </tr>
              </thead>
              <tbody>
                {sorted.map((s, idx) => (
                  <tr
                    key={s.strategy}
                    className="border-b transition-colors"
                    style={{
                      borderColor: COLORS.outline,
                      backgroundColor: selectedStrategy === s.strategy
                        ? `${COLORS.primary}0D`
                        : idx % 2 === 0
                          ? COLORS.bg
                          : `${COLORS.bg}cc`,
                    }}
                  >
                    <td className="px-3 py-2 text-white font-medium capitalize whitespace-nowrap">
                      {humanizeStrategy(s.strategy)}
                    </td>
                    <td className={`px-3 py-2 font-mono ${numClass(s.sharpe_ratio)}`}>
                      {s.sharpe_ratio.toFixed(2)}
                    </td>
                    <td className={`px-3 py-2 font-mono ${numClass(s.win_rate_pct)}`}>
                      {s.win_rate_pct.toFixed(1)}%
                    </td>
                    <td className={`px-3 py-2 font-mono ${pnlClass(s.total_pnl_usd)}`}>
                      {fmtUsd(s.total_pnl_usd)}
                    </td>
                    <td className="px-3 py-2 font-mono text-white">
                      {fmtProfitFactor(s.profit_factor)}
                    </td>
                    <td className={`px-3 py-2 font-mono ${numClass(s.max_drawdown_pct, true)}`}>
                      {s.max_drawdown_pct.toFixed(2)}%
                    </td>
                    <td className="px-3 py-2 font-mono text-white">
                      {s.total_trades}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {canExpandDetail && (
                        <button
                          onClick={() => setSelectedStrategy(selectedStrategy === s.strategy ? null : s.strategy)}
                          className="text-[10px] text-accent hover:text-accent/80 transition-colors min-h-touch min-w-touch"
                          style={{ color: COLORS.primary }}
                          aria-label={selectedStrategy === s.strategy ? t.collapse : t.expand}
                        >
                          {selectedStrategy === s.strategy ? '−' : '+'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected strategy detail (PRO+ only) */}
        {selectedStrategyData && canExpandDetail && (
          <StrategyDetailCard
            strategy={selectedStrategyData}
            allStrategies={tradedStrategies}
            onClose={() => setSelectedStrategy(null)}
            t={t}
          />
        )}

        {selectedStrategy && !selectedStrategyData && (
          <p className="text-muted text-xs" style={{ color: COLORS.onSurfaceVariant }}>
            Selected strategy not found in active dataset.
          </p>
        )}
      </div>
    </div>
  );
}

export default StrategyPerformancePage;
