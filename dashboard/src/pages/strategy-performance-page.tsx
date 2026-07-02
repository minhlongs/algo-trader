/**
 * Strategy Performance Dashboard
 *
 * Displays backtest results from the strategy-performance API.
 * Sortable table, expandable strategy detail with recharts visualisation.
 * FREE tier sees summary table; PRO+ tier gets strategy comparison.
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

/* ------------------------------------------------------------------ */
/*  Types                                                             */
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
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function fmtUsd(n: number): string {
  const abs = Math.abs(n);
  const formatted = abs >= 1000
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

/* ------------------------------------------------------------------ */
/*  Sort header component                                             */
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
    >
      {label}
      {active && <span className="ml-1 text-accent">{dir === 'asc' ? '▲' : '▼'}</span>}
    </th>
  );
}

/* ------------------------------------------------------------------ */
/*  Equity curve chart (recharts bar chart for selected strategy)     */
/* ------------------------------------------------------------------ */

interface EquityCurveChartProps {
  strategy: StrategyResult;
  allStrategies: StrategyResult[];
}

function EquityCurveChart({ strategy, allStrategies }: EquityCurveChartProps) {
  // Build chart data: normalised metrics for the selected strategy vs average of all traded strategies
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

  const COLORS = ['#00E676', '#4A90D9'];

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
              <Cell key={idx} fill={COLORS[0]} />
            ))}
          </Bar>
          <Bar dataKey="Average" radius={[3, 3, 0, 0]}>
            {chartData.map((_entry, idx) => (
              <Cell key={idx} fill={COLORS[1]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Detail card for selected strategy                                  */
/* ------------------------------------------------------------------ */

interface StrategyDetailProps {
  strategy: StrategyResult;
  allStrategies: StrategyResult[];
  onClose: () => void;
}

function StrategyDetailCard({ strategy, allStrategies, onClose }: StrategyDetailProps) {
  const metrics = [
    { label: 'Total Trades', value: String(strategy.total_trades), cls: 'text-white' },
    { label: 'Winning / Losing', value: `${strategy.winning_trades} / ${strategy.losing_trades}`, cls: 'text-white' },
    { label: 'Total PnL', value: fmtUsd(strategy.total_pnl_usd), cls: pnlClass(strategy.total_pnl_usd) },
    { label: 'Avg PnL / Trade', value: fmtUsd(strategy.avg_pnl_per_trade_usd), cls: pnlClass(strategy.avg_pnl_per_trade_usd) },
    { label: 'Best Trade', value: fmtUsd(strategy.best_trade_usd), cls: 'text-profit' },
    { label: 'Worst Trade', value: fmtUsd(strategy.worst_trade_usd), cls: 'text-loss' },
    { label: 'Max Drawdown', value: fmtPercent(strategy.max_drawdown_pct), cls: numClass(strategy.max_drawdown_pct, true) },
    { label: 'Duration (ms)', value: String(strategy.duration_ms), cls: 'text-muted' },
  ];

  return (
    <div className="bg-bg-surface border border-bg-border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-white text-sm font-bold capitalize">{strategy.strategy.replace(/-/g, ' ')}</h3>
        <button
          onClick={onClose}
          className="text-muted hover:text-white text-xs transition-colors min-h-touch min-w-touch"
          aria-label="Close detail"
        >
          ✕
        </button>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {metrics.map((m) => (
          <div key={m.label}>
            <p className="text-muted text-[10px] uppercase tracking-wider">{m.label}</p>
            <p className={`font-mono text-sm font-bold ${m.cls}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div>
        <p className="text-muted text-[10px] uppercase tracking-wider mb-2">Strategy vs Average Benchmark</p>
        <EquityCurveChart strategy={strategy} allStrategies={allStrategies} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page component                                               */
/* ------------------------------------------------------------------ */

export function StrategyPerformancePage() {
  const { fetchApi } = useApiClient();
  const tier = useAuthStore((s) => s.tier);

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
        if (!cancelled) setError('Failed to load strategy performance data.');
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
      // Handle Infinity (profit_factor)
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
    { label: 'Strategy', key: 'strategy' },
    { label: 'Sharpe', key: 'sharpe_ratio' },
    { label: 'Win Rate', key: 'win_rate_pct' },
    { label: 'Total PnL', key: 'total_pnl_usd' },
    { label: 'Profit Factor', key: 'profit_factor' },
    { label: 'Max DD', key: 'max_drawdown_pct' },
    { label: 'Trades', key: 'total_trades' },
  ];

  /* ── Loading state ── */
  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-accent text-2xl font-bold">Strategy Performance</h1>
        <div className="bg-bg-surface border border-bg-border rounded-lg p-8">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-bg-border rounded w-1/3" />
            <div className="h-8 bg-bg-border rounded" />
            <div className="h-8 bg-bg-border rounded" />
            <div className="h-8 bg-bg-border rounded" />
          </div>
        </div>
      </div>
    );
  }

  /* ── Error state ── */
  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-accent text-2xl font-bold">Strategy Performance</h1>
        <div className="bg-bg-surface border border-loss/30 rounded-lg p-8 text-center">
          <p className="text-loss text-sm">Failed to load data.</p>
          <p className="text-muted text-xs mt-1">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 text-xs bg-accent text-bg font-bold px-4 py-2 rounded hover:opacity-90 transition-opacity min-h-touch"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  /* ── Empty state ── */
  if (tradedStrategies.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-accent text-2xl font-bold">Strategy Performance</h1>
        <div className="bg-bg-surface border border-bg-border rounded-lg p-8 text-center">
          <p className="text-muted text-sm">No strategy performance data available.</p>
          <p className="text-muted text-xs mt-1">
            Backtest results will appear here once strategies have been evaluated.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-accent text-2xl font-bold">Strategy Performance</h1>
        {!isProOrAbove && (
          <span className="text-xs text-muted border border-bg-border rounded px-2 py-1">
            FREE tier — summary view. Upgrade to PRO+ for comparison.
          </span>
        )}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-bg-surface border border-bg-border rounded-lg p-4">
          <p className="text-muted text-[10px] uppercase tracking-widest mb-1">Active Strategies</p>
          <p className="text-white font-mono text-lg font-bold">{tradedStrategies.length}</p>
        </div>
        <div className="bg-bg-surface border border-bg-border rounded-lg p-4">
          <p className="text-muted text-[10px] uppercase tracking-widest mb-1">Total Trades</p>
          <p className="text-white font-mono text-lg font-bold">
            {tradedStrategies.reduce((s, r) => s + r.total_trades, 0)}
          </p>
        </div>
        <div className="bg-bg-surface border border-bg-border rounded-lg p-4">
          <p className="text-muted text-[10px] uppercase tracking-widest mb-1">Avg Sharpe</p>
          <p className={`font-mono text-lg font-bold ${numClass(
            tradedStrategies.reduce((s, r) => s + r.sharpe_ratio, 0) / tradedStrategies.length
          )}`}>
            {(tradedStrategies.reduce((s, r) => s + r.sharpe_ratio, 0) / tradedStrategies.length).toFixed(2)}
          </p>
        </div>
        <div className="bg-bg-surface border border-bg-border rounded-lg p-4">
          <p className="text-muted text-[10px] uppercase tracking-widest mb-1">Combined PnL</p>
          <p className={`font-mono text-lg font-bold ${pnlClass(
            tradedStrategies.reduce((s, r) => s + r.total_pnl_usd, 0)
          )}`}>
            {fmtUsd(tradedStrategies.reduce((s, r) => s + r.total_pnl_usd, 0))}
          </p>
        </div>
      </div>

      {/* Strategies table */}
      <div className="bg-bg-surface border border-bg-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-xs">
            <thead className="border-b border-bg-border bg-bg">
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
                {canExpandDetail && <th className="px-3 py-2 text-[10px] uppercase tracking-widest text-muted" />}
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, idx) => (
                <tr
                  key={s.strategy}
                  className={`border-b border-bg-border hover:bg-bg/50 transition-colors ${
                    idx % 2 === 0 ? '' : 'bg-bg/20'
                  } ${
                    selectedStrategy === s.strategy ? 'bg-accent/5' : ''
                  }`}
                >
                  <td className="px-3 py-2 text-white font-medium capitalize whitespace-nowrap">
                    {s.strategy.replace(/-/g, ' ')}
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
                        onClick={() => setSelectedStrategy(
                          selectedStrategy === s.strategy ? null : s.strategy
                        )}
                        className="text-[10px] text-accent hover:text-accent/80 transition-colors min-h-touch min-w-touch"
                        aria-label={selectedStrategy === s.strategy ? 'Collapse' : 'Expand'}
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
        />
      )}

      {selectedStrategy && !selectedStrategyData && (
        <p className="text-muted text-xs">Selected strategy not found in active dataset.</p>
      )}
    </div>
  );
}

export default StrategyPerformancePage;
