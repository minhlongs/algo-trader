/**
 * Live Trading Panel — Real-time PnL, positions, strategy health, and risk metrics.
 * Consumes data from Zustand stores populated by WebSocket hooks.
 */
import { useMemo } from 'react';
import { useTradingStore, type Position, type StrategyStatus } from '../stores/trading-store';
import { useDashboardStore } from '../stores/dashboard-store';
import { StitchCard, StitchCardBody, StitchCardHeader } from './ui/stitch-card';
import { StitchStatCard } from './ui/stitch-stat-card';
import { StitchTable } from './ui/stitch-table';
import { StitchBadge } from './ui/stitch-badge';
import { StitchSectionTitle } from './ui/stitch-section-title';
import { COLORS } from '../lib/stitch-design-tokens';
import type { PerformanceMetrics } from '../types/api';

/* ── helpers ────────────────────────────────────────────── */

function fmtUsd(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function pnlColor(n: number): string {
  if (n > 0) return COLORS.profit;
  if (n < 0) return COLORS.loss;
  return COLORS.onSurfaceVariant;
}

function timeSince(ts: string | null): string {
  if (!ts) return 'never';
  const ms = Date.now() - new Date(ts).getTime();
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  return `${Math.floor(ms / 3_600_000)}h ago`;
}

/* ── sub-components ─────────────────────────────────────── */

function PnlSummary({ positions }: { positions: Position[] }) {
  const totalPnl = useMemo(
    () => positions.reduce((sum, p) => sum + p.pnl, 0),
    [positions],
  );

  const openCount = positions.filter((p) => p.status === 'open').length;
  const closedCount = positions.filter((p) => p.status === 'closed').length;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <StitchStatCard
        label="Total P&L"
        value={fmtUsd(totalPnl)}
        tone={totalPnl >= 0 ? 'profit' : 'loss'}
      />
      <StitchStatCard
        label="Open Positions"
        value={String(openCount)}
        tone="primary"
      />
      <StitchStatCard
        label="Closed Today"
        value={String(closedCount)}
        tone="neutral"
      />
      <StitchStatCard
        label="Win Rate"
        value={openCount + closedCount > 0
          ? `${((closedCount / (openCount + closedCount)) * 100).toFixed(1)}%`
          : '—'}
        tone="neutral"
      />
    </div>
  );
}

function PositionsTable({ positions, prices }: { positions: Position[]; prices: Record<string, { bid: number; ask: number }> }) {
  const openPositions = positions.filter((p) => p.status === 'open');

  return (
    <StitchCard className="mb-6">
      <StitchCardHeader>
        <span className="text-sm font-semibold" style={{ color: COLORS.onSurface }}>
          Open Positions
        </span>
        <StitchBadge label={`${openPositions.length} active`} tone="primary" />
      </StitchCardHeader>
      <StitchCardBody className="p-0">
        {openPositions.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm" style={{ color: COLORS.onSurfaceVariant }}>
            No open positions
          </div>
        ) : (
          <StitchTable headers={['Symbol', 'Exchange', 'Entry', 'Current', 'Size', 'P&L', 'Status']}>
            {openPositions.map((pos) => {
              const key = `${pos.buyExchange}:${pos.symbol}`;
              const tick = prices[key];
              const currentPrice = tick ? tick.bid : pos.sellPrice;
              return (
                <tr key={pos.id} className="border-t" style={{ borderColor: `${COLORS.outline}33` }}>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: COLORS.primary }}>
                    {pos.symbol}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: COLORS.onSurfaceVariant }}>
                    {pos.buyExchange} → {pos.sellExchange}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: COLORS.onSurface }}>
                    ${pos.buyPrice.toFixed(4)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: COLORS.onSurface }}>
                    ${currentPrice.toFixed(4)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: COLORS.onSurfaceVariant }}>
                    {pos.amount.toFixed(6)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs font-bold" style={{ color: pnlColor(pos.pnl) }}>
                    {fmtUsd(pos.pnl)}
                  </td>
                  <td className="px-4 py-3">
                    <StitchBadge label="open" tone="profit" />
                  </td>
                </tr>
              );
            })}
          </StitchTable>
        )}
      </StitchCardBody>
    </StitchCard>
  );
}

