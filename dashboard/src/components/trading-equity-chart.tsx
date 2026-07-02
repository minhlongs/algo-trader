/**
 * Trading Equity Curve Chart
 *
 * Recharts AreaChart with gradient fill, period toggle (7d/30d/All),
 * and profit/loss coloring. Handles loading, empty, and error states.
 */
import { useState, useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface EquityDataPoint {
  date: string;
  value: number;
}

interface TradingEquityChartProps {
  data: EquityDataPoint[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

type Period = '7d' | '30d' | 'all';

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export function TradingEquityChart({
  data,
  loading,
  error,
  onRetry,
}: TradingEquityChartProps) {
  const [period, setPeriod] = useState<Period>('7d');

  const filteredData = useMemo(() => {
    if (period === 'all' || data.length === 0) return data;
    const days = period === '7d' ? 7 : 30;
    const cutoff = Date.now() - days * 86_400_000;
    return data.filter((d) => new Date(d.date).getTime() >= cutoff);
  }, [data, period]);

  const isPositive = filteredData.length >= 2
    ? filteredData[filteredData.length - 1].value >= filteredData[0].value
    : true;

  const lineColor = isPositive ? '#00E676' : '#FF4466';
  const gradientId = 'equityGradient';

  /* Loading state */
  if (loading) {
    return (
      <div className="bg-bg-surface border border-bg-border rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-4 w-28 bg-bg-border rounded animate-pulse" />
          <div className="flex gap-2">
            {['7d', '30d', 'All'].map((p) => (
              <div key={p} className="h-6 w-10 bg-bg-border rounded animate-pulse" />
            ))}
          </div>
        </div>
        <div className="h-[200px] w-full bg-bg-border rounded animate-pulse" />
      </div>
    );
  }

  /* Error state */
  if (error) {
    return (
      <div className="bg-bg-surface border border-loss/30 rounded-lg p-6 text-center space-y-3">
        <p className="text-loss text-sm">Failed to load equity data</p>
        <p className="text-muted text-xs">{error}</p>
        <button
          onClick={onRetry}
          className="text-xs bg-accent text-bg font-bold px-4 py-2 rounded hover:opacity-90 transition-opacity"
        >
          Retry
        </button>
      </div>
    );
  }

  /* Empty state */
  if (filteredData.length === 0) {
    return (
      <div className="bg-bg-surface border border-bg-border rounded-lg p-6 text-center">
        <p className="text-muted text-sm">No trading data yet</p>
        <p className="text-muted text-xs mt-1">
          Equity curve will appear once trades are executed.
        </p>
        {data.length > 0 && period !== 'all' && (
          <button
            onClick={() => setPeriod('all')}
            className="mt-2 text-xs text-accent hover:underline"
          >
            Show all data
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-bg-surface border border-bg-border rounded-lg p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h3 className="text-white text-sm font-semibold">Equity Curve</h3>
          <p className="text-[10px] text-muted mt-0.5 font-mono tabular-nums">
            {filteredData.length} data points
            {filteredData.length > 0 && (
              <> &middot; ${filteredData[filteredData.length - 1].value.toFixed(2)}</>
            )}
          </p>
        </div>
        <div className="flex gap-1">
          {(['7d', '30d', 'all'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              aria-pressed={period === p}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                period === p
                  ? 'bg-accent text-white'
                  : 'text-muted hover:text-white hover:bg-bg-border/50'
              }`}
            >
              {p === 'all' ? 'All' : p}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={filteredData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={lineColor} stopOpacity={0.3} />
                <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1E2640" />
            <XAxis
              dataKey="date"
              stroke="#8892B0"
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: string) => {
                const d = new Date(v);
                return `${d.getMonth() + 1}/${d.getDate()}`;
              }}
            />
            <YAxis
              stroke="#8892B0"
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `$${v.toFixed(0)}`}
              domain={['dataMin - 5', 'dataMax + 5']}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#111627',
                border: '1px solid #1E2640',
                borderRadius: '0.5rem',
                fontSize: 12,
                color: '#eee',
              }}
              labelStyle={{ color: '#8892B0' }}
              formatter={(value) => {
                const v = typeof value === 'number' ? value : 0;
                return [`$${v.toFixed(2)}`, 'Equity'];
              }}
              labelFormatter={(label) => {
                const d = typeof label === 'string' ? new Date(label) : null;
                return d
                  ? d.toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : String(label);
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={lineColor}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{ r: 4, fill: lineColor, stroke: '#111627', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
