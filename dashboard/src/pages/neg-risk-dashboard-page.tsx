/**
 * NegRiskDashboardPage — Negative Risk Scanner dashboard.
 * Dark theme, cyan accents, stats cards + data table + threshold control.
 */
import { useState, useEffect, useCallback } from 'react';

export interface NegRiskOpportunity {
  id: string;
  marketName: string;
  yesAsk: number;
  noAsk: number;
  sum: number;
  lockedProfit: number;
  lockedProfitPct: number;
}

export interface NegRiskStats {
  opportunitiesFound: number;
  lockedProfit: number;
  activeTrades: number;
}

export function NegRiskDashboardPage() {
  const [opportunities, setOpportunities] = useState<NegRiskOpportunity[]>([]);
  const [stats, setStats] = useState<NegRiskStats>({ opportunitiesFound: 0, lockedProfit: 0, activeTrades: 0 });
  const [threshold, setThreshold] = useState(0.98);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Call neg-risk-scan CLI via backend API
      const res = await fetch(`/dashboard/api/neg-risk-scan?threshold=${threshold}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setOpportunities(data.opportunities ?? []);
      setStats(data.stats ?? { opportunitiesFound: 0, lockedProfit: 0, activeTrades: 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
      // Demo data fallback
      setOpportunities(getDemoData());
      setStats({ opportunitiesFound: 5, lockedProfit: 1247.50, activeTrades: 3 });
    } finally {
      setLoading(false);
    }
  }, [threshold]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleTrade = (opp: NegRiskOpportunity) => {
    alert(`Trade initiated for ${opp.marketName}\nLocked profit: ${opp.lockedProfitPct.toFixed(2)}%`);
  };

  return (
    <div className="min-h-screen bg-bg p-4 md:p-6 lg:p-8">
      {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-accent tracking-tight">CashClaw</h1>
          <p className="text-muted text-sm mt-1">Negative Risk Scanner</p>
        </div>
        <nav className="hidden md:flex items-center gap-6 text-sm">
          <span className="text-accent cursor-pointer">Dashboard</span>
          <span className="text-muted hover:text-white cursor-pointer transition-colors">Strategies</span>
          <span className="text-muted hover:text-white cursor-pointer transition-colors">Settings</span>
        </nav>
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard label="Opportunities Found" value={stats.opportunitiesFound.toString()} icon="🔍" />
        <StatCard label="Locked Profit" value={`$${stats.lockedProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon="💰" />
        <StatCard label="Active Trades" value={stats.activeTrades.toString()} icon="⚡" />
      </div>

      {/* Main Content: Table + Sidebar */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Table */}
        <div className="flex-1 min-w-0">
          <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-bg-border">
              <h2 className="text-white font-semibold text-base">Market Opportunities</h2>
              <button
                onClick={fetchData}
                disabled={loading}
                className="px-4 py-2 bg-accent/10 text-accent border border-accent/30 rounded-lg text-sm font-medium hover:bg-accent/20 transition-colors disabled:opacity-50"
              >
                {loading ? 'Scanning...' : 'Refresh'}
              </button>
            </div>
            {error && <div className="p-3 text-loss text-sm bg-loss/10 border-b border-bg-border">{error}</div>}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted text-xs uppercase tracking-wider border-b border-bg-border">
                    <th className="px-4 py-3 text-left font-medium">Market</th>
                    <th className="px-4 py-3 text-right font-medium">YES Ask</th>
                    <th className="px-4 py-3 text-right font-medium">NO Ask</th>
                    <th className="px-4 py-3 text-right font-medium">Sum</th>
                    <th className="px-4 py-3 text-right font-medium">Locked Profit</th>
                    <th className="px-4 py-3 text-center font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {opportunities.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-muted">
                        {loading ? 'Scanning markets...' : 'No arbitrage opportunities found'}
                      </td>
                    </tr>
                  ) : opportunities.map((opp) => (
                    <tr key={opp.id} className="border-b border-bg-border hover:bg-bg-card/80 transition-colors">
                      <td className="px-4 py-3 text-white font-mono text-xs">{opp.marketName}</td>
                      <td className="px-4 py-3 text-right font-mono text-muted">${opp.yesAsk.toFixed(3)}</td>
                      <td className="px-4 py-3 text-right font-mono text-muted">${opp.noAsk.toFixed(3)}</td>
                      <td className="px-4 py-3 text-right font-mono text-white">{opp.sum.toFixed(3)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-mono font-semibold text-profit">{(opp.lockedProfitPct * 100).toFixed(2)}%</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleTrade(opp)}
                          className="px-3 py-1.5 bg-accent text-bg rounded-md text-xs font-bold hover:bg-accent/90 transition-colors"
                        >
                          Trade
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-full lg:w-72 shrink-0">
          <div className="bg-bg-card border border-bg-border rounded-xl p-5">
            <h3 className="text-white font-semibold text-sm mb-4">Control Panel</h3>
            <div className="mb-6">
              <label className="block text-muted text-xs mb-2">
                Risk Threshold: <span className="text-accent font-mono">{threshold.toFixed(2)}</span>
              </label>
              <input
                type="range"
                min="0.90"
                max="0.99"
                step="0.01"
                value={threshold}
                onChange={(e) => setThreshold(parseFloat(e.target.value))}
                className="w-full h-2 bg-bg-border rounded-lg appearance-none cursor-pointer accent-accent"
              />
              <div className="flex justify-between text-[10px] text-muted mt-1">
                <span>0.90</span>
                <span>0.99</span>
              </div>
            </div>
            <button
              onClick={fetchData}
              disabled={loading}
              className="w-full py-2.5 bg-accent text-bg rounded-lg font-bold text-sm hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {loading ? 'Scanning...' : 'Refresh Scan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="bg-bg-card border border-bg-border rounded-xl p-5 hover:border-accent/30 transition-colors">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-lg">{icon}</span>
        <span className="text-muted text-xs uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-white font-mono font-bold text-2xl">{value}</p>
    </div>
  );
}

function getDemoData(): NegRiskOpportunity[] {
  return [
    { id: '1', marketName: 'BTC > $100K by 2026', yesAsk: 0.482, noAsk: 0.491, sum: 0.973, lockedProfit: 0.027, lockedProfitPct: 0.027 },
    { id: '2', marketName: 'ETH ETF Approved', yesAsk: 0.355, noAsk: 0.612, sum: 0.967, lockedProfit: 0.033, lockedProfitPct: 0.033 },
    { id: '3', marketName: 'Fed Rate Cut Jun 2026', yesAsk: 0.728, noAsk: 0.248, sum: 0.976, lockedProfit: 0.024, lockedProfitPct: 0.024 },
    { id: '4', marketName: 'Trump Wins 2028', yesAsk: 0.421, noAsk: 0.553, sum: 0.974, lockedProfit: 0.026, lockedProfitPct: 0.026 },
    { id: '5', marketName: 'AI Regulation Passes', yesAsk: 0.389, noAsk: 0.587, sum: 0.976, lockedProfit: 0.024, lockedProfitPct: 0.024 },
  ];
}
