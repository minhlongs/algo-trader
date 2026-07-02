/**
 * Risk Dashboard Gauges
 *
 * Displays horizontal progress bars for risk metrics:
 * Daily Loss, Position Size, Drawdown, Consecutive Losses, Capital Used.
 * Each gauge includes label, progress bar, value, and status icon.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface RiskMetric {
  label: string;
  value: number;
  max: number;
  format?: 'percent' | 'count' | 'currency' | 'number';
}

export interface RiskDashboardGaugesProps {
  metrics: RiskMetric[];
  loading?: boolean;
  stale?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

type Status = 'safe' | 'warning' | 'danger';

function getStatus(pct: number): Status {
  if (pct > 80) return 'danger';
  if (pct > 50) return 'warning';
  return 'safe';
}

const STATUS_CONFIG: Record<Status, { bg: string; fill: string; icon: string }> = {
  safe: { bg: 'bg-profit/20', fill: 'bg-profit', icon: '✅' },
  warning: { bg: 'bg-gold/20', fill: 'bg-gold', icon: '⚠️' },
  danger: { bg: 'bg-loss/20', fill: 'bg-loss', icon: '❌' },
};

/* ------------------------------------------------------------------ */
/*  Sub-components                                                    */
/* ------------------------------------------------------------------ */

function GaugeRow({ metric }: { metric: RiskMetric }) {
  const pct = metric.max > 0 ? Math.min((metric.value / metric.max) * 100, 100) : 0;
  const status = getStatus(pct);
  const { bg, fill, icon } = STATUS_CONFIG[status];

  let displayValue: string;
  switch (metric.format) {
    case 'percent':
      displayValue = `${metric.value.toFixed(1)}%`;
      break;
    case 'count':
      displayValue = String(metric.value);
      break;
    case 'currency':
      displayValue = `$${metric.value.toFixed(2)}`;
      break;
    default:
      displayValue = `${metric.value.toFixed(1)}`;
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-muted text-[10px] uppercase tracking-widest w-36 shrink-0">
        {metric.label}
      </span>
      <div className={`flex-1 h-4 rounded-full overflow-hidden ${bg}`}>
        <div
          className={`h-full rounded-full transition-all duration-500 ${fill}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-white text-xs font-mono w-16 text-right shrink-0">
        {displayValue}
      </span>
      <span className="text-xs w-6 text-center shrink-0">{icon}</span>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 animate-pulse">
      <div className="h-3 w-36 bg-bg-border rounded shrink-0" />
      <div className="flex-1 h-4 bg-bg-border rounded-full" />
      <div className="h-3 w-16 bg-bg-border rounded shrink-0" />
      <div className="h-3 w-6 bg-bg-border rounded shrink-0" />
    </div>
  );
}

const EMPTY_LABELS = [
  'Daily Loss',
  'Position Size',
  'Drawdown',
  'Consecutive Losses',
  'Capital Used',
];

function EmptyGauge({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-muted text-[10px] uppercase tracking-widest w-36 shrink-0">
        {label}
      </span>
      <div className="flex-1 h-4 bg-bg-surface border border-bg-border rounded-full overflow-hidden">
        <div className="h-full rounded-full bg-bg-border" style={{ width: '0%' }} />
      </div>
      <span className="text-muted text-xs w-16 text-right shrink-0">0%</span>
      <span className="text-xs w-6 text-center shrink-0">{'✅'}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                    */
/* ------------------------------------------------------------------ */

export function RiskDashboardGauges({ metrics, loading = false, stale = false }: RiskDashboardGaugesProps) {
  const isEmpty = metrics.length === 0;

  return (
    <div className="bg-bg-surface border border-bg-border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-white">Risk Dashboard</h3>
        {stale && (
          <span className="text-gold text-[10px] font-medium">stale data</span>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : isEmpty ? (
        <div className="space-y-3">
          {EMPTY_LABELS.map((label) => (
            <EmptyGauge key={label} label={label} />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {metrics.map((metric, i) => (
            <GaugeRow key={i} metric={metric} />
          ))}
        </div>
      )}
    </div>
  );
}

export default RiskDashboardGauges;
