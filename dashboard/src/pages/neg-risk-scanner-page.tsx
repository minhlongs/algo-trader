/**
 * NegRiskScannerPage — Dashboard for Polymarket Negative Risk Arbitrage Scanner
 *
 * Features:
 * - Stats cards: Opportunities Found, Locked Profit, Active Trades
 * - Data table: Market, YES Ask, NO Ask, Sum, Locked Profit, Trade button
 * - Sidebar: threshold slider (0.90–0.99, default 0.98), refresh button
 * - Dark theme, cyan accents, desktop layout
 */

import { useState, useCallback, useEffect } from 'react';
import { useNegRiskScannerStore } from '../stores/neg-risk-scanner-store';

// ─── Stats Cards ─────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-bg-card border border-bg-border rounded-lg p-4 transition-all duration-200 hover:border-accent/30">
      <p className="text-muted text-xs font-medium uppercase tracking-wider mb-1">{label}</p>
      <p className="text-white font-mono font-bold text-2xl">{value}</p>
      {sub && <p className="text-accent text-xs font-mono mt-1">{sub}</p>}
    </div>
  );
}

// ─── Threshold Slider ─────────────────────────────────────────────────────────

function ThresholdControl({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-3">
      <label className="text-muted text-xs font-medium uppercase tracking-wider block">
        Risk Threshold
      </label>
      <input
        type="range"
        min={0.90}
        max={0.99}
        step={0.01}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-2 bg-bg-border rounded-lg appearance-none cursor-pointer accent-accent"
        data-testid="threshold-slider"
      />
      <div className="flex justify-between text-[10px] text-muted font-mono">
        <span>0.90</span>
        <span className="text-accent font-bold">{value.toFixed(2)}</span>
        <span>0.99</span>
      </div>
    </div>
  );
}

// ─── Data Table ──────────────────────────────────────────────────────────────

