/**
 * NegRiskDashboardPage — CashClaw Negative Risk Scanner Dashboard
 * Design: Google Stitch dark fintech bilingual VN+EN
 */

import { useState, useEffect, useCallback } from "react";
import { COLORS } from "../lib/stitch-design-tokens";
import { ProactiveControlsPanel } from "../components/risk/ProactiveControlsPanel";
import { DecisionAidsPanel } from "../components/risk/DecisionAidsPanel";
import { useNotificationsStore } from "../stores/notifications-store";

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

type Lang = "en" | "vi";

const COPY = {
  en: {
    langToggle: "EN",
    title: "Negative Risk Scanner",
    subtitle: "Negative Risk Engine",
    dashboard: "Dashboard",
    strategies: "Strategies",
    settings: "Settings",
    riskControl: "Risk Control",
    riskThreshold: "Risk Threshold",
    scanner: "Scanner",
    portfolio: "Portfolio",
    history: "History",
    refreshScan: "Refresh Scan",
    scanning: "Scanning...",
    opportunitiesFound: "Opportunities Found",
    lockedProfit: "Locked Profit",
    activeTrades: "Active Trades",
    tradeLimit: "/ 10 Limit",
    tradeInitiated: "Trade Initiated",
    marketScanner: "Market Scanner",
    liveFeed: "LIVE FEED",
    marketName: "Market Name",
    yesAsk: "YES Ask",
    noAsk: "NO Ask",
    sum: "Sum",
    profit: "Profit",
    action: "Action",
    trade: "Trade",
    scanningMarkets: "Scanning markets...",
    noOpportunities: "No arbitrage opportunities found",
  },
  vi: {
    langToggle: "VI",
    title: "Negative Risk Scanner",
    subtitle: "Negative Risk Engine",
    dashboard: "Bảng điều khiển",
    strategies: "Chiến lược",
    settings: "Cài đặt",
    riskControl: "Kiểm soát rủi ro",
    riskThreshold: "Ngưỡng rủi ro",
    scanner: "Quét",
    portfolio: "Danh mục",
    history: "Lịch sử",
    refreshScan: "Quét lại",
    scanning: "Đang quét...",
    opportunitiesFound: "Cơ hội tìm thấy",
    lockedProfit: "Lợi nhuận khóa",
    activeTrades: "Giao dịch đang chạy",
    tradeLimit: "/ Giới hạn 10",
    tradeInitiated: "Giao dịch đã khởi tạo",
    marketScanner: "Quét thị trường",
    liveFeed: "FEED TRỰC TIẾP",
    marketName: "Tên thị trường",
    yesAsk: "YES Ask",
    noAsk: "NO Ask",
    sum: "Tổng",
    profit: "Lợi nhuận",
    action: "Hành động",
    trade: "Giao dịch",
    scanningMarkets: "Đang quét thị trường...",
    noOpportunities: "Không tìm thấy cơ hội chênh lệch giá",
  },
};

