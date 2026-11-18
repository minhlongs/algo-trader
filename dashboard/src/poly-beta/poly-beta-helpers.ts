/**
 * POLY-G5 Public Beta — Pure UI Formatting, Error Localization & Guard Helpers.
 */

import type { BetaMarket, BetaPortfolioView, BetaPosition } from './poly-beta-api-client';
import { POLY_BETA_COPY, type BetaLang } from './poly-beta-copy';

export type BannerTone = 'success' | 'warning' | 'error';

export interface StatusNotice {
  tone: BannerTone;
  message: string;
}

export function fmtSignedUsd(val: number, decimals = 4): string {
  if (!Number.isFinite(val) || val === 0) return `$${(0).toFixed(decimals)}`;
  const abs = Math.abs(val).toFixed(decimals);
  return val > 0 ? `+$${abs}` : `-$${abs}`;
}

export function microToNum(raw: unknown): number {
  const n = Number(raw ?? 0);
  return Number.isFinite(n) ? n / 1_000_000 : 0;
}

export function formatIsoTimestamp(msRaw: unknown): string {
  const ms = Number(msRaw ?? 0);
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? '—' : date.toISOString();
}

export function localizeBetaError(
  res: { status: number; data: { error?: string; code?: string; detail?: string } },
  lang: BetaLang,
  fallback: string,
): string {
  const t = POLY_BETA_COPY[lang];
  const { code, detail, error } = res.data;
  if (code === 'NETWORK_TIMEOUT') return t.networkTimeoutError;
  if (code === 'NETWORK_ERROR') return t.networkError;
  if (code === 'INVALID_RESPONSE') return t.invalidResponseError;
  const text = detail || error;
  if (text && code && !text.includes(code)) return `${text} (${code})`;
  if (text) return text;
  if (code) return `${fallback} (${code})`;
  return res.status > 0 ? `${fallback} (${res.status})` : fallback;
}

export function getEngineBadgeClasses(state: BetaPortfolioView['engine']['state']): string {
  switch (state) {
    case 'RUNNING':
      return 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-300';
    case 'PAUSED':
      return 'bg-amber-500/20 border border-amber-500/50 text-amber-300';
    case 'HALTED':
      return 'bg-rose-500/20 border border-rose-500/60 text-rose-200';
    case 'STOPPED':
    default:
      return 'bg-slate-800 border border-slate-700 text-slate-300';
  }
}

export function getBannerToneClasses(tone: BannerTone): string {
  switch (tone) {
    case 'error':
      return 'bg-rose-950/80 border-rose-500/60 text-rose-200';
    case 'warning':
      return 'bg-amber-950/70 border-amber-500/50 text-amber-200';
    case 'success':
    default:
      return 'bg-slate-900 border-emerald-500/40 text-emerald-200';
  }
}

export interface ControlAvailability {
  activeMarket: BetaMarket | undefined;
  feedReady: boolean;
  drawdownLocked: boolean;
  sharesValid: boolean;
  canStart: boolean;
  canPause: boolean;
  canStop: boolean;
  canManualTrade: boolean;
}

export function getControlAvailability(
  view: BetaPortfolioView,
  selectedMarket: string,
  orderShares: number,
  busy: boolean,
): ControlAvailability {
  const activeMarket = view.markets.find((m) => m.marketId === selectedMarket);
  const feedReady = view.health.marketFeedHealthy && view.markets.length > 0;
  const drawdownLocked =
    view.summary.maxDrawdownPct >= view.limits.maxDrawdownPct ||
    view.summary.currentDrawdownPct >= view.limits.maxDrawdownPct;
  const minShares = Math.max(5, activeMarket?.minOrderShares ?? 5);
  const sharesValid = Number.isFinite(orderShares) && orderShares >= minShares && orderShares <= 20;
  const state = view.engine.state;

  const canStart = !busy && state !== 'RUNNING' && feedReady && Boolean(activeMarket) && !drawdownLocked;
  const canPause = !busy && state === 'RUNNING';
  const canStop =
    !busy && (state === 'RUNNING' || state === 'PAUSED' || (state === 'HALTED' && view.pendingOrders.length > 0));
  const canManualTrade =
    !busy && feedReady && Boolean(activeMarket) && state !== 'HALTED' && !drawdownLocked && sharesValid;

  return {
    activeMarket,
    feedReady,
    drawdownLocked,
    sharesValid,
    canStart,
    canPause,
    canStop,
    canManualTrade,
  };
}