function OpportunitiesTable({
  opportunities,
  onTrade,
}: {
  opportunities: Array<{
    id: string;
    market: string;
    yesAsk: number;
    noAsk: number;
    sum: number;
    lockedProfit: number;
  }>;
  onTrade: (id: string) => void;
}) {
  if (opportunities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted">
        <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1" viewBox="0 0 24 24" className="mb-3 opacity-30">
          <circle cx="12" cy="12" r="9" />
          <path d="M8 12h8M12 8v8" />
        </svg>
        <p className="text-sm">No arbitrage opportunities detected</p>
        <p className="text-xs mt-1">Try lowering the threshold or refreshing</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" data-testid="opportunities-table">
        <thead>
          <tr className="border-b border-bg-border text-muted text-xs uppercase tracking-wider">
            <th className="text-left py-3 px-4 font-medium">Market</th>
            <th className="text-right py-3 px-4 font-medium">YES Ask</th>
            <th className="text-right py-3 px-4 font-medium">NO Ask</th>
            <th className="text-right py-3 px-4 font-medium">Sum</th>
            <th className="text-right py-3 px-4 font-medium">Locked Profit</th>
            <th className="text-center py-3 px-4 font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {opportunities.map((opp) => (
            <tr
              key={opp.id}
              className="border-b border-bg-border/50 hover:bg-bg-card/80 transition-colors"
              data-testid={`opportunity-row-${opp.id}`}
            >
              <td className="py-3 px-4 text-white font-mono text-xs">{opp.market}</td>
              <td className="py-3 px-4 text-right font-mono text-muted">${opp.yesAsk.toFixed(2)}</td>
              <td className="py-3 px-4 text-right font-mono text-muted">${opp.noAsk.toFixed(2)}</td>
              <td className="py-3 px-4 text-right font-mono text-accent">{opp.sum.toFixed(3)}</td>
              <td className="py-3 px-4 text-right font-mono text-profit">{(opp.lockedProfit * 100).toFixed(2)}%</td>
              <td className="py-3 px-4 text-center">
                <button
                  onClick={() => onTrade(opp.id)}
                  className="px-3 py-1.5 bg-accent/10 text-accent border border-accent/30 rounded text-xs font-medium hover:bg-accent/20 hover:border-accent/50 transition-all duration-150"
                  data-testid={`trade-btn-${opp.id}`}
                >
                  Trade
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export function NegRiskScannerPage() {
  const [threshold, setThreshold] = useState(0.98);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const opportunities = useNegRiskScannerStore((s) => s.opportunities);
  const stats = useNegRiskScannerStore((s) => s.stats);
  const loading = useNegRiskScannerStore((s) => s.loading);
  const lastRefresh = useNegRiskScannerStore((s) => s.lastRefresh);
  const fetchOpportunities = useNegRiskScannerStore((s) => s.fetchOpportunities);
  const executeTrade = useNegRiskScannerStore((s) => s.executeTrade);

  // Initial fetch
  useEffect(() => {
    fetchOpportunities(threshold);
  }, []);

  const handleRefresh = useCallback(() => {
    fetchOpportunities(threshold);
  }, [threshold, fetchOpportunities]);

  const handleThresholdChange = useCallback(
    (newThreshold: number) => {
      setThreshold(newThreshold);
      fetchOpportunities(newThreshold);
    },
    [fetchOpportunities]
  );

  const handleTrade = useCallback(
    (id: string) => {
      executeTrade(id);
    },
    [executeTrade]
  );

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-bg-card border-r border-bg-border transform transition-transform duration-300 md:relative md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Sidebar header */}
        <div className="flex items-center justify-between h-14 px-4 border-b border-bg-border">
          <div>
            <h1 className="text-accent font-bold text-base tracking-tight">CashClaw</h1>
            <p className="text-muted text-[10px] mt-0.5">Neg Risk Scanner</p>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden p-2 text-muted hover:text-white"
            aria-label="Close sidebar"
          >
            ✕
          </button>
        </div>

        {/* Controls */}
        <div className="p-4 space-y-6">
          <ThresholdControl value={threshold} onChange={handleThresholdChange} />

          <div className="space-y-2">
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="w-full py-2.5 bg-accent/10 text-accent border border-accent/30 rounded-lg text-sm font-medium hover:bg-accent/20 hover:border-accent/50 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              data-testid="refresh-btn"
            >
              {loading ? (
                <>
                  <span className="animate-spin">⟳</span> Scanning...
                </>
              ) : (
                <>↻ Refresh</>
              )}
            </button>
            {lastRefresh > 0 && (
              <p className="text-[10px] text-muted text-center">
                Last scan: {formatTime(lastRefresh)}
              </p>
            )}
          </div>

          {/* Mini stats */}
          <div className="space-y-2 pt-4 border-t border-bg-border">
            <p className="text-muted text-[10px] uppercase tracking-wider">Session Stats</p>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted">Scanned</span>
                <span className="text-white font-mono">{stats.totalScanned}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted">Opportunities</span>
                <span className="text-accent font-mono">{stats.opportunitiesFound}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted">Avg Profit</span>
                <span className="text-profit font-mono">
                  {stats.avgProfit > 0 ? `${(stats.avgProfit * 100).toFixed(2)}%` : '—'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="sticky top-0 z-30 md:hidden bg-bg/95 backdrop-blur border-b border-bg-border">
          <div className="flex items-center justify-between h-14 px-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 -ml-2 text-muted hover:text-white min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Open menu"
            >
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
            <span className="text-accent font-bold text-base">CashClaw</span>
            <div className="w-10" />
          </div>
        </header>

        {/* Desktop header */}
        <header className="hidden md:flex items-center justify-between h-14 px-6 border-b border-bg-border bg-bg/80 backdrop-blur">
          <div>
            <h2 className="text-white font-semibold text-lg">Negative Risk Scanner</h2>
            <p className="text-muted text-xs">Polymarket arbitrage opportunities</p>
          </div>
          <nav className="flex items-center gap-6 text-sm">
            <span className="text-accent cursor-pointer">Scanner</span>
            <span className="text-muted hover:text-white cursor-pointer transition-colors">Strategies</span>
            <span className="text-muted hover:text-white cursor-pointer transition-colors">Settings</span>
          </nav>
        </header>

        {/* Content */}
        <div className="flex-1 p-4 md:p-6 space-y-6">
          {/* Stats cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label="Opportunities Found" value={stats.opportunitiesFound} />
            <StatCard
              label="Locked Profit"
              value={stats.totalLockedProfit > 0 ? `$${stats.totalLockedProfit.toFixed(2)}` : '$0.00'}
              sub={stats.avgProfit > 0 ? `${(stats.avgProfit * 100).toFixed(2)}% avg` : undefined}
            />
            <StatCard label="Active Trades" value={stats.activeTrades} />
          </div>

          {/* Table */}
          <div className="bg-bg-card border border-bg-border rounded-lg">
            <div className="px-4 py-3 border-b border-bg-border flex items-center justify-between">
              <h3 className="text-white font-medium text-sm">Arbitrage Opportunities</h3>
              <span className="text-muted text-xs font-mono">
                {opportunities.length} markets
              </span>
            </div>
            <OpportunitiesTable opportunities={opportunities} onTrade={handleTrade} />
          </div>
        </div>
      </main>
    </div>
  );
}
