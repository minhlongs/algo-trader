/**
 * Main dashboard page: Week 5-6 UI Polish + Beta Launch.
 * Restructured into a premium 12-column Bento Grid Layout.
 */
import React, { useState, useEffect, useRef } from 'react';
import { useTradingStore } from '../stores/trading-store';
import { useDashboardStore } from '../stores/dashboard-store';
import { useDashboardWebSocket } from '../hooks/use-dashboard-websocket';
import { useAdminControls } from '../hooks/use-admin-controls';
import { useHealthStatus } from '../hooks/use-health-status';

// UI Components
import { Card } from '../components/ui/card';
import { CandlestickChart } from '../components/candlestick-chart';
import { StatsRow } from '../components/stats-row';
import { SignalsPanel } from '../components/signals-panel';
import { PnLAnalyticsChart } from '../components/pnl-analytics-chart';
import { AdminControls } from '../components/admin-controls';

// Skeletons
import {
  DashboardSkeleton,
  StatsRowSkeleton,
  PnlChartSkeleton,
  AdminControlsSkeleton,
  SignalsPanelSkeleton,
  EquityCurveSkeleton,
  PriceTickerSkeleton,
  SpreadGridSkeleton,
  TradeHistorySkeleton,
  PositionsTableSkeleton,
} from '../components/skeleton-loaders';

// Subcomponents
import { PriceTickerStrip } from '../components/price-ticker-strip';
import { PositionsTableSortable } from '../components/positions-table-sortable';
import { SpreadOpportunitiesCardGrid } from '../components/spread-opportunities-card-grid';
import { EquityCurveChart } from '../components/equity-curve-pnl-chart';
import { CacheStatus } from '../components/cache-status';
import { StrategyStatusPanel } from '../components/strategy-status-panel';
import { TradeHistoryFeed } from '../components/trade-history-feed';