export function buildSettleButtonLabel(
  pos: BetaPosition,
  winningOutcome: 'YES' | 'NO',
  lang: BetaLang,
): string {
  const wins = pos.outcome === winningOutcome;
  const perShare = wins ? '$1' : '$0';
  const payout = (wins ? pos.shares : 0).toFixed(2);
  if (lang === 'vi') {
    return `Diễn tập: ${winningOutcome} thắng (${perShare}/cp → $${payout})`;
  }
  return `Drill: ${winningOutcome} wins (${perShare}/sh → $${payout})`;
}

/**
 * Shares actually sellable on one outcome token: open positions minus shares
 * already reserved by resting SELL orders. The backend rejects a sell that
 * exceeds this net figure, so the UI must preview the same limit.
 */
export function getSellableShares(
  view: BetaPortfolioView,
  marketId: string,
  outcome: 'YES' | 'NO',
): number {
  const held = view.openPositions
    .filter((p) => p.marketId === marketId && p.outcome === outcome)
    .reduce((sum, p) => sum + p.shares, 0);
  const reserved = view.pendingOrders
    .filter(
      (order) =>
        String(order.market_id ?? '') === marketId &&
        String(order.side ?? '') === 'SELL' &&
        String(order.outcome ?? '') === outcome,
    )
    .reduce((sum, order) => sum + microToNum(order.size_shares_micro), 0);
  return Math.max(0, held - reserved);
}

export function getSettlementPayoutUsd(
  view: BetaPortfolioView,
  marketId: string,
  winningOutcome: 'YES' | 'NO',
): number {
  return view.openPositions
    .filter((position) => position.marketId === marketId && position.outcome === winningOutcome)
    .reduce((total, position) => total + position.shares, 0);
}

export function buildSettleDrillConfirm(
  view: BetaPortfolioView,
  marketId: string,
  winningOutcome: 'YES' | 'NO',
  lang: BetaLang,
): string {
  const losingOutcome = winningOutcome === 'YES' ? 'NO' : 'YES';
  const marketPositions = view.openPositions.filter((p) => p.marketId === marketId);
  const marketQuestion = marketPositions[0]?.marketQuestion ?? marketId;
  const pendingCount = view.pendingOrders.filter((o) => String(o.market_id ?? '') === marketId).length;
  const totalPayout = getSettlementPayoutUsd(view, marketId, winningOutcome).toFixed(2);

  if (lang === 'vi') {
    return (
      `[DIỄN TẬP MÔ PHỎNG] Xác nhận tất toán thị trường "${marketQuestion}" với kết quả ${winningOutcome} THẮNG?\n\n` +
      `- Quy tắc: ${winningOutcome} nhận $1.00/cp, ${losingOutcome} nhận $0.00/cp.\n` +
      `- Đóng toàn bộ ${marketPositions.length} vị thế mở trên thị trường này (tổng tiền nhận về dự kiến: $${totalPayout}).\n` +
      `- Hủy ${pendingCount} lệnh đang chờ khớp trên thị trường này.`
    );
  }
  return (
    `[SIMULATED DRILL] Confirm settling "${marketQuestion}" with winning outcome ${winningOutcome}?\n\n` +
    `- Payout rule: ${winningOutcome} pays $1.00/sh, ${losingOutcome} pays $0.00/sh.\n` +
    `- Resolves all ${marketPositions.length} open position(s) on this market (estimated redemption: $${totalPayout}).\n` +
    `- Cancels ${pendingCount} pending order(s) on this market.`
  );
}
