/**
 * NegRiskDashboardPage — CashClaw Negative Risk Scanner Dashboard
 * Design: Google Stitch generated — High-Fidelity Fintech design system
 * Colors: surface #051424, primary #4cd7f6, primary-container #06b6d4
 */

import { useState, useEffect, useCallback } from "react";
import { COLORS } from "../lib/stitch-design-tokens";

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
  const [stats, setStats] = useState<NegRiskStats>({
    opportunitiesFound: 0,
    lockedProfit: 0,
    activeTrades: 0,
  });
  const [threshold, setThreshold] = useState(0.98);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/dashboard/api/neg-risk-scan?threshold=${threshold}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        opportunities?: NegRiskOpportunity[];
        stats?: NegRiskStats;
      };
      setOpportunities(data.opportunities ?? []);
      setStats(
        data.stats ?? {
          opportunitiesFound: 0,
          lockedProfit: 0,
          activeTrades: 0,
        }
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setOpportunities(getDemoData());
      setStats({
        opportunitiesFound: 5,
        lockedProfit: 1247.5,
        activeTrades: 3,
      });
    } finally {
      setLoading(false);
    }
  }, [threshold]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleTrade = (opp: NegRiskOpportunity) => {
    const msg = `Trade initiated for ${opp.marketName} · Locked profit: ${(opp.lockedProfitPct * 100).toFixed(2)}%`;
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: COLORS.bg, color: COLORS.onSurface }}
    >
      {toast && (
        <div
          className="fixed top-20 right-6 z-[60] max-w-sm rounded-lg border px-4 py-3 text-sm shadow-lg"
          style={{ backgroundColor: `${COLORS.surfaceHigh}ee`, borderColor: `${COLORS.primary}66`, color: COLORS.onSurface }}
          role="status"
        >
          <div className="flex items-start justify-between gap-4">
            <span>{toast}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="opacity-70 hover:opacity-100"
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Top Navigation Bar */}
      <header
        className="fixed top-0 left-0 z-50 flex justify-between items-center px-6 h-16 border-b"
        style={{
          backgroundColor: COLORS.bg,
          borderColor: COLORS.outline,
        }}
      >
        <div className="flex items-center gap-6">
          <span
            className="text-2xl font-bold tracking-tighter"
            style={{ color: COLORS.primary }}
          >
            CashClaw
          </span>
          <nav className="hidden md:flex items-center gap-6">
            <span
              className="text-xs font-bold tracking-wider border-b-2 pb-1 cursor-pointer"
              style={{ color: COLORS.primary, borderColor: COLORS.primary }}
            >
              Dashboard
            </span>
            <span
              className="text-xs font-bold tracking-wider cursor-pointer transition-colors hover:text-white"
              style={{ color: COLORS.onSurfaceVariant }}
            >
              Strategies
            </span>
            <span
              className="text-xs font-bold tracking-wider cursor-pointer transition-colors hover:text-white"
              style={{ color: COLORS.onSurfaceVariant }}
            >
              Settings
            </span>
          </nav>
        </div>
      </header>

      {/* Sidebar */}
      <aside
        className="fixed left-0 top-16 h-[calc(100vh-64px)] w-60 flex flex-col p-4 border-r z-40"
        style={{
          backgroundColor: COLORS.surface,
          borderColor: COLORS.outline,
        }}
      >
        <div className="mb-6">
          <h2
            className="text-base font-semibold"
            style={{ color: COLORS.primary }}
          >
            Risk Control
          </h2>
          <p
            className="text-[12px] opacity-70"
            style={{ color: COLORS.onSurfaceVariant }}
          >
            Negative Risk Engine
          </p>
        </div>
        <div className="mb-6 p-3 rounded-lg border" style={{ borderColor: COLORS.outline, backgroundColor: `${COLORS.surfaceHigh}33` }}>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold tracking-wider" style={{ color: COLORS.onSurfaceVariant }}>
              Risk Threshold
            </label>
            <span className="text-xs font-mono font-bold" style={{ color: COLORS.primary }}>{threshold.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min={0.9}
            max={0.99}
            step={0.01}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="w-full accent-[#4cd7f6]"
          />
          <div className="flex justify-between text-[10px] mt-1" style={{ color: COLORS.onSurfaceVariant }}>
            <span>0.90</span>
            <span>0.99</span>
          </div>
        </div>
        <nav className="flex flex-col gap-1 flex-grow">
          {[
            { icon: "radar", label: "Scanner" },
            { icon: "account_balance_wallet", label: "Portfolio" },
            { icon: "history", label: "History" },
            { icon: "settings", label: "Settings" },
          ].map((item) => (
            <a
              key={item.label}
              className="flex items-center gap-3 p-2 rounded-lg transition-all cursor-pointer"
              style={{ color: COLORS.onSurfaceVariant }}
              href="#"
            >
              <span
                className="text-[20px]"
                style={{ fontFamily: "Material Symbols Outlined" }}
              >
                {item.icon}
              </span>
              <span className="text-xs font-bold tracking-wider">
                {item.label}
              </span>
            </a>
          ))}
        </nav>
        <div className="mt-auto pt-4 border-t" style={{ borderColor: COLORS.outline }}>
          <button
            onClick={fetchData}
            disabled={loading}
            className="w-full py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
            style={{
              backgroundColor: COLORS.primary,
              color: COLORS.onPrimary,
            }}
          >
            <span
              className="text-[20px]"
              style={{ fontFamily: "Material Symbols Outlined" }}
            >
              refresh
            </span>
            <span className="text-xs font-bold tracking-wider">
              {loading ? "Scanning..." : "Refresh Scan"}
            </span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="pt-24 pb-8 lg:pl-60 px-6">
        <div className="max-w-[1200px] mx-auto space-y-6">
          {/* Stats Row */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard
              label="Opportunities Found"
              value={stats.opportunitiesFound.toString()}
              trend="+3"
              color={COLORS.primary}
            />
            <StatCard
              label="Locked Profit"
              value={`$${stats.lockedProfit.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              color={COLORS.primary}
            />
            <StatCard
              label="Active Trades"
              value={stats.activeTrades.toString()}
              sub="/ 10 Limit"
              color={COLORS.primary}
            />
          </section>

          {error && (
            <div
              className="mb-4 rounded-lg border p-3 text-sm"
              style={{ backgroundColor: `${COLORS.loss}1A`, borderColor: `${COLORS.loss}66`, color: COLORS.onSurface }}
            >
              {error}
            </div>
          )}

          {/* Market Scanner Table */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h3
                className="text-xl font-semibold"
                style={{ color: COLORS.onSurface }}
              >
                Market Scanner
              </h3>
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full animate-pulse"
                  style={{ backgroundColor: COLORS.primary }}
                />
                <span
                  className="text-[11px] font-bold tracking-wider"
                  style={{ color: COLORS.onSurfaceVariant }}
                >
                  LIVE FEED
                </span>
              </div>
            </div>
            <div
              className="rounded-xl overflow-hidden"
              style={{ backgroundColor: COLORS.surface }}
            >
              <div
                className="overflow-x-auto"
                style={{
                  scrollbarWidth: "thin",
                  scrollbarColor: `${COLORS.outline} ${COLORS.surfaceContainer}`,
                }}
              >
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr
                      className="border-b"
                      style={{
                        backgroundColor: COLORS.surfaceHigh,
                        borderColor: COLORS.outline,
                      }}
                    >
                      <th
                        className="p-4 text-[11px] font-bold tracking-wider"
                        style={{ color: COLORS.onSurfaceVariant }}
                      >
                        Market Name
                      </th>
                      <th
                        className="p-4 text-[11px] font-bold tracking-wider text-right"
                        style={{ color: COLORS.onSurfaceVariant }}
                      >
                        YES Ask
                      </th>
                      <th
                        className="p-4 text-[11px] font-bold tracking-wider text-right"
                        style={{ color: COLORS.onSurfaceVariant }}
                      >
                        NO Ask
                      </th>
                      <th
                        className="p-4 text-[11px] font-bold tracking-wider text-right"
                        style={{ color: COLORS.onSurfaceVariant }}
                      >
                        Sum
                      </th>
                      <th
                        className="p-4 text-[11px] font-bold tracking-wider text-right"
                        style={{ color: COLORS.onSurfaceVariant }}
                      >
                        Profit
                      </th>
                      <th
                        className="p-4 text-[11px] font-bold tracking-wider text-right"
                        style={{ color: COLORS.onSurfaceVariant }}
                      >
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {opportunities.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="p-12 text-center text-sm"
                          style={{ color: COLORS.onSurfaceVariant }}
                        >
                          {loading ? "Scanning markets..." : "No arbitrage opportunities found"}
                        </td>
                      </tr>
                    ) : (
                      opportunities.map((opp) => (
                        <tr
                          key={opp.id}
                          className="border-b transition-colors group"
                          style={{
                            borderColor: `${COLORS.outline}4D`,
                          }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.backgroundColor =
                              COLORS.surfaceHigh)
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.backgroundColor = "transparent")
                          }
                        >
                          <td
                            className="p-4 text-sm"
                            style={{ color: COLORS.onSurface }}
                          >
                            {opp.marketName}
                          </td>
                          <td
                            className="p-4 text-sm text-right"
                            style={{
                              fontFamily: "JetBrains Mono, monospace",
                              color: COLORS.onSurface,
                            }}
                          >
                            {opp.yesAsk.toFixed(3)}
                          </td>
                          <td
                            className="p-4 text-sm text-right"
                            style={{
                              fontFamily: "JetBrains Mono, monospace",
                              color: COLORS.onSurface,
                            }}
                          >
                            {opp.noAsk.toFixed(3)}
                          </td>
                          <td
                            className="p-4 text-sm text-right"
                            style={{
                              fontFamily: "JetBrains Mono, monospace",
                              color: COLORS.primary,
                            }}
                          >
                            {opp.sum.toFixed(3)}
                          </td>
                          <td
                            className="p-4 text-sm text-right"
                            style={{
                              fontFamily: "JetBrains Mono, monospace",
                              color: COLORS.primary,
                            }}
                          >
                            ${opp.lockedProfit.toFixed(2)}
                          </td>
                          <td className="p-4 text-right">
                            <button
                              onClick={() => handleTrade(opp)}
                              className="px-4 py-1.5 rounded text-[10px] font-bold tracking-wider transition-all hover:opacity-90"
                              style={{
                                backgroundColor: `${COLORS.primary}1A`,
                                border: `1px solid ${COLORS.primary}`,
                                color: COLORS.primary,
                              }}
                            >
                              Trade
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  trend,
  sub,
  color,
}: {
  label: string;
  value: string;
  trend?: string;
  sub?: string;
  color: string;
}) {
  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-1 relative overflow-hidden group"
      style={{ backgroundColor: COLORS.surface }}
    >
      <div
        className="absolute top-0 right-0 w-24 h-24 rounded-full -mr-12 -mt-12 transition-all group-hover:opacity-100"
        style={{ backgroundColor: `${color}0D`, opacity: 0.5 }}
      />
      <span
        className="text-[11px] font-bold tracking-wider"
        style={{ color: COLORS.onSurfaceVariant }}
      >
        {label}
      </span>
      <div className="flex items-baseline gap-2">
        <span
          className="text-[32px] leading-none"
          style={{
            fontFamily: "JetBrains Mono, monospace",
            color,
            fontWeight: 500,
          }}
        >
          {value}
        </span>
        {trend && (
          <span
            className="text-sm flex items-center"
            style={{ color }}
          >
            <span style={{ fontFamily: "Material Symbols Outlined" }}>
              trending_up
            </span>
            {trend}
          </span>
        )}
      </div>
      {sub && (
        <span
          className="text-xs mt-3"
          style={{ color: COLORS.onSurfaceVariant }}
        >
          {sub}
        </span>
      )}
      {!sub && !trend && (
        <div
          className="w-full h-1 rounded-full mt-3 overflow-hidden"
          style={{ backgroundColor: COLORS.surfaceHigh }}
        >
          <div className="h-full rounded-full" style={{ backgroundColor: color, width: "65%" }} />
        </div>
      )}
    </div>
  );
}

function getDemoData(): NegRiskOpportunity[] {
  return [
    {
      id: "1",
      marketName: "BTC > $100K by 2026",
      yesAsk: 0.482,
      noAsk: 0.491,
      sum: 0.973,
      lockedProfit: 0.027,
      lockedProfitPct: 0.027,
    },
    {
      id: "2",
      marketName: "ETH ETF Approved",
      yesAsk: 0.355,
      noAsk: 0.612,
      sum: 0.967,
      lockedProfit: 0.033,
      lockedProfitPct: 0.033,
    },
    {
      id: "3",
      marketName: "Fed Rate Cut Jun 2026",
      yesAsk: 0.728,
      noAsk: 0.248,
      sum: 0.976,
      lockedProfit: 0.024,
      lockedProfitPct: 0.024,
    },
    {
      id: "4",
      marketName: "Trump Wins 2028",
      yesAsk: 0.421,
      noAsk: 0.553,
      sum: 0.974,
      lockedProfit: 0.026,
      lockedProfitPct: 0.026,
    },
    {
      id: "5",
      marketName: "AI Regulation Passes",
      yesAsk: 0.389,
      noAsk: 0.587,
      sum: 0.976,
      lockedProfit: 0.024,
      lockedProfitPct: 0.024,
    },
  ];
}
