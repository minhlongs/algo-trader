/**
 * Strategy Performance Grid — Visual grid of strategy cards.
 * Click to expand with detailed metrics. Color-coded by profitability.
 */
import { useState, useMemo } from 'react';
import { useTradingStore } from '../stores/trading-store';
import { StitchCard, StitchCardBody } from './ui/stitch-card';
import { StitchBadge } from './ui/stitch-badge';
import { StitchSectionTitle } from './ui/stitch-section-title';
import { COLORS } from '../lib/stitch-design-tokens';

/* ── types ──────────────────────────────────────────────── */

interface StrategyDetail {
  name: string;
  enabled: boolean;
  mode: string;
  signalCount: number;
  winRate: number;
  totalPnl: number;
  lastSignalAt: string | null;
}

/* ── helpers ────────────────────────────────────────────── */

function statusTone(strategy: StrategyDetail): 'profit' | 'loss' | 'warning' | 'neutral' {
  if (!strategy.enabled) return 'neutral';
  if (strategy.totalPnl > 0) return 'profit';
  if (strategy.totalPnl < 0) return 'loss';
  return 'warning';
}

function fmtPnl(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function timeSince(ts: string | null): string {
  if (!ts) return 'never';
  const ms = Date.now() - new Date(ts).getTime();
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  return `${Math.floor(ms / 3_600_000)}h ago`;
}

/* ── strategy card ──────────────────────────────────────── */

function StrategyCard({
  strategy,
  expanded,
  onToggle,
}: {
  strategy: StrategyDetail;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <StitchCard onClick={onToggle}>
      {/* compact view */}
      <StitchCardBody>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold truncate max-w-[70%]" style={{ color: COLORS.onSurface }}>
            {strategy.name}
          </span>
          <StitchBadge label={strategy.mode} tone={statusTone(strategy)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider" style={{ color: COLORS.onSurfaceVariant }}>
              Win Rate
            </div>
            <div className="text-lg font-mono font-bold" style={{ color: COLORS.onSurface }}>
              {strategy.winRate > 0 ? `${strategy.winRate.toFixed(1)}%` : '—'}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider" style={{ color: COLORS.onSurfaceVariant }}>
              Total P&L
            </div>
            <div className="text-lg font-mono font-bold" style={{ color: strategy.totalPnl >= 0 ? COLORS.profit : COLORS.loss }}>
              {fmtPnl(strategy.totalPnl)}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-3">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: strategy.enabled ? COLORS.profit : COLORS.onSurfaceVariant }}
          />
          <span className="text-[10px]" style={{ color: COLORS.onSurfaceVariant }}>
            {strategy.enabled ? 'Active' : 'Inactive'} · {strategy.signalCount} signals
          </span>
        </div>
      </StitchCardBody>

      {/* expanded detail */}
      {expanded && (
        <div
          className="border-t px-6 py-4 space-y-2 text-xs"
          style={{ borderColor: `${COLORS.outline}33`, backgroundColor: `${COLORS.bg}33` }}
        >
          <div className="flex justify-between">
            <span style={{ color: COLORS.onSurfaceVariant }}>Last Signal</span>
            <span className="font-mono" style={{ color: COLORS.onSurface }}>
              {timeSince(strategy.lastSignalAt)}
            </span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: COLORS.onSurfaceVariant }}>Win Rate</span>
            <span className="font-mono" style={{ color: COLORS.onSurface }}>
              {strategy.winRate.toFixed(1)}%
            </span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: COLORS.onSurfaceVariant }}>Total P&L</span>
            <span className="font-mono font-bold" style={{ color: strategy.totalPnl >= 0 ? COLORS.profit : COLORS.loss }}>
              {fmtPnl(strategy.totalPnl)}
            </span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: COLORS.onSurfaceVariant }}>Signal Count</span>
            <span className="font-mono" style={{ color: COLORS.onSurface }}>
              {strategy.signalCount}
            </span>
          </div>
        </div>
      )}
    </StitchCard>
  );
}

/* ── main component ─────────────────────────────────────── */

export function StrategyPerformanceGrid() {
  const strategies = useTradingStore((s) => s.strategies);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  // Map raw strategies into enriched detail (win rate and PnL from trades if available)
  const details: StrategyDetail[] = useMemo(() => {
    return strategies.map((s) => ({
      name: s.name,
      enabled: s.enabled,
      mode: s.mode,
      signalCount: s.signalCount,
      winRate: 0, // populated from backend metrics if available
      totalPnl: 0,
      lastSignalAt: s.lastSignalAt,
    }));
  }, [strategies]);

  const toggle = (idx: number) => {
    setExpandedIdx((prev) => (prev === idx ? null : idx));
  };

  return (
    <div>
      <StitchSectionTitle
        title="Strategy Performance"
        eyebrow="Overview"
        action={
          <StitchBadge
            label={`${details.filter((d) => d.enabled).length} active`}
            tone="profit"
          />
        }
      />

      {details.length === 0 ? (
        <div className="text-sm py-8 text-center" style={{ color: COLORS.onSurfaceVariant }}>
          No strategies available
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {details.map((s, idx) => (
            <StrategyCard
              key={s.name}
              strategy={s}
              expanded={expandedIdx === idx}
              onToggle={() => toggle(idx)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
