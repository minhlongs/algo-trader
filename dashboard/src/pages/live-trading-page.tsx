/**
 * Live Trading Page — Stitch dark fintech bilingual VN+EN pattern.
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

/* ── i18n ── */

type Lang = 'en' | 'vi';

const COPY: Record<Lang, Record<string, string>> = {
  en: {
    langToggle: 'Tiếng Việt',
    title: 'Live Trading',
    subtitle: 'Real-time trading dashboard with positions, P&L, and risk monitoring',
    /* ModeBadge */
    modeLive: 'LIVE',
    modePaper: 'PAPER',
    /* Header controls */
    pause: 'Pause',
    resume: 'Resume',
    refresh: 'Refresh',
    stopBot: 'Stop Bot',
    /* Status */
    stale: 'stale',
    refreshing: 'Refreshing…',
    syncing: 'syncing…',
    synced: 'synced',
    connected: 'Connected',
    /* KPI cards */
    dailyPnl: 'Daily P&L',
    winRate: 'Win Rate',
    openPositions: 'Open Positions',
    circuitBreaker: 'Circuit Breaker',
    open: 'OPEN',
    closed: 'CLOSED',
    halfOpen: 'HALF_OPEN',
    /* Bot engine */
    uptime: 'Uptime',
    totalSignals: 'Total Signals',
    executedTrades: 'Executed Trades',
    rejectedTrades: 'Rejected Trades',
    running: 'Running',
    stopped: 'Stopped',
    /* Guard status */
    botStatus: 'Bot Status',
    consecutiveLosses: 'Consecutive Losses',
    /* Positions */
    openPositionsTitle: 'Open Positions',
    noOpenPositions: 'No open positions',
    token: 'Token',
    side: 'Side',
    size: 'Size',
    entry: 'Entry',
    current: 'Current',
    unrealPnl: 'Unreal. PnL',
    close: 'Close',
    closeAria: 'Close position',
    closing: 'Closing…',
    /* Trades */
    recentTrades: 'Recent Trades',
    noTradesYet: 'No trades yet',
    time: 'Time',
    strategy: 'Strategy',
    symbol: 'Symbol',
    price: 'Price',
    pnl: 'PnL',
    mode: 'Mode',
    paper: 'PAPER',
    liveLabel: 'LIVE',
    /* Toast */
    positionNotFound: 'Position not found',
    positionClosed: 'Position closed',
    failedToClosePosition: 'Failed to close position',
    failedToStopBot: 'Failed to stop bot. Please try again.',
    failedToLoadTradeData: 'Failed to load trade data',
    /* Dialog */
    stopDialogTitle: 'Stop Trading Bot',
    stopDialogMsg: 'Are you sure? This will stop all trading.',
    stopping: 'Stopping…',
    stop: 'Stop Bot',
    cancel: 'Cancel',
    /* Footer */
    dataSourced: 'Data sourced from live bot engine',
    autoRefreshPaused: 'Auto-refresh PAUSED',
    autoRefreshing: 'Auto-refreshing every 5s',
    days: 'd',
    hours: 'h',
    minutes: 'm',
  },
  vi: {
    langToggle: 'English',
    title: 'Giao Dịch Thực',
    subtitle: 'Dashboard giao dịch thực-time: vị thế, P&L, giám sát rủi ro',
    /* ModeBadge */
    modeLive: 'TRỰC TIẾP',
    modePaper: 'GIẢ LẬP',
    /* Header controls */
    pause: 'Tạm dừng',
    resume: 'Tiếp tục',
    refresh: 'Làm mới',
    stopBot: 'Dừng Bot',
    /* Status */
    stale: 'lỗi thời',
    refreshing: 'Đang làm mới…',
    syncing: 'đang đồng bộ…',
    synced: 'đã đồng bộ',
    connected: 'Đã kết nối',
    /* KPI cards */
    dailyPnl: 'P&L Ngày',
    winRate: 'Tỷ Lệ Thắng',
    openPositions: 'Vị Thế Mở',
    circuitBreaker: 'Cầu Chì',
    open: 'MỞ',
    closed: 'ĐÓNG',
    halfOpen: 'NỬA MỞ',
    /* Bot engine */
    uptime: 'Thời Gian Hoạt Động',
    totalSignals: 'Tổng Tín Hiệu',
    executedTrades: 'Giao Dịch Thực Hiện',
    rejectedTrades: 'Giao Dịch Từ Chối',
    running: 'Đang Chạy',
    stopped: 'Đã Dừng',
    /* Guard status */
    botStatus: 'Trạng Thái Bot',
    consecutiveLosses: 'Lỗ Liên Tiếp',
    /* Positions */
    openPositionsTitle: 'Vị Thế Mở',
    noOpenPositions: 'Không có vị thế mở',
    token: 'Token',
    side: 'Hướng',
    size: 'Khối Lượng',
    entry: 'Vào',
    current: 'Hiện Tại',
    unrealPnl: 'PnL Chưa Thực Hiện',
    close: 'Đóng',
    closeAria: 'Đóng vị thế',
    closing: 'Đang đóng…',
    /* Trades */
    recentTrades: 'Giao Dịch Gần Đây',
    noTradesYet: 'Chưa có giao dịch',
    time: 'Thời Gian',
    strategy: 'Chiến Lược',
    symbol: 'Ký Hiệu',
    price: 'Giá',
    pnl: 'PnL',
    mode: 'Chế Độ',
    paper: 'GIẢ LẬP',
    liveLabel: 'TRỰC TIẾP',
    /* Toast */
    positionNotFound: 'Không tìm thấy vị thế',
    positionClosed: 'Vị thế đã đóng',
    failedToClosePosition: 'Không thể đóng vị thế',
    failedToStopBot: 'Không thể dừng bot. Vui lòng thử lại.',
    failedToLoadTradeData: 'Không thể tải dữ liệu giao dịch',
    /* Dialog */
    stopDialogTitle: 'Dừng Bot Giao Dịch',
    stopDialogMsg: 'Bạn chắc chắn? Thao tác này sẽ dừng tất cả giao dịch.',
    stopping: 'Đang dừng…',
    stop: 'Dừng Bot',
    cancel: 'Hủy',
    /* Footer */
    dataSourced: 'Dữ liệu từ bot engine',
    autoRefreshPaused: 'Tự động Làm mới ĐÃ TẠM DỪNG',
    autoRefreshing: 'Tự động Làm mới mỗi 5s',
    days: 'ngày',
    hours: 'giờ',
    minutes: 'phút',
  },
};