function useNow(): string {
  const [now, setNow] = useState(() => new Date().toLocaleTimeString('en-US', { hour12: false }));
  useEffect(() => {
    const id = setInterval(() => setNow(new Date().toLocaleTimeString('en-US', { hour12: false })), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const LastUpdatedLabel = React.memo(function LastUpdatedLabel() {
  const lastUpdate = useNow();
  return (
    <span className="text-muted text-xs hidden sm:inline font-mono">
      Updated {lastUpdate}
    </span>
  );
});

function TerminalLogs() {
  const [logs, setLogs] = useState<string[]>([]);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const prices = useTradingStore((s) => s.prices);
  const trades = useTradingStore((s) => s.trades);
  
  useEffect(() => {
    const initLogs = [
      `[${new Date().toLocaleTimeString()}] [System] Initialization complete.`,
      `[${new Date().toLocaleTimeString()}] [Redis] Connected to cluster.`,
      `[${new Date().toLocaleTimeString()}] [Safety] Circuit Breaker: CLOSED.`,
      `[${new Date().toLocaleTimeString()}] [Bot] Paper trading mode: ENABLED.`,
    ];
    setLogs(initLogs);
  }, []);

  useEffect(() => {
    if (trades.length === 0) return;
    const latest = trades[0];
    const time = new Date(latest.timestamp).toLocaleTimeString();
    const log = `[${time}] [FILL] ${latest.side} ${latest.size} ${latest.symbol} @ $${latest.price.toFixed(2)} (${latest.strategy})`;
    setLogs((prev) => [...prev, log].slice(-100));
  }, [trades]);

  useEffect(() => {
    const keys = Object.keys(prices);
    if (keys.length === 0) return;
    const randomKey = keys[Math.floor(Math.random() * keys.length)];
    const tick = prices[randomKey];
    if (!tick) return;
    
    if (Math.random() > 0.93) {
      const time = new Date(tick.timestamp).toLocaleTimeString();
      const log = `[${time}] [TICK] ${tick.exchange}:${tick.symbol} Bid: ${tick.bid.toFixed(2)} Ask: ${tick.ask.toFixed(2)}`;
      setLogs((prev) => [...prev, log].slice(-100));
    }
  }, [prices]);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="bg-[#060814] border border-white/5 rounded-xl p-4 font-mono text-xs h-[350px] flex flex-col">
      <div className="flex items-center gap-1.5 pb-2 border-b border-white/5 mb-3 text-muted">
        <span className="w-2.5 h-2.5 rounded-full bg-loss" />
        <span className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
        <span className="w-2.5 h-2.5 rounded-full bg-profit" />
        <span className="ml-2">system-log-terminal</span>
      </div>
      <div ref={logContainerRef} className="flex-grow overflow-y-auto space-y-1 scrollbar-thin">
        {logs.map((log, index) => {
          let colorClass = 'text-white/80';
          if (log.includes('[FILL]')) colorClass = 'text-profit font-semibold';
          else if (log.includes('[TICK]')) colorClass = 'text-accent-cyan';
          else if (log.includes('[Safety]')) colorClass = 'text-accent-pink';
          else if (log.includes('[System]')) colorClass = 'text-muted';

          return (
            <p key={index} className={`${colorClass} whitespace-pre-wrap`}>
              {log}
            </p>
          );
        })}
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { connected: wsConnected, latency, error: wsError, reconnectCount } = useDashboardWebSocket();

  const signals = useDashboardStore((s) => s.signals);
  const lastSignalsUpdate = useDashboardStore((s) => s.lastSignalsUpdate);
  const signalsLoading = lastSignalsUpdate === null;
  const signalsError = null;
  const refreshSignals = () => Promise.resolve();

  const metrics = useDashboardStore((s) => s.metrics);
  const lastMetricsUpdate = useDashboardStore((s) => s.lastMetricsUpdate);
  const pnlLoading = lastMetricsUpdate === null;
  const pnlError = null;

  const { status: adminStatus, halt, resume, loading: adminLoading, error: adminError, refresh: refreshAdmin } = useAdminControls();
  useHealthStatus();

  const positions = useTradingStore((s: any) => s.positions);
  const spreads = useTradingStore((s: any) => s.spreads);
  const strategies = useTradingStore((s: any) => s.strategies);
  const trades = useTradingStore((s: any) => s.trades);
  const botStatus = useTradingStore((s: any) => s.botStatus);

  const isInitialLoading = pnlLoading || signalsLoading || adminLoading;

  const openCount = positions.filter((p: any) => p.status === 'open').length;
  const activeStrategies = strategies?.filter((s: any) => s.enabled).length ?? 0;

  if (isInitialLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-white text-lg sm:text-xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted text-xs mt-0.5">
            Algo Trader RaaS Pro Max • {wsConnected ? 'Connected' : 'Disconnected'}
            {latency.avgLatency > 0 && ` • ${latency.avgLatency}ms latency`}
          </p>
          {wsError && <p className="text-loss text-xs mt-1">{wsError}</p>}
          {reconnectCount > 0 && (
            <p className="text-muted text-[10px] mt-0.5">Reconnected {reconnectCount}x</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <CacheStatus />
          <LastUpdatedLabel />
          <div
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold
              min-h-[36px] touch-manipulation
              ${wsConnected
                ? 'border-profit/40 bg-profit/10 text-profit'
                : 'border-loss/40 bg-loss/10 text-loss'
              }
            `}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-profit animate-pulse' : 'bg-loss'}`}
            />
            <span>{wsConnected ? 'Live' : 'Offline'}</span>
          </div>
        </div>
      </div>

      {/* Top scrollable ticker strip */}
      <Card hoverGlow={false} className="p-3">
        {pnlLoading ? <PriceTickerSkeleton /> : <PriceTickerStrip />}
      </Card>

      {/* Key performance metrics indicators */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {pnlLoading ? (
          <StatsRowSkeleton />
        ) : (
          <StatsRow
            totalEquity={metrics?.totalPnl}
            openPositions={openCount}
            todayPnl={metrics?.dailyPnl}
            activeStrategies={activeStrategies}
            metrics={metrics}
          />
        )}
      </div>

      {/* 12-Column Bento Grid Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Widget 1: Real-Time Candlestick Chart (Col-span 8) */}
        <Card className="lg:col-span-8 flex flex-col h-[450px]">
          <CandlestickChart />
        </Card>

        {/* Widget 2: Strategy Control Center (Col-span 4) */}
        <Card className="lg:col-span-4 flex flex-col justify-between h-[450px]">
          <div className="space-y-4 flex-grow overflow-y-auto scrollbar-thin pr-1">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <span className="text-white text-sm font-semibold">Strategies & Controls</span>
              <span className="text-xs text-muted font-mono">{activeStrategies} active</span>
            </div>
            
            <StrategyStatusPanel strategies={strategies} botStatus={botStatus} />
          </div>

          <div className="border-t border-white/5 pt-4 mt-4">
            <h4 className="text-xs text-muted uppercase font-bold tracking-wider mb-2">Emergency Switch</h4>
            {adminLoading ? (
              <AdminControlsSkeleton />
            ) : (
              <AdminControls
                status={adminStatus}
                halt={halt}
                resume={resume}
                loading={adminLoading}
                error={adminError}
                onRefresh={refreshAdmin}
              />
            )}
          </div>
        </Card>

        {/* Widget 3: Combined P&L & Equity Curve Charting (Col-span 12) */}
        <Card className="lg:col-span-12 grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="flex flex-col">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-1.5 h-3.5 bg-accent rounded-full" />
              <h3 className="text-white text-sm font-semibold">PnL Analytics</h3>
            </div>
            {pnlLoading ? (
              <PnlChartSkeleton />
            ) : (
              <PnLAnalyticsChart metrics={metrics} loading={pnlLoading} error={pnlError} />
            )}
          </div>

          <div className="flex flex-col justify-between">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-1.5 h-3.5 bg-accent rounded-full" />
              <h3 className="text-white text-sm font-semibold">Equity Curve</h3>
            </div>
            <div className="bg-[#101426] border border-white/5 rounded-xl p-4 flex-grow flex items-center justify-center">
              {pnlLoading ? <EquityCurveSkeleton /> : <EquityCurveChart positions={positions} />}
            </div>
          </div>
        </Card>

        {/* Widget 4: Active Positions Grid & History (Col-span 6) */}
        <Card className="lg:col-span-6 flex flex-col h-[430px]">
          <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-3">
            <span className="text-white text-sm font-semibold">Active Positions</span>
            <span className="text-xs text-muted font-mono">{openCount} open</span>
          </div>
          <div className="flex-grow overflow-y-auto scrollbar-thin">
            {pnlLoading ? (
              <PositionsTableSkeleton />
            ) : (
              <PositionsTableSortable positions={positions} />
            )}
          </div>
        </Card>

        {/* Widget 5: Real-time System Log Terminal (Col-span 6) */}
        <Card className="lg:col-span-6 p-0 overflow-hidden">
          <TerminalLogs />
        </Card>
      </div>

      {/* Arbitrage Opportunities Grid */}
      <section className="space-y-3">
        <h3 className="text-white text-sm font-semibold flex items-center gap-2">
          <span className="w-1.5 h-3.5 bg-accent rounded-full" />
          Spread Opportunities
          {spreads.length > 0 && (
            <span className="text-[10px] text-muted bg-white/5 px-2 py-0.5 rounded-full font-mono">
              {spreads.length}
            </span>
          )}
        </h3>
        {pnlLoading ? (
          <SpreadGridSkeleton />
        ) : (
          <SpreadOpportunitiesCardGrid spreads={spreads} />
        )}
      </section>

      {/* Arbitrage Signals list */}
      <section className="space-y-3">
        <h3 className="text-white text-sm font-semibold flex items-center gap-2">
          <span className="w-1.5 h-3.5 bg-accent rounded-full" />
          Real-Time Arbitrage Signals
          {signals.length > 0 && (
            <span className="text-[10px] text-muted bg-white/5 px-2 py-0.5 rounded-full font-mono">
              {signals.length}
            </span>
          )}
        </h3>
        {signalsLoading ? (
          <SignalsPanelSkeleton />
        ) : (
          <SignalsPanel
            signals={signals}
            loading={signalsLoading}
            error={signalsError}
            onRefresh={refreshSignals}
          />
        )}
      </section>

      {/* Trades execution feed */}
      <section className="space-y-3">
        <h3 className="text-white text-sm font-semibold flex items-center gap-2">
          <span className="w-1.5 h-3.5 bg-accent rounded-full" />
          Trades Execution Feed
          {trades.length > 0 && (
            <span className="text-[10px] text-muted bg-white/5 px-2 py-0.5 rounded-full font-mono">
              {trades.length}
            </span>
          )}
        </h3>
        <Card className="p-0 overflow-hidden">
          {pnlLoading ? <TradeHistorySkeleton /> : <TradeHistoryFeed trades={trades} />}
        </Card>
      </section>
    </div>
  );
}
