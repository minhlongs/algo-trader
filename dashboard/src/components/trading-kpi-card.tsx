/**
 * Trading KPI Card
 *
 * Displays a single numeric KPI with optional Recharts sparkline
 * area chart and trend arrow indicator. Handles loading and error states.
 */
import { AreaChart, Area } from 'recharts';
import { COLORS } from '../lib/stitch-design-tokens';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface TradingKpiCardProps {
  label: string;
  value: string;
  accent?: 'default' | 'profit' | 'loss' | 'warning' | 'muted';
  subLabel?: string;
  /** Percentage change for trend arrow. null/undefined hides arrow. */
  trend?: number | null;
  /** Sparkline data points (mini area chart in corner). */
  sparklineData?: { value: number }[];
  loading?: boolean;
  error?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Accent color map                                                  */
/* ------------------------------------------------------------------ */

const ACCENT_CLASS: Record<
  NonNullable<TradingKpiCardProps['accent']>,
  string
> = {
  default: 'text-white',
  profit: 'text-profit',
  loss: 'text-loss',
  warning: 'text-gold',
  muted: 'text-muted',
};

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export function TradingKpiCard({
  label,
  value,
  accent = 'default',
  subLabel,
  trend,
  sparklineData,
  loading,
  error,
}: TradingKpiCardProps) {
  /* Loading state */
  if (loading) {
    return (
      <div className="bg-bg-surface border border-bg-border rounded-lg p-4 space-y-3">
        <div className="h-3 w-20 bg-bg-border rounded animate-pulse" />
        <div className="h-8 w-full bg-bg-border rounded animate-pulse" />
        <div className="h-3 w-16 bg-bg-border rounded animate-pulse" />
      </div>
    );
  }

  const hasSparkline = !!(sparklineData && sparklineData.length >= 2);
  const trendColor =
    trend !== null && trend !== undefined
      ? trend >= 0
        ? `${COLORS.profit}`
        : `${COLORS.loss}`
      : undefined;

  return (
    <div className="bg-bg-surface border border-bg-border rounded-lg p-4 flex flex-col gap-1 relative overflow-hidden min-h-[96px]">
      <p className="text-muted text-[10px] uppercase tracking-widest">
        {label}
      </p>

      {error ? (
        <p className="text-muted text-lg font-bold font-mono">--/--</p>
      ) : (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`text-2xl font-bold ${ACCENT_CLASS[accent]}`}>
              {value}
            </p>
            {trend !== null && trend !== undefined && trend !== 0 && (
              <span
                className="text-xs font-mono font-semibold"
                style={{ color: trendColor }}
              >
                {trend > 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(1)}%
              </span>
            )}
          </div>

          {subLabel && (
            <p className="text-muted text-xs">{subLabel}</p>
          )}

          {/* Sparkline mini chart */}
          {hasSparkline && (
            <div className="absolute bottom-2 right-2 w-20 h-10 opacity-40">
              <AreaChart
                width={80}
                height={40}
                data={sparklineData}
                margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
              >
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={trendColor ?? '#8892B0'}
                  strokeWidth={1.5}
                  fill={trendColor ?? '#8892B0'}
                  fillOpacity={0.15}
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </div>
          )}
        </>
      )}
    </div>
  );
}