export function NegRiskDashboardPage() {
  const [lang, setLang] = useState<Lang>("en");
  const [opportunities, setOpportunities] = useState<NegRiskOpportunity[]>([]);
  const [stats, setStats] = useState<NegRiskStats>({
    opportunitiesFound: 0,
    lockedProfit: 0,
    activeTrades: 0,
  });
  const [threshold, setThreshold] = useState(0.98);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const t = COPY[lang];

  const addNotification = useNotificationsStore(
    (state) => state.addNotification
  );

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
    addNotification({
      type: "success",
      severity: "medium",
      title: t.tradeInitiated,
      message: `Trade initiated for ${opp.marketName} · Locked profit: ${(
        opp.lockedProfitPct * 100
      ).toFixed(2)}%`,
      duration: 3500,
    });
  };

  return (
    <div className="min-h-screen bg-[${COLORS.bg}] text-[${COLORS.onSurface}] font-sans">
      {/* Language Toggle */}
      <div className="fixed top-4 right-4 z-50">
        <button
          onClick={() => setLang((l: Lang) => (l === "en" ? "vi" : "en"))}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[${COLORS.outline}] bg-[${COLORS.surface}]/80 text-[${COLORS.onSurfaceVariant}] text-xs hover:border-[${COLORS.primary}] hover:text-[${COLORS.primary}] transition-colors"
          aria-label="Toggle language"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10" />
          </svg>
          {t.langToggle}
        </button>
      </div>

      {/* Top Navigation Bar */}
      <header className="fixed top-0 left-0 z-40 flex justify-between items-center px-6 h-16 border-b border-[${COLORS.outline}] bg-[${COLORS.bg}]">
        <div className="flex items-center gap-6">
          <span className="text-2xl font-bold tracking-tighter text-[${COLORS.primary}]">
            CashClaw
          </span>
          <nav className="hidden md:flex items-center gap-6">
            <span className="text-xs font-bold tracking-wider border-b-2 border-[${COLORS.primary}] pb-1 text-[${COLORS.primary}] cursor-pointer">
              {t.dashboard}
            </span>
            <span className="text-xs font-bold tracking-wider cursor-pointer transition-colors hover:text-white text-[${COLORS.onSurfaceVariant}]">
              {t.strategies}
            </span>
            <span className="text-xs font-bold tracking-wider cursor-pointer transition-colors hover:text-white text-[${COLORS.onSurfaceVariant}]">
              {t.settings}
            </span>
          </nav>
        </div>
      </header>

      {/* Sidebar */}
      <aside className="fixed left-0 top-16 h-[calc(100vh-64px)] w-60 flex flex-col p-4 border-r border-[${COLORS.outline}] bg-[${COLORS.surface}]/80 z-30">
        <div className="mb-6">
          <h2 className="text-base font-semibold text-[${COLORS.primary}]">
            {t.riskControl}
          </h2>
          <p className="text-[12px] text-[${COLORS.onSurfaceVariant}] opacity-70">{t.subtitle}</p>
        </div>
        <div className="mb-6 p-3 rounded-lg border border-[${COLORS.outline}] bg-[${COLORS.surface}]/80">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold tracking-wider text-[${COLORS.onSurfaceVariant}]">
              {t.riskThreshold}
            </label>
            <span className="text-xs font-mono font-bold text-[${COLORS.primary}]">
              {threshold.toFixed(2)}
            </span>
          </div>
          <input
            type="range"
            min={0.9}
            max={0.99}
            step={0.01}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="w-full accent-[${COLORS.primary}]"
          />
          <div className="flex justify-between text-[10px] mt-1 text-[${COLORS.onSurfaceVariant}]">
            <span>0.90</span>
            <span>0.99</span>
          </div>
        </div>
        <nav className="flex flex-col gap-1 flex-grow">
          {[
            { icon: "radar", label: t.scanner },
            { icon: "account_balance_wallet", label: t.portfolio },
            { icon: "history", label: t.history },
            { icon: "settings", label: t.settings },
          ].map((item) => (
            <a
              key={item.label}
              className="flex items-center gap-3 p-2 rounded-lg transition-all cursor-pointer text-[${COLORS.onSurfaceVariant}]"
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
        <div className="mt-auto pt-4 border-t border-[${COLORS.outline}]">
          <button
            onClick={fetchData}
            disabled={loading}
            className="w-full py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50 bg-[${COLORS.primary}] text-[${COLORS.onPrimary}]"
          >
            <span
              className="text-[20px]"
              style={{ fontFamily: "Material Symbols Outlined" }}
            >
              refresh
            </span>
            <span className="text-xs font-bold tracking-wider">
              {loading ? t.scanning : t.refreshScan}
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
              label={t.opportunitiesFound}
              value={stats.opportunitiesFound.toString()}
              trend="+3"
              color={COLORS.primary}
            />
            <StatCard
              label={t.lockedProfit}
              value={`$${stats.lockedProfit.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}`}
              color={COLORS.primary}
            />
            <StatCard
              label={t.activeTrades}
              value={stats.activeTrades.toString()}
              sub={t.tradeLimit}
              color={COLORS.primary}
            />
          </section>

          {error && (
            <div
              className="mb-4 rounded-lg border p-3 text-sm"
              style={{
                backgroundColor: `${COLORS.loss}1A`,
                borderColor: `${COLORS.loss}66`,
                color: COLORS.onSurface,
              }}
            >
              {error}
            </div>
          )}

          {/* Proactive Controls */}
          <section>
            <ProactiveControlsPanel />
          </section>

          {/* Decision Aids */}
          <section>
            <DecisionAidsPanel />
          </section>

          {/* Market Scanner Table */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-[${COLORS.onSurface}]">
                {t.marketScanner}
              </h3>
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full animate-pulse"
                  style={{ backgroundColor: COLORS.primary }}
                />
                <span
                  className="text-[11px] font-bold tracking-wider text-[${COLORS.onSurfaceVariant}]"
                >
                  {t.liveFeed}
                </span>
              </div>
            </div>
            <div className="rounded-xl overflow-hidden bg-[${COLORS.surface}]/80 backdrop-blur-xl border border-[${COLORS.outline}]">
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
                        className="p-4 text-[11px] font-bold tracking-wider text-[${COLORS.onSurfaceVariant}]"
                      >
                        {t.marketName}
                      </th>
                      <th
                        className="p-4 text-[11px] font-bold tracking-wider text-right text-[${COLORS.onSurfaceVariant}]"
                      >
                        {t.yesAsk}
                      </th>
                      <th
                        className="p-4 text-[11px] font-bold tracking-wider text-right text-[${COLORS.onSurfaceVariant}]"
                      >
                        {t.noAsk}
                      </th>
                      <th
                        className="p-4 text-[11px] font-bold tracking-wider text-right text-[${COLORS.onSurfaceVariant}]"
                      >
                        {t.sum}
                      </th>
                      <th
                        className="p-4 text-[11px] font-bold tracking-wider text-right text-[${COLORS.onSurfaceVariant}]"
                      >
                        {t.profit}
                      </th>
                      <th
                        className="p-4 text-[11px] font-bold tracking-wider text-right text-[${COLORS.onSurfaceVariant}]"
                      >
                        {t.action}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {opportunities.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="p-12 text-center text-sm text-[${COLORS.onSurfaceVariant}]"
                        >
                          {loading ? t.scanningMarkets : t.noOpportunities}
                        </td>
                      </tr>
                    ) : (
                      opportunities.map((opp) => (
                        <tr
                          key={opp.id}
                          className="border-b transition-colors group"
                          style={{ borderColor: `${COLORS.outline}4D` }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.backgroundColor =
                              COLORS.surfaceHigh)
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.backgroundColor =
                              "transparent")
                          }
                        >
                          <td
                            className="p-4 text-sm text-[${COLORS.onSurface}]"
                          >
                            {opp.marketName}
                          </td>
                          <td
                            className="p-4 text-sm text-right font-mono text-[${COLORS.onSurface}]"
                            style={{ fontFamily: "JetBrains Mono, monospace" }}
                          >
                            {opp.yesAsk.toFixed(3)}
                          </td>
                          <td
                            className="p-4 text-sm text-right font-mono text-[${COLORS.onSurface}]"
                            style={{ fontFamily: "JetBrains Mono, monospace" }}
                          >
                            {opp.noAsk.toFixed(3)}
                          </td>
                          <td
                            className="p-4 text-sm text-right font-mono text-[${COLORS.primary}]"
                            style={{ fontFamily: "JetBrains Mono, monospace" }}
                          >
                            {opp.sum.toFixed(3)}
                          </td>
                          <td
                            className="p-4 text-sm text-right font-mono text-[${COLORS.profit}]"
                            style={{ fontFamily: "JetBrains Mono, monospace" }}
                          >
                            ${opp.lockedProfit.toFixed(2)}
                          </td>
                          <td className="p-4 text-right">
                            <button
                              onClick={() => handleTrade(opp)}
                              className="px-4 py-1.5 rounded text-[10px] font-bold tracking-wider transition-all hover:opacity-90 border border-[${COLORS.primary}] text-[${COLORS.primary}]"
                              style={{
                                backgroundColor: `${COLORS.primary}1A`,
                                border: `1px solid ${COLORS.primary}`,
                                color: COLORS.primary,
                              }}
                            >
                              {t.trade}
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
    <div className="rounded-xl p-4 flex flex-col gap-1 relative overflow-hidden group bg-[${COLORS.surface}]/80 backdrop-blur-xl border border-[${COLORS.outline}]">
      <div
        className="absolute top-0 right-0 w-24 h-24 rounded-full -mr-12 -mt-12 transition-all group-hover:opacity-100"
        style={{ backgroundColor: `${color}0D`, opacity: 0.5 }}
      />
      <span
        className="text-[11px] font-bold tracking-wider text-[${COLORS.onSurfaceVariant}]"
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
          <span className="text-sm flex items-center" style={{ color }}>
            <span style={{ fontFamily: "Material Symbols Outlined" }}>
              trending_up
            </span>
            {trend}
          </span>
        )}
      </div>
      {sub && (
        <span className="text-xs mt-3 text-[${COLORS.onSurfaceVariant}]">
          {sub}
        </span>
      )}
      {!sub && !trend && (
        <div
          className="w-full h-1 rounded-full mt-3 overflow-hidden"
          style={{ backgroundColor: COLORS.surfaceHigh }}
        >
          <div
            className="h-full rounded-full"
            style={{ backgroundColor: color, width: "65%" }}
          />
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
