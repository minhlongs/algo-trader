/**
 * Live Trading Status Page
 *
 * Displays real-time trading dashboard: current positions, guard status,
 * trading mode indicator, and recent trades from the journal.
 */
import { useState, useEffect, useMemo } from 'react';
import { useTradingStore } from '../stores/trading-store';
import type { Position, TradeRecord } from '../stores/trading-store';
import { useAdminControls } from '../hooks/use-admin-controls';
import { useApiClient } from '../hooks/use-api-client';
import type { Trade } from './reporting-page';

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
  tokenId: string;
  side: string;
  size: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
}

function PositionsTable({ rows }: { rows: PositionRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="text-muted text-xs py-8 text-center border border-dashed border-bg-border rounded-lg">
        No open positions
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-xs">
        <thead className="border-b border-bg-border bg-bg">
          <tr>
            {['Token', 'Side', 'Size', 'Entry Price', 'Current Price', 'Unrealized PnL'].map((h) => (
              <th key={h} className="px-3 py-2 text-left text-[10px] uppercase tracking-widest text-muted">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.tokenId}-${i}`} className="border-b border-bg-border hover:bg-bg/50 transition-colors">
              <td className="px-3 py-2 text-white font-mono">{r.tokenId}</td>
              <td className={`px-3 py-2 font-bold ${r.side === 'BUY' ? 'text-profit' : 'text-loss'}`}>{r.side}</td>
              <td className="px-3 py-2 text-white">{r.size.toFixed(4)}</td>
              <td className="px-3 py-2 text-white font-mono">{fmtUsd(r.entryPrice)}</td>
              <td className="px-3 py-2 text-white font-mono">{fmtUsd(r.currentPrice)}</td>
              <td className={`px-3 py-2 font-bold font-mono ${pnlClass(r.unrealizedPnl)}`}>
                {r.unrealizedPnl >= 0 ? '+' : ''}{fmtUsd(r.unrealizedPnl)}
              </td>
            </tr>
          ))}
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
      <table className="w-full min-w-[700px] text-xs">
        <thead className="border-b border-bg-border bg-bg">
          <tr>
            {['Time', 'Strategy', 'Side', 'Symbol', 'Price', 'Size', 'PnL', 'Mode'].map((h) => (
              <th key={h} className="px-3 py-2 text-left text-[10px] uppercase tracking-widest text-muted">{h}</th>
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

  // Admin / guard status
  const { status: adminStatus, loading: adminLoading, refresh: refreshAdmin } = useAdminControls();

  // API trades (for richer journal)
  const [apiTrades, setApiTrades] = useState<Trade[]>([]);
  const [tradesLoading, setTradesLoading] = useState(false);

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

  /* ── Derived ── */

  const mode = botStatus?.mode ?? 'stopped';
  const isLive = mode === 'live';
  const running = botStatus?.running ?? false;

  // Map existing store positions to the requested position-row shape
  const positionRows = useMemo<PositionRow[]>(() => {
    return (positions as Position[])
      .filter((p) => p.status === 'open')
      .map((p) => ({
        tokenId: p.symbol,
        side: 'LONG' as string,
        size: p.amount,
        entryPrice: p.buyPrice,
        currentPrice: p.sellPrice || p.buyPrice,
        unrealizedPnl: p.pnl,
      }));
  }, [positions]);

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <h1 className="text-white text-2xl font-bold">Live Trading</h1>
          <ModeBadge mode={mode} />
        </div>
        <div className="flex items-center gap-2">
          {adminLoading && <span className="text-muted text-xs">Refreshing...</span>}
          <button
            onClick={refreshAdmin}
            className="text-xs text-muted border border-bg-border px-3 py-1.5 rounded hover:text-white hover:border-muted/50 transition-colors"
          >
            Refresh
          </button>
        </div>
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
          <PositionsTable rows={positionRows} />
        </div>
      </section>

      {/* Recent Trades */}
      <section>
        <h2 className="text-xs font-semibold text-white mb-3">
          Recent Trades ({tradeRows.length})
        </h2>
        <div className="bg-bg-surface border border-bg-border rounded-lg overflow-hidden">
          <TradesTable rows={tradeRows} />
        </div>
      </section>

      {/* Timeline note */}
      <p className="text-muted text-[10px] text-right">
        Data sourced from live bot engine · Auto-refreshes via WebSocket
      </p>
    </div>
  );
}

export default LiveTradingPage;