/* ── Helpers ── */

function fmtUsd(n: number, decimals = 2): string {
  const abs = Math.abs(n);
  const formatted =
    abs >= 1000
      ? abs.toLocaleString('en-US', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })
      : abs.toFixed(4);
  return (n < 0 ? '-' : '') + '$' + formatted;
}

function pnlClass(v: number): string {
  return v > 0 ? 'text-profit' : v < 0 ? 'text-loss' : 'text-muted';
}

function fmtPercent(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}

function calcTrend(data: { value: number }[]): number | null {
  if (data.length < 4) return null;
  const recent = data.slice(-3);
  const prior = data.slice(-6, -3);
  const recentAvg = recent.reduce((s, d) => s + d.value, 0) / recent.length;
  const priorAvg = prior.reduce((s, d) => s + d.value, 0) / prior.length;
  if (priorAvg === 0)
    return recentAvg > 0 ? 100 : recentAvg < 0 ? -100 : 0;
  return ((recentAvg - priorAvg) / Math.abs(priorAvg)) * 100;
}

/* ── Inner components ── */

/* ── KpiCard (local) ── */

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
    warning: 'text-warning',
    muted: 'text-muted',
  };
  return (
    <div className="glass-card overflow-hidden p-4 flex flex-col gap-1">
      <p className="text-muted text-[10px] uppercase tracking-widest">{label}</p>
      <p className={`text-2xl font-bold ${accents[accent]}`}>{value}</p>
      {subLabel && <p className="text-muted text-xs">{subLabel}</p>}
    </div>
  );
}

/* ── ModeBadge ── */