function StrategyHealthCards({ strategies }: { strategies: StrategyStatus[] }) {
  return (
    <div className="mb-6">
      <StitchSectionTitle title="Strategy Health" eyebrow="Real-Time" />
      {strategies.length === 0 ? (
        <div className="text-sm py-4" style={{ color: COLORS.onSurfaceVariant }}>No strategies loaded</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {strategies.map((s) => {
            const modeTone = s.enabled ? 'profit' : 'neutral';
            return (
              <StitchCard key={s.name}>
                <StitchCardBody>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold truncate" style={{ color: COLORS.onSurface }}>
                      {s.name}
                    </span>
                    <StitchBadge label={s.mode} tone={modeTone} />
                  </div>
                  <div className="space-y-1 text-xs" style={{ color: COLORS.onSurfaceVariant }}>
                    <div className="flex justify-between">
                      <span>Signals</span>
                      <span style={{ color: COLORS.onSurface }}>{s.signalCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Last Signal</span>
                      <span style={{ color: COLORS.onSurface }}>{timeSince(s.lastSignalAt)}</span>
                    </div>
                  </div>
                </StitchCardBody>
              </StitchCard>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RiskMetricsPanel({ metrics }: { metrics: PerformanceMetrics | null }) {
  if (!metrics) {
    return (
      <StitchCard>
        <StitchCardHeader>
          <span className="text-sm font-semibold" style={{ color: COLORS.onSurface }}>Risk Metrics</span>
        </StitchCardHeader>
        <StitchCardBody>
          <div className="text-sm" style={{ color: COLORS.onSurfaceVariant }}>Loading risk data…</div>
        </StitchCardBody>
      </StitchCard>
    );
  }

  const riskItems = [
    { label: 'Max Drawdown', value: `${metrics.maxDrawdown?.toFixed(2) ?? '—'}%` },
    { label: 'Sharpe Ratio', value: metrics.sharpeRatio?.toFixed(3) ?? '—' },
    { label: 'Win Rate', value: `${metrics.winRate?.toFixed(1) ?? '—'}%` },
    { label: 'Best Trade', value: `$${metrics.bestTrade?.toFixed(2) ?? '—'}` },
    { label: 'Worst Trade', value: `$${metrics.worstTrade?.toFixed(2) ?? '—'}` },
  ];

  return (
    <StitchCard>
      <StitchCardHeader>
        <span className="text-sm font-semibold" style={{ color: COLORS.onSurface }}>Risk Metrics</span>
      </StitchCardHeader>
      <StitchCardBody>
        <div className="space-y-3">
          {riskItems.map((item) => (
            <div key={item.label} className="flex justify-between items-center">
              <span className="text-xs" style={{ color: COLORS.onSurfaceVariant }}>{item.label}</span>
              <span className="text-sm font-mono font-bold" style={{ color: COLORS.onSurface }}>{item.value}</span>
            </div>
          ))}
        </div>
      </StitchCardBody>
    </StitchCard>
  );
}

/* ── main component ─────────────────────────────────────── */

export function LiveTradingPanel() {
  const positions = useTradingStore((s) => s.positions);
  const strategies = useTradingStore((s) => s.strategies);
  const prices = useTradingStore((s) => s.prices);
  const botStatus = useTradingStore((s) => s.botStatus);
  const metrics = useDashboardStore((s) => s.metrics);

  return (
    <div className="space-y-2">
      <StitchSectionTitle
        title="Live Trading"
        eyebrow="Dashboard v2"
        action={
          botStatus ? (
            <StitchBadge
              label={botStatus.running ? 'LIVE' : 'STOPPED'}
              tone={botStatus.running ? 'profit' : 'loss'}
            />
          ) : null
        }
      />

      <PnlSummary positions={positions} />
      <PositionsTable positions={positions} prices={prices} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <StrategyHealthCards strategies={strategies} />
        <RiskMetricsPanel metrics={metrics} />
      </div>
    </div>
  );
}
