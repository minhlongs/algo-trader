/**
 * Live Trading Status Page
 *
 * Displays real-time trading dashboard: current positions, guard status,
 * trading mode indicator, recent trades, equity curve, KPI sparklines,
 * strategy allocation donut, and risk dashboard gauges.
 *
 * Fully responsive: 2-col KPI on mobile, 4-col on desktop.
 * Tables have horizontal scroll on narrow viewports.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTradingStore } from '../stores/trading-store';
import type { Position, TradeRecord } from '../stores/trading-store';
import { useAdminControls } from '../hooks/use-admin-controls';
import { useApiClient } from '../hooks/use-api-client';
import { ConfirmationDialog } from '../components/confirmation-dialog';
import { RiskDashboardGauges } from '../components/risk-dashboard-gauges';
import type { RiskMetric } from '../components/risk-dashboard-gauges';
import { TradingKpiCard } from '../components/trading-kpi-card';
import { TradingEquityChart } from '../components/trading-equity-chart';
import type { EquityDataPoint } from '../components/trading-equity-chart';
import { StrategyAllocationChart } from '../components/strategy-allocation-chart';
import type { AllocationItem } from '../components/strategy-allocation-chart';

/* ── Local types ── */

interface Trade {
  id: string;
  date: string;
  pair: string;
  side: 'BUY' | 'SELL';
  price: number;
  amount: number;
  fee: number;
  pnl: number;
  exchange: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function fmtUsd(n: number, decimals = 2): string {
  const abs = Math.abs(n);
  const formatted = abs >= 1000
    ? abs.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : abs.toFixed(4);
  return (n < 0 ? '-' : '') + '$' + formatted;
}

function pnlClass(v: number): string {
  return v > 0 ? 'text-profit' : v < 0 ? 'text-loss' : 'text-muted';
}

function fmtPercent(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}

/**
 * Compute trend percentage from sequential sparkline data.
 * Compares average of last 3 values vs the prior 3 values.
 * Returns null when fewer than 4 data points are available.
 */
function calcTrend(data: { value: number }[]): number | null {
  if (data.length < 4) return null;
  const recent = data.slice(-3);
  const prior = data.slice(-6, -3);
  const recentAvg = recent.reduce((s, d) => s + d.value, 0) / recent.length;
  const priorAvg = prior.reduce((s, d) => s + d.value, 0) / prior.length;
  if (priorAvg === 0) return recentAvg > 0 ? 100 : recentAvg < 0 ? -100 : 0;
  return ((recentAvg - priorAvg) / Math.abs(priorAvg)) * 100;
}

/* ------------------------------------------------------------------ */
/*  Card component                                                    */
/* ------------------------------------------------------------------ */

interface KpiCardProps {
  label: string;
  value: string;
  accent?: 'default' | 'profit' | 'loss' | 'warning' | 'muted';
  subLabel?: string;
}

function KpiCard({ label, value, accent = 'default', subLabel }: KpiCardProps) {
  const accents: Record<string, string> = {
    default: 'text-white',
    profit: 'text-profit',
    loss: 'text-loss',
    warning: 'text-gold',
    muted: 'text-muted',
  };
  return (
    <div className="bg-bg-surface border border-bg-border rounded-lg p-4 flex flex-col gap-1">
      <p className="text-muted text-[10px] uppercase tracking-widest">{label}</p>
      <p className={`text-2xl font-bold ${accents[accent]}`}>{value}</p>
      {subLabel && <p className="text-muted text-xs">{subLabel}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Mode badge                                                        */
/* ------------------------------------------------------------------ */

function ModeBadge({ mode }: { mode: string }) {
  const isLive = mode === 'live';
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${
        isLive
          ? 'bg-profit/10 border-profit/40 text-profit'
          : 'bg-yellow-400/10 border-yellow-400/40 text-yellow-400'
      }`}
    >
      <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-profit animate-pulse' : 'bg-yellow-400'}`} />
      {isLive ? 'LIVE' : 'PAPER'}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Positions table                                                   */
/* ------------------------------------------------------------------ */

interface PositionRow {
  id: string;
  tokenId: string;
  side: string;
  size: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  symbol: string;
}

function PositionsTable({
  rows,
  closingPositionId,
  onClosePosition,
}: {
  rows: PositionRow[];
  closingPositionId: string | null;
  onClosePosition: (id: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="text-muted text-xs py-8 text-center border border-dashed border-bg-border rounded-lg">
        No open positions
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] sm:min-w-[700px] text-xs">
        <thead className="border-b border-bg-border bg-bg">
          <tr>
            {['Token', 'Side', 'Size', 'Entry', 'Current', 'Unreal. PnL', ''].map((h) => (
              <th key={h} className="px-3 py-2 text-left text-[10px] uppercase tracking-widest text-muted whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const isClosing = closingPositionId === r.id;
            return (
              <tr key={r.id || `${r.tokenId}-${i}`} className="border-b border-bg-border hover:bg-bg/50 transition-colors">
                <td className="px-3 py-2 text-white font-mono">{r.tokenId}</td>
                <td className={`px-3 py-2 font-bold ${r.side === 'BUY' ? 'text-profit' : 'text-loss'}`}>{r.side}</td>
                <td className="px-3 py-2 text-white">{r.size.toFixed(4)}</td>
                <td className="px-3 py-2 text-white font-mono">{fmtUsd(r.entryPrice)}</td>
                <td className="px-3 py-2 text-white font-mono">{fmtUsd(r.currentPrice)}</td>
                <td className={`px-3 py-2 font-bold font-mono ${pnlClass(r.unrealizedPnl)}`}>
                  {r.unrealizedPnl >= 0 ? '+' : ''}{fmtUsd(r.unrealizedPnl)}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => onClosePosition(r.id)}
                    disabled={isClosing}
                    className={`px-2 py-1 rounded text-xs font-bold border transition-colors min-h-touch ${
                      isClosing
                        ? 'bg-bg-border text-muted border-bg-border cursor-not-allowed'
                        : 'bg-loss/10 border-loss/40 text-loss hover:bg-loss/20 hover:border-loss/60'
                    }`}
                    aria-label={`Close position ${r.tokenId}`}
                  >
                    {isClosing ? (
                      <span className="inline-block w-3 h-3 border-2 border-muted border-t-transparent rounded-full animate-spin" />
                    ) : (
                      'Close'
                    )}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Trades table                                                      */
/* ------------------------------------------------------------------ */

interface TradeRow {
  id: string;
  time: string;
  strategy: string;
  side: string;
  symbol: string;
  price: number;
  size: number;
  pnl: number;
  dryRun: boolean;
}

function TradesTable({ rows }: { rows: TradeRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="text-muted text-xs py-8 text-center border border-dashed border-bg-border rounded-lg">
        No trades yet
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] sm:min-w-[700px] text-xs">
        <thead className="border-b border-bg-border bg-bg">
          <tr>
            {['Time', 'Strategy', 'Side', 'Symbol', 'Price', 'Size', 'PnL', 'Mode'].map((h) => (
              <th key={h} className="px-3 py-2 text-left text-[10px] uppercase tracking-widest text-muted whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-bg-border hover:bg-bg/50 transition-colors">
              <td className="px-3 py-2 text-muted whitespace-nowrap">{r.time}</td>
              <td className="px-3 py-2 text-white">{r.strategy}</td>
              <td className={`px-3 py-2 font-bold ${r.side === 'BUY' ? 'text-profit' : 'text-loss'}`}>{r.side}</td>
              <td className="px-3 py-2 text-white font-mono">{r.symbol}</td>
              <td className="px-3 py-2 text-white font-mono">{fmtUsd(r.price)}</td>
              <td className="px-3 py-2 text-white">{r.size.toFixed(4)}</td>
              <td className={`px-3 py-2 font-bold font-mono ${pnlClass(r.pnl)}`}>
                {r.pnl >= 0 ? '+' : ''}{fmtUsd(r.pnl)}
              </td>
              <td className="px-3 py-2">
                {r.dryRun ? (
                  <span className="text-yellow-400 text-[10px]">PAPER</span>
                ) : (
                  <span className="text-profit text-[10px]">LIVE</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page component                                               */
/* ------------------------------------------------------------------ */

export function LiveTradingPage() {
  const { fetchApi } = useApiClient();

  // Store-derived data
  const positions = useTradingStore((s) => s.positions);
  const botStatus = useTradingStore((s) => s.botStatus);
  const storeTrades = useTradingStore((s) => s.trades);
  const strategies = useTradingStore((s) => s.strategies);

  // Admin / guard status
  const { status: adminStatus, loading: adminLoading, refresh: refreshAdmin } = useAdminControls();

  // Close position state
  const [closingPositionId, setClosingPositionId] = useState<string | null>(null);
  const [closedPositionIds, setClosedPositionIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // API trades (for richer journal + equity curve + sparklines)
  const [apiTrades, setApiTrades] = useState<Trade[]>([]);
  const [tradesLoading, setTradesLoading] = useState(false);
  const [tradesError, setTradesError] = useState<string | null>(null);

  // Auto-refresh state
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isStale, setIsStale] = useState(false);

  // Stop bot state
  const [stopDialogOpen, setStopDialogOpen] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [stopError, setStopError] = useState<string | null>(null);

  // Initial trades fetch (original pattern — keeps async test hooks working)
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setTradesLoading(true);
      try {
        const data = await fetchApi<Trade[]>('/trades');
        if (!cancelled && data) setApiTrades(data);
      } finally {
        if (!cancelled) setTradesLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [fetchApi]);

  // Retry handler for equity chart — also tracks error state
  const retryLoadTrades = useCallback(async () => {
    setTradesLoading(true);
    setTradesError(null);
    try {
      const data = await fetchApi<Trade[]>('/trades');
      if (data) {
        setApiTrades(data);
      } else {
        setTradesError('Failed to load trade data');
      }
    } catch {
      setTradesError('Failed to load trade data');
    } finally {
      setTradesLoading(false);
    }
  }, [fetchApi]);

  // Auto-refresh polling
  useEffect(() => {
    if (!autoRefresh) return;

    let active = true;

    async function poll() {
      if (document.hidden) return;
      try {
        await refreshAdmin();
        const data = await fetchApi<Trade[]>('/trades');
        if (!active) return;
        if (data) {
          setApiTrades(data);
          setIsStale(false);
        }
      } catch {
        if (active) setIsStale(true);
      }
    }

    poll();
    const interval = setInterval(poll, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [autoRefresh, refreshAdmin, fetchApi]);

  /* ── Derived ── */

  const mode = botStatus?.mode ?? 'stopped';
  const running = botStatus?.running ?? false;

  // Map existing store positions to the requested position-row shape, excluding manually closed ones
  const positionRows = useMemo<PositionRow[]>(() => {
    return (positions as Position[])
      .filter((p) => p.status === 'open' && !closedPositionIds.has(p.id))
      .map((p) => ({
        id: p.id,
        tokenId: p.symbol,
        side: 'LONG' as string,
        size: p.amount,
        entryPrice: p.buyPrice,
        currentPrice: p.sellPrice || p.buyPrice,
        unrealizedPnl: p.pnl,
        symbol: p.symbol,
      }));
  }, [positions, closedPositionIds]);

  // Map store trades to table rows
  const tradeRows = useMemo<TradeRow[]>(() => {
    return (storeTrades as TradeRecord[])
      .slice(0, 50)
      .map((t) => ({
        id: t.id,
        time: new Date(t.timestamp).toLocaleString('en-US', {
          month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
        }),
        strategy: t.strategy,
        side: t.side,
        symbol: t.symbol,
        price: t.price,
        size: t.size,
        pnl: t.pnl,
        dryRun: t.dryRun,
      }));
  }, [storeTrades]);

  // Guard status
  const circuitBreakerState = adminStatus?.circuitBreaker?.state ?? 'CLOSED';
  const isCircuitOpen = circuitBreakerState === 'OPEN';
  const consecutiveLosses = adminStatus?.drawdown?.isHalted
    ? (adminStatus.drawdown.currentDrawdown > 0.05 ? 3 : 1)
    : 0;

  // Risk metrics for gauges
  const riskMetrics = useMemo<RiskMetric[]>(() => {
    const peakEquity = adminStatus?.drawdown?.peakEquity ?? 0;

    // Daily Loss as % of 5% max (loss is negative dailyPnl)
    const dailyLossVal = botStatus?.dailyPnl != null && botStatus.dailyPnl < 0 && peakEquity > 0
      ? Math.abs(botStatus.dailyPnl) / peakEquity * 100
      : 0;

    // Position size as % of capital
    const totalPositionSize = positionRows.reduce((sum, p) => sum + p.size * p.entryPrice, 0);
    const positionSizeVal = peakEquity > 0 ? totalPositionSize / peakEquity * 100 : 0;

    // Drawdown
    const drawdownVal = adminStatus?.drawdown?.currentDrawdown
      ? adminStatus.drawdown.currentDrawdown * 100
      : 0;
    const maxDrawdownVal = adminStatus?.drawdown?.maxDrawdown
      ? adminStatus.drawdown.maxDrawdown * 100
      : 20;

    // Capital used = max of position size or equity drawdown
    const equityUsed = peakEquity > 0 && adminStatus?.drawdown?.currentEquity != null
      ? (1 - adminStatus.drawdown.currentEquity / peakEquity) * 100
      : 0;
    const capitalUsedVal = Math.max(positionSizeVal, equityUsed);

    return [
      { label: 'Daily Loss', value: Math.round(dailyLossVal * 10) / 10, max: 5, format: 'percent' as const },
      { label: 'Position Size', value: Math.round(positionSizeVal * 10) / 10, max: 20, format: 'percent' as const },
      { label: 'Drawdown', value: Math.round(drawdownVal * 10) / 10, max: Math.round(maxDrawdownVal * 10) / 10, format: 'percent' as const },
      { label: 'Consecutive Losses', value: consecutiveLosses, max: 5, format: 'count' as const },
      { label: 'Capital Used', value: Math.round(capitalUsedVal * 10) / 10, max: 100, format: 'percent' as const },
    ];
  }, [adminStatus, botStatus, positionRows, consecutiveLosses]);

  // Stop bot handler
  const handleStopBot = useCallback(async () => {
    setStopping(true);
    setStopError(null);
    const result = await fetchApi<{ success: boolean }>('/trading/stop', { method: 'POST' });
    if (result?.success) {
      useTradingStore.getState().setBotStatus({
        ...botStatus!,
        running: false,
      });
      setStopDialogOpen(false);
    } else {
      setStopError('Failed to stop bot. Please try again.');
    }
    setStopping(false);
  }, [fetchApi, botStatus]);

  // Close position handler
  const handleClosePosition = useCallback(async (id: string) => {
    if (closingPositionId) return;
    setClosingPositionId(id);
    setToast(null);
    try {
      const position = (positions as Position[]).find((p) => p.id === id);
      if (!position) {
        setToast({ msg: 'Position not found', type: 'error' });
        return;
      }
      const result = await fetchApi<{ success: boolean }>(`/positions/${id}/close`, {
        method: 'POST',
        body: JSON.stringify({
          symbol: position.symbol,
          exchange: position.buyExchange,
          exitPrice: position.sellPrice || position.buyPrice,
        }),
      });
      if (result?.success) {
        setClosedPositionIds((prev) => new Set(prev).add(id));
        setToast({ msg: 'Position closed', type: 'success' });
      } else {
        setToast({ msg: 'Failed to close position', type: 'error' });
      }
    } catch {
      setToast({ msg: 'Failed to close position', type: 'error' });
    } finally {
      setClosingPositionId(null);
    }
  }, [closingPositionId, fetchApi, positions]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  /* ── Equity Curve Data ── */

  const equityData = useMemo<EquityDataPoint[]>(() => {
    if (apiTrades.length === 0) return [];
    const sorted = [...apiTrades].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    let cumulative = 0;
    return sorted.map((t) => {
      cumulative += t.pnl;
      return { date: t.date, value: cumulative };
    });
  }, [apiTrades]);

  /* ── KPI Sparkline Data ── */

  // Daily P&L grouped by day
  const dailyPnlSparkline = useMemo<{ value: number }[]>(() => {
    const byDay = new Map<string, number>();
    for (const t of apiTrades) {
      const day = t.date.split('T')[0];
      byDay.set(day, (byDay.get(day) ?? 0) + t.pnl);
    }
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([_day, pnl]) => ({ value: pnl }));
  }, [apiTrades]);

  // Win rate grouped by day
  const winRateSparkline = useMemo<{ value: number }[]>(() => {
    const byDay = new Map<string, { wins: number; total: number }>();
    for (const t of apiTrades) {
      const day = t.date.split('T')[0];
      const curr = byDay.get(day) ?? { wins: 0, total: 0 };
      curr.total += 1;
      if (t.pnl > 0) curr.wins += 1;
      byDay.set(day, curr);
    }
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([_day, stats]) => ({
        value: stats.total > 0 ? (stats.wins / stats.total) * 100 : 0,
      }));
  }, [apiTrades]);

  // Overall win rate percentage
  const winRate = useMemo(() => {
    if (apiTrades.length === 0) return 0;
    const wins = apiTrades.filter((t) => t.pnl > 0).length;
    return (wins / apiTrades.length) * 100;
  }, [apiTrades]);

  // Open position count
  const openPosCount = useMemo(() => {
    return positions.filter((p) => p.status === 'open').length;
  }, [positions]);

  // Trend values for sparkline cards
  const dailyPnlTrend = useMemo(() => calcTrend(dailyPnlSparkline), [dailyPnlSparkline]);
  const winRateTrend = useMemo(() => calcTrend(winRateSparkline), [winRateSparkline]);

  /* ── Strategy Allocation ── */

  const strategyAllocation = useMemo<AllocationItem[]>(() => {
    const enabled = strategies.filter(
      (s) => s.enabled && s.mode !== 'stopped'
    );
    if (enabled.length === 0) return [];
    // Distribute equally — no per-strategy capital data is available
    const perStrategy = 100 / enabled.length;
    return enabled.map((s) => ({
      name: s.name,
      value: perStrategy,
    }));
  }, [strategies]);

  /* ── Render ── */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <h1 className="text-white text-2xl font-bold">Live Trading</h1>
          <ModeBadge mode={mode} />
        </div>
        <div className="flex items-center gap-2">
          {isStale && <span className="text-gold text-[10px]">stale</span>}
          <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-profit animate-pulse' : 'bg-bg-border'}`} title={autoRefresh ? 'Connected' : 'Paused'} />
          {adminLoading && <span className="text-muted text-xs">Refreshing...</span>}
          <button
            onClick={() => setAutoRefresh((p) => !p)}
            className="text-xs text-muted border border-bg-border px-3 py-1.5 rounded hover:text-white hover:border-muted/50 transition-colors min-h-touch"
          >
            {autoRefresh ? 'Pause' : 'Resume'}
          </button>
          {running && (
            <button
              onClick={() => setStopDialogOpen(true)}
              className="text-xs text-loss font-bold border border-loss/40 px-3 py-1.5 rounded hover:bg-loss/10 transition-colors min-h-touch"
            >
              Stop Bot
            </button>
          )}
          <button
            onClick={refreshAdmin}
            className="text-xs text-muted border border-bg-border px-3 py-1.5 rounded hover:text-white hover:border-muted/50 transition-colors min-h-touch"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Equity Curve + Strategy Allocation — side by side on lg+ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <TradingEquityChart
            data={equityData}
            loading={tradesLoading}
            error={tradesError}
            onRetry={retryLoadTrades}
          />
        </div>
        <div>
          <StrategyAllocationChart
            data={strategyAllocation}
            loading={false}
          />
        </div>
      </div>

      {/* KPI Cards with sparklines — responsive 2-col on mobile, 4-col on desktop */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <TradingKpiCard
          label="Daily P&L"
          value={fmtUsd(botStatus?.dailyPnl ?? 0)}
          accent={(botStatus?.dailyPnl ?? 0) >= 0 ? 'profit' : 'loss'}
          trend={dailyPnlTrend}
          sparklineData={dailyPnlSparkline}
        />
        <TradingKpiCard
          label="Win Rate"
          value={fmtPercent(winRate)}
          accent={winRate >= 50 ? 'profit' : winRate > 0 ? 'warning' : 'loss'}
          trend={winRateTrend}
          sparklineData={winRateSparkline}
        />
        <TradingKpiCard
          label="Open Positions"
          value={String(openPosCount)}
          accent={openPosCount > 0 ? 'profit' : 'muted'}
        />
        <TradingKpiCard
          label="Circuit Breaker"
          value={isCircuitOpen ? 'OPEN' : circuitBreakerState === 'HALF_OPEN' ? 'HALF_OPEN' : 'CLOSED'}
          accent={isCircuitOpen ? 'loss' : circuitBreakerState === 'HALF_OPEN' ? 'warning' : 'profit'}
          subLabel={adminStatus?.circuitBreaker?.reason ?? undefined}
        />
      </div>

      {/* Guard Status Card */}
      <div className="bg-bg-surface border border-bg-border rounded-lg p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard
          label="Bot Status"
          value={running ? 'Running' : 'Stopped'}
          accent={running ? 'profit' : 'loss'}
        />
        <KpiCard
          label="Daily P&L"
          value={fmtUsd(botStatus?.dailyPnl ?? 0)}
          accent={(botStatus?.dailyPnl ?? 0) >= 0 ? 'profit' : 'loss'}
        />
        <KpiCard
          label="Circuit Breaker"
          value={isCircuitOpen ? 'OPEN' : circuitBreakerState === 'HALF_OPEN' ? 'HALF_OPEN' : 'CLOSED'}
          accent={isCircuitOpen ? 'loss' : circuitBreakerState === 'HALF_OPEN' ? 'warning' : 'profit'}
          subLabel={adminStatus?.circuitBreaker?.reason ?? undefined}
        />
        <KpiCard
          label="Consecutive Losses"
          value={String(consecutiveLosses)}
          accent={consecutiveLosses >= 3 ? 'loss' : consecutiveLosses > 0 ? 'warning' : 'profit'}
        />
      </div>

      {/* Risk Dashboard */}
      <section>
        <RiskDashboardGauges metrics={riskMetrics} stale={isStale} />
      </section>

      {/* Bot engine stats */}
      <div className="bg-bg-surface border border-bg-border rounded-lg p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard label="Uptime" value={botStatus ? `${Math.floor(botStatus.uptime / 3600)}h ${Math.floor((botStatus.uptime % 3600) / 60)}m` : '—'} />
        <KpiCard label="Total Signals" value={String(botStatus?.totalSignals ?? '—')} />
        <KpiCard label="Executed Trades" value={String(botStatus?.executedTrades ?? '—')} accent="profit" />
        <KpiCard label="Rejected Trades" value={String(botStatus?.rejectedTrades ?? '—')} accent={(botStatus?.rejectedTrades ?? 0) > 0 ? 'warning' : 'muted'} />
      </div>

      {/* Current Positions */}
      <section>
        <h2 className="text-xs font-semibold text-white mb-3">
          Open Positions ({positionRows.length})
        </h2>
        <div className="bg-bg-surface border border-bg-border rounded-lg overflow-hidden">
          <PositionsTable
            rows={positionRows}
            closingPositionId={closingPositionId}
            onClosePosition={handleClosePosition}
          />
        </div>
      </section>

      {/* Recent Trades */}
      <section>
        <h2 className="text-xs font-semibold text-white mb-3">
          Recent Trades ({tradeRows.length})
          {tradesLoading && <span className="text-muted text-[10px] ml-2 font-normal">syncing...</span>}
          {apiTrades.length > 0 && <span className="text-muted text-[10px] ml-2 font-normal">({apiTrades.length} synced)</span>}
        </h2>
        <div className="bg-bg-surface border border-bg-border rounded-lg overflow-hidden">
          <TradesTable rows={tradeRows} />
        </div>
      </section>

      {/* Toast notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg text-sm font-semibold shadow-lg z-50 transition-opacity ${
            toast.type === 'success'
              ? 'bg-profit/20 border border-profit/40 text-profit'
              : 'bg-loss/20 border border-loss/40 text-loss'
          }`}
          role="alert"
        >
          {toast.msg}
        </div>
      )}

      {/* Stop confirmation dialog */}
      <ConfirmationDialog
        open={stopDialogOpen}
        title="Stop Trading Bot"
        message={
          <>
            <p>Are you sure? This will stop all trading.</p>
            {stopError && (
              <p className="text-loss mt-2 text-xs">{stopError}</p>
            )}
          </>
        }
        confirmLabel={stopping ? 'Stopping...' : 'Stop Bot'}
        variant="danger"
        onConfirm={handleStopBot}
        onCancel={() => {
          setStopDialogOpen(false);
          setStopError(null);
        }}
      />

      {/* Timeline note */}
      <p className="text-muted text-[10px] text-right">
        Data sourced from live bot engine{!autoRefresh ? ' · Auto-refresh PAUSED' : ' · Auto-refreshing every 5s'}
      </p>
    </div>
  );
}

export default LiveTradingPage;
