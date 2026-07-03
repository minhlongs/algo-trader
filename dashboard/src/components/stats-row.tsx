/**
 * Stats Row Component - 4 stat cards for dashboard
 * Displays: Total Equity, Open Positions, Today's P&L, Active Strategies
 */
import type { PerformanceMetrics } from '../types/api';

interface StatsRowProps {
  totalEquity?: number;
  openPositions?: number;
  todayPnl?: number;
  activeStrategies?: number;
  metrics?: PerformanceMetrics | null;
}

function formatUsd(n: number): string {
  const abs = Math.abs(n);
  const s = abs >= 1000
    ? abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : abs.toFixed(2);
  return (n < 0 ? '-' : '') + '$' + s;
}

export function StatsRow({ totalEquity, openPositions, todayPnl, activeStrategies, metrics }: StatsRowProps) {
  const pnlValue = todayPnl ?? metrics?.dailyPnl ?? 0;
  const pnlPositive = pnlValue >= 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {/* Total Equity */}
      <div className="bg-bg-surface/80 backdrop-blur-sm border border-bg-border rounded-lg p-4 hover:border-accent/30 transition-all duration-300 group">
        <p className="text-muted text-[10px] uppercase tracking-widest mb-1 font-mono">Total Equity</p>
        <p className="text-xl font-bold text-white font-mono tabular-nums">
          {totalEquity ? formatUsd(totalEquity) : '—'}
        </p>
        <div className="mt-2 h-1 bg-bg-border rounded-full overflow-hidden">
          <div className="h-full bg-accent/60 rounded-full" style={{ width: '75%' }} />
        </div>
      </div>

      {/* Open Positions */}
      <div className="bg-bg-surface/80 backdrop-blur-sm border border-bg-border rounded-lg p-4 hover:border-accent/30 transition-all duration-300 group">
        <p className="text-muted text-[10px] uppercase tracking-widest mb-1 font-mono">Open Positions</p>
        <p className="text-xl font-bold text-white font-mono tabular-nums">
          {openPositions ?? '—'}
        </p>
        <p className="text-[10px] text-muted mt-2 font-mono">Margin Usage: —</p>
      </div>

      {/* Today's P&L */}
      <div className="bg-bg-surface/80 backdrop-blur-sm border border-bg-border rounded-lg p-4 hover:border-accent/30 transition-all duration-300 group">
        <p className="text-muted text-[10px] uppercase tracking-widest mb-1 font-mono">Today's P&L</p>
        <p className={`text-xl font-bold font-mono tabular-nums ${pnlPositive ? 'text-profit' : 'text-loss'}`}>
          {formatUsd(pnlValue)}
        </p>
        <div className="mt-2 flex gap-1">
          <div className={`h-1 flex-1 rounded-full ${pnlPositive ? 'bg-profit/80' : 'bg-loss/80'}`} />
          <div className={`h-1 flex-1 rounded-full ${pnlPositive ? 'bg-profit/60' : 'bg-loss/60'}`} />
          <div className={`h-1 flex-1 rounded-full ${pnlPositive ? 'bg-profit/40' : 'bg-loss/40'}`} />
          <div className="h-1 flex-1 rounded-full bg-bg-border" />
          <div className="h-1 flex-1 rounded-full bg-bg-border" />
        </div>
      </div>

      {/* Active Strategies */}
      <div className="bg-bg-surface/80 backdrop-blur-sm border border-bg-border rounded-lg p-4 hover:border-accent/30 transition-all duration-300 group">
        <p className="text-muted text-[10px] uppercase tracking-widest mb-1 font-mono">Active Strategies</p>
        <p className="text-xl font-bold text-accent font-mono tabular-nums">
          {activeStrategies ?? '—'}
        </p>
        <p className="text-[10px] text-profit mt-2 font-mono">System Health: Optimal</p>
      </div>
    </div>
  );
}