function ModeBadge({ mode }: { mode: string }) {
  const isLive = mode === 'live';
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${
        isLive
          ? 'bg-profit/10 border-profit/40 text-profit'
          : 'bg-warning/10 border-warning/40 text-warning'
      }`}
    >
      <span
        className={`w-2 h-2 rounded-full ${isLive ? 'bg-profit animate-pulse' : 'bg-warning'}`}
      />
      {isLive ? 'LIVE' : 'PAPER'}
    </span>
  );
}

/* ── PositionsTable ── */

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

interface PositionsTableProps {
  rows: PositionRow[];
  closingPositionId: string | null;
  onClosePosition: (id: string) => void;
  t: typeof COPY['en'] & typeof COPY['vi'];
}

function PositionsTable({
  rows,
  closingPositionId,
  onClosePosition,
  t,
}: PositionsTableProps) {
  if (rows.length === 0) {
    return (
      <div className="text-muted text-xs py-8 text-center border border-dashed border-outline rounded-lg">
        {t.noOpenPositions}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] sm:min-w-[700px] text-xs">
        <thead className="border-b border-bg-border bg-bg">
          <tr>
            {['Token', 'Side', 'Size', 'Entry', 'Current', 'Unreal. PnL', ' '].map(
              (h) => (
                <th
                  key={h}
                  className="px-3 py-2 text-left text-[10px] uppercase tracking-widest text-muted whitespace-nowrap"
                >
                  {h}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const isClosing = closingPositionId === r.id;
            return (
              <tr
                key={r.id || `${r.tokenId}-${i}`}
                className="border-b border-bg-border hover:bg-bg/50 transition-colors"
              >
                <td className="px-3 py-2 text-white font-mono">{r.tokenId}</td>
                <td
                  className={`px-3 py-2 font-bold ${r.side === 'BUY' ? 'text-profit' : 'text-loss'}`}
                >
                  {r.side}
                </td>
                <td className="px-3 py-2 text-white">{r.size.toFixed(4)}</td>
                <td className="px-3 py-2 text-white font-mono">
                  {fmtUsd(r.entryPrice)}
                </td>
                <td className="px-3 py-2 text-white font-mono">
                  {fmtUsd(r.currentPrice)}
                </td>
                <td
                  className={`px-3 py-2 font-bold font-mono ${pnlClass(r.unrealizedPnl)}`}
                >
                  {r.unrealizedPnl >= 0 ? '+' : ''}
                  {fmtUsd(r.unrealizedPnl)}
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
                    aria-label={`${t.closeAria} ${r.tokenId}`}
                  >
                    {isClosing ? (
                      <span className="inline-block w-3 h-3 border-2 border-muted border-t-transparent rounded-full animate-spin" />
                    ) : (
                      t.close
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

/* ── TradesTable ── */

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

interface TradesTableProps {
  rows: TradeRow[];
  t: typeof COPY['en'] & typeof COPY['vi'];
}

function TradesTable({ rows, t }: TradesTableProps) {
  if (rows.length === 0) {
    return (
      <div className="text-muted text-xs py-8 text-center border border-dashed border-outline rounded-lg">
        {t.noTradesYet}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] sm:min-w-[700px] text-xs">
        <thead className="border-b border-bg-border bg-bg">
          <tr>
            {[
              'Time',
              'Strategy',
              'Side',
              'Symbol',
              'Price',
              'Size',
              'PnL',
              'Mode',
            ].map((h) => (
              <th
                key={h}
                className="px-3 py-2 text-left text-[10px] uppercase tracking-widest text-muted whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className="border-b border-bg-border hover:bg-bg/50 transition-colors"
            >
              <td className="px-3 py-2 text-muted whitespace-nowrap">{r.time}</td>
              <td className="px-3 py-2 text-white">{r.strategy}</td>
              <td
                className={`px-3 py-2 font-bold ${r.side === 'BUY' ? 'text-profit' : 'text-loss'}`}
              >
                {r.side}
              </td>
              <td className="px-3 py-2 text-white font-mono">{r.symbol}</td>
              <td className="px-3 py-2 text-white font-mono">
                {fmtUsd(r.price)}
              </td>
              <td className="px-3 py-2 text-white">{r.size.toFixed(4)}</td>
              <td
                className={`px-3 py-2 font-bold font-mono ${pnlClass(r.pnl)}`}
              >
                {r.pnl >= 0 ? '+' : ''}
                {fmtUsd(r.pnl)}
              </td>
              <td className="px-3 py-2">
                {r.dryRun ? (
                  <span className="text-warning text-[10px]">{t.paper}</span>
                ) : (
                  <span className="text-profit text-[10px]">{t.liveLabel}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Page ── */

export function LiveTradingPage() {
  const { fetchApi } = useApiClient();
  const langState = useState<Lang>('en');
  const lang = langState[0];
  const setLang = langState[1];
  const t = COPY[lang];

  // Store-derived data
  const positions = useTradingStore((s) => s.positions);
  const botStatus = useTradingStore((s) => s.botStatus);
  const storeTrades = useTradingStore((s) => s.trades);
  const strategies = useTradingStore((s) => s.strategies);

  // Admin / guard status
  const { status: adminStatus, loading: adminLoading, refresh: refreshAdmin } =
    useAdminControls();

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

  // Initial trades fetch
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setTradesLoading(true);
      try {
        const data = (await fetchApi<Trade[]>('/trades')) ?? [];
        if (!cancelled) setApiTrades(data);
      } catch {
        if (!cancelled) setTradesError(t.failedToLoadTradeData);
      } finally {
        if (!cancelled) setTradesLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [fetchApi, t]);

  // Retry handler
  const retryLoadTrades = useCallback(async () => {
    setTradesLoading(true);
    setTradesError(null);
    try {
      const data = (await fetchApi<Trade[]>('/trades')) ?? [];
      setApiTrades(data);
    } catch {
      setTradesError(t.failedToLoadTradeData);
    } finally {
      setTradesLoading(false);
    }
  }, [fetchApi, t]);

  // Auto-refresh polling
  useEffect(() => {
    if (!autoRefresh) return;
    let active = true;
    async function poll() {
      if (document.hidden) return;
      try {
        await refreshAdmin();
        const data = (await fetchApi<Trade[]>('/trades')) ?? [];
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
  }, [autoRefresh, refreshAdmin, fetchApi, t]);

  /* ── Derived ── */

  const mode = botStatus?.mode ?? 'stopped';
  const running = botStatus?.running ?? false;

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

  const tradeRows = useMemo<TradeRow[]>(() => {
    return (storeTrades as TradeRecord[])
      .slice(0, 50)
      .map((trade) => ({
        id: trade.id,
        time: new Date(trade.timestamp).toLocaleString('en-US', {
          month: 'short',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }),
        strategy: trade.strategy,
        side: trade.side,
        symbol: trade.symbol,
        price: trade.price,
        size: trade.size,
        pnl: trade.pnl,
        dryRun: trade.dryRun,
      }));
  }, [storeTrades]);

  const circuitBreakerState = adminStatus?.circuitBreaker?.state ?? 'CLOSED';
  const isCircuitOpen = circuitBreakerState === 'OPEN';
  const consecutiveLosses = adminStatus?.drawdown?.isHalted
    ? adminStatus.drawdown.currentDrawdown > 0.05
      ? 3
      : 1
    : 0;

  // Risk metrics
  const riskMetrics = useMemo<RiskMetric[]>(() => {
    const peakEquity = adminStatus?.drawdown?.peakEquity ?? 0;
    const dailyLossVal =
      botStatus?.dailyPnl != null && botStatus.dailyPnl < 0 && peakEquity > 0
        ? Math.abs(botStatus.dailyPnl) / peakEquity * 100
        : 0;
    const totalPositionSize = positionRows.reduce(
      (sum, p) => sum + p.size * p.entryPrice,
      0
    );
    const positionSizeVal =
      peakEquity > 0 ? (totalPositionSize / peakEquity) * 100 : 0;
    const drawdownVal = adminStatus?.drawdown?.currentDrawdown
      ? adminStatus.drawdown.currentDrawdown * 100
      : 0;
    const maxDrawdownVal = adminStatus?.drawdown?.maxDrawdown
      ? adminStatus.drawdown.maxDrawdown * 100
      : 20;
    const equityUsed =
      peakEquity > 0 && adminStatus?.drawdown?.currentEquity != null
        ? (1 - adminStatus.drawdown.currentEquity / peakEquity) * 100
        : 0;
    const capitalUsedVal = Math.max(positionSizeVal, equityUsed);

    return [
      {
        label: t.dailyPnl.includes('ngày') ? t.dailyPnl : 'Daily Loss',
        value: Math.round(dailyLossVal * 10) / 10,
        max: 5,
        format: 'percent',
      },
      {
        label: 'Position Size',
        value: Math.round(positionSizeVal * 10) / 10,
        max: 20,
        format: 'percent',
      },
      {
        label: t.dailyPnl.includes('ngày') ? 'Drawdown' : 'Drawdown',
        value: Math.round(drawdownVal * 10) / 10,
        max: Math.round(maxDrawdownVal * 10) / 10,
        format: 'percent',
      },
      {
        label: t.consecutiveLosses,
        value: consecutiveLosses,
        max: 5,
        format: 'count',
      },
      {
        label: 'Capital Used',
        value: Math.round(capitalUsedVal * 10) / 10,
        max: 100,
        format: 'percent',
      },
    ];
  }, [adminStatus, botStatus, positionRows, consecutiveLosses, t]);

  // Stop bot handler
  const handleStopBot = useCallback(async () => {
    setStopping(true);
    setStopError(null);
    const result = (await fetchApi<{ success: boolean }>('/trading/stop', {
      method: 'POST',
    }));
    if (result?.success) {
      useTradingStore.getState().setBotStatus({ ...botStatus!, running: false });
      setStopDialogOpen(false);
    } else {
      setStopError(t.failedToStopBot);
    }
    setStopping(false);
  }, [fetchApi, botStatus, t]);

  // Close position handler
  const handleClosePosition = useCallback(
    async (id: string) => {
      if (closingPositionId) return;
      setClosingPositionId(id);
      setToast(null);
      try {
        const position = (positions as Position[]).find((p) => p.id === id);
        if (!position) {
          setToast({ msg: t.positionNotFound, type: 'error' });
          return;
        }
        const result = (await fetchApi<{ success: boolean }>(
          `/positions/${id}/close`,
          {
            method: 'POST',
            body: JSON.stringify({
              symbol: position.symbol,
              exchange: position.buyExchange,
              exitPrice: position.sellPrice || position.buyPrice,
            }),
          }
        ));
        if (result?.success) {
          setClosedPositionIds((prev) => new Set(prev).add(id));
          setToast({ msg: t.positionClosed, type: 'success' });
        } else {
          setToast({ msg: t.failedToClosePosition, type: 'error' });
        }
      } catch {
        setToast({ msg: t.failedToClosePosition, type: 'error' });
      } finally {
        setClosingPositionId(null);
      }
    },
    [closingPositionId, fetchApi, positions, t]
  );

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
    return sorted.map((trade) => {
      cumulative += trade.pnl;
      return { date: trade.date, value: cumulative };
    });
  }, [apiTrades]);

  /* ── KPI Sparkline Data ── */

  const dailyPnlSparkline = useMemo<{ value: number }[]>(() => {
    const byDay = new Map<string, number>();
    for (const trade of apiTrades) {
      const day = trade.date.split('T')[0];
      byDay.set(day, (byDay.get(day) ?? 0) + trade.pnl);
    }
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([_day, pnl]) => ({ value: pnl }));
  }, [apiTrades]);

  const winRateSparkline = useMemo<{ value: number }[]>(() => {
    const byDay = new Map<string, { wins: number; total: number }>();
    for (const trade of apiTrades) {
      const day = trade.date.split('T')[0];
      const curr = byDay.get(day) ?? { wins: 0, total: 0 };
      curr.total += 1;
      if (trade.pnl > 0) curr.wins += 1;
      byDay.set(day, curr);
    }
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([_day, stats]) => ({
        value: stats.total > 0 ? (stats.wins / stats.total) * 100 : 0,
      }));
  }, [apiTrades]);

  const winRate = useMemo(() => {
    if (apiTrades.length === 0) return 0;
    const wins = apiTrades.filter((t) => t.pnl > 0).length;
    return (wins / apiTrades.length) * 100;
  }, [apiTrades]);

  const openPosCount = useMemo(() => {
    return positions.filter((p) => p.status === 'open').length;
  }, [positions]);

  const dailyPnlTrend = useMemo(() => calcTrend(dailyPnlSparkline), [
    dailyPnlSparkline,
  ]);
  const winRateTrend = useMemo(() => calcTrend(winRateSparkline), [
    winRateSparkline,
  ]);

  /* ── Strategy Allocation ── */

  const strategyAllocation = useMemo<AllocationItem[]>(() => {
    const enabled = strategies.filter(
      (s) => s.enabled && s.mode !== 'stopped'
    );
    if (enabled.length === 0) return [];
    const perStrategy = 100 / enabled.length;
    return enabled.map((s) => ({ name: s.name, value: perStrategy }));
  }, [strategies]);

  /* ── Render ── */

    const circuitLabel =
    isCircuitOpen ? t.open : circuitBreakerState === 'HALF_OPEN' ? t.halfOpen : t.closed;

  return (
    <div className="min-h-screen bg-[${COLORS.bg}] text-[${COLORS.onSurface}] font-sans">
      {/* Language Toggle — globe icon, top right */}
      <div className="fixed top-4 right-4 z-50">
        <button
          onClick={() => setLang((l) => (l === 'en' ? 'vi' : 'en'))}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[${COLORS.surface}]/80 backdrop-blur-xl border border-[${COLORS.outline}] text-[${COLORS.onSurface}] hover:text-[${COLORS.primary}] transition-colors"
          aria-label={`Switch to ${t.langToggle}`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1 4-10 15.3 15.3 0 0 1-4-10z" />
          </svg>
          <span className="text-sm font-medium">{lang === 'en' ? 'VN' : 'EN'}</span>
        </button>
      </div>

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <h1 className="text-white text-2xl font-bold">{t.title}</h1>
            <ModeBadge mode={mode} />
          </div>
          <div className="flex items-center gap-2">
            {isStale && (
              <span className="text-warning text-[10px]">{t.stale}</span>
            )}
            <span
              className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-profit animate-pulse' : 'bg-bg-border'}`}
              title={autoRefresh ? 'Connected' : 'Paused'}
            />
            {adminLoading && (
              <span className="text-muted text-xs">{t.refreshing}</span>
            )}
            <button
              onClick={() => setAutoRefresh((p) => !p)}
              className="text-xs text-muted border border-outline px-3 py-1.5 rounded hover:text-white hover:border-muted/50 transition-colors min-h-touch"
            >
              {autoRefresh ? t.pause : t.resume}
            </button>
            {running && (
              <button
                onClick={() => setStopDialogOpen(true)}
                className="text-xs text-loss font-bold border border-loss/40 px-3 py-1.5 rounded hover:bg-loss/10 transition-colors min-h-touch"
              >
                {t.stopBot}
              </button>
            )}
            <button
              onClick={refreshAdmin}
              className="text-xs text-muted border border-outline px-3 py-1.5 rounded hover:text-white hover:border-muted/50 transition-colors min-h-touch"
            >
              {t.refresh}
            </button>
          </div>
        </div>

        {/* Equity Curve + Strategy Allocation */}
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

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <TradingKpiCard
            label={t.dailyPnl}
            value={fmtUsd(botStatus?.dailyPnl ?? 0)}
            accent={(botStatus?.dailyPnl ?? 0) >= 0 ? 'profit' : 'loss'}
            trend={dailyPnlTrend}
            sparklineData={dailyPnlSparkline}
          />
          <TradingKpiCard
            label={t.winRate}
            value={fmtPercent(winRate)}
            accent={winRate >= 50 ? 'profit' : winRate > 0 ? 'warning' : 'loss'}
            trend={winRateTrend}
            sparklineData={winRateSparkline}
          />
          <TradingKpiCard
            label={t.openPositions}
            value={String(openPosCount)}
            accent={openPosCount > 0 ? 'profit' : 'muted'}
          />
          <TradingKpiCard
            label={t.circuitBreaker}
            value={circuitLabel}
            accent={
              isCircuitOpen
                ? 'loss'
                : circuitBreakerState === 'HALF_OPEN'
                  ? 'warning'
                  : 'profit'
            }
            subLabel={adminStatus?.circuitBreaker?.reason ?? undefined}
          />
        </div>

        {/* Guard Status Card */}
        <div className="glass-card overflow-hidden p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <KpiCard
            label={t.botStatus}
            value={running ? t.running : t.stopped}
            accent={running ? 'profit' : 'loss'}
          />
          <KpiCard
            label={t.dailyPnl}
            value={fmtUsd(botStatus?.dailyPnl ?? 0)}
            accent={(botStatus?.dailyPnl ?? 0) >= 0 ? 'profit' : 'loss'}
          />
          <KpiCard
            label={t.circuitBreaker}
            value={circuitLabel}
            accent={
              isCircuitOpen
                ? 'loss'
                : circuitBreakerState === 'HALF_OPEN'
                  ? 'warning'
                  : 'profit'
            }
            subLabel={adminStatus?.circuitBreaker?.reason ?? undefined}
          />
          <KpiCard
            label={t.consecutiveLosses}
            value={String(consecutiveLosses)}
            accent={
              consecutiveLosses >= 3
                ? 'loss'
                : consecutiveLosses > 0
                  ? 'warning'
                  : 'profit'
            }
          />
        </div>

        {/* Risk Dashboard */}
        <section>
          <RiskDashboardGauges metrics={riskMetrics} stale={isStale} />
        </section>

        {/* Bot engine stats */}
        <div className="glass-card overflow-hidden p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <KpiCard
            label={t.uptime}
            value={
              botStatus
                ? `${Math.floor(botStatus.uptime / 3600)}${t.hours} ${Math.floor((botStatus.uptime % 3600) / 60)}${t.minutes}`
                : '—'
            }
          />
          <KpiCard
            label={t.totalSignals}
            value={String(botStatus?.totalSignals ?? '—')}
          />
          <KpiCard
            label={t.executedTrades}
            value={String(botStatus?.executedTrades ?? '—')}
            accent="profit"
          />
          <KpiCard
            label={t.rejectedTrades}
            value={String(botStatus?.rejectedTrades ?? '—')}
            accent={
              (botStatus?.rejectedTrades ?? 0) > 0 ? 'warning' : 'muted'
            }
          />
        </div>

        {/* Current Positions */}
        <section>
          <h2 className="text-xs font-semibold text-white mb-3">
            {t.openPositionsTitle} ({positionRows.length})
          </h2>
          <div className="glass-card overflow-hidden">
            <PositionsTable
              rows={positionRows}
              closingPositionId={closingPositionId}
              onClosePosition={handleClosePosition}
              t={t}
            />
          </div>
        </section>

        {/* Recent Trades */}
        <section>
          <h2 className="text-xs font-semibold text-white mb-3">
            {t.recentTrades} ({tradeRows.length})
            {tradesLoading && (
              <span className="text-muted text-[10px] ml-2 font-normal">
                {t.syncing}
              </span>
            )}
            {apiTrades.length > 0 && (
              <span className="text-muted text-[10px] ml-2 font-normal">
                ({apiTrades.length} {t.synced})
              </span>
            )}
          </h2>
          <div className="glass-card overflow-hidden">
            <TradesTable rows={tradeRows} t={t} />
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
          title={t.stopDialogTitle}
          message={
            <>
              <p>{t.stopDialogMsg}</p>
              {stopError && <p className="text-loss mt-2 text-xs">{stopError}</p>}
            </>
          }
          confirmLabel={stopping ? t.stopping : t.stop}
          variant="danger"
          onConfirm={handleStopBot}
          onCancel={() => {
            setStopDialogOpen(false);
            setStopError(null);
          }}
        />

        {/* Timeline note */}
        <p className="text-muted text-[10px] text-right">
          {t.dataSourced}
          {!autoRefresh ? ` · ${t.autoRefreshPaused}` : ` · ${t.autoRefreshing}`}
        </p>
      </div>
    </div>
  );
}

export default LiveTradingPage;
