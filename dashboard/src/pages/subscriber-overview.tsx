/**
 * Subscriber Overview Page
 * KPI cards: total P&L, win rate, fills, blocked-DLP count, active signals.
 * Entry point for the multi-tenant subscriber lens.
 * Stitch dark fintech bilingual VN+EN pattern.
 */

import { useState } from 'react';
import { useAuthStore } from '../stores/auth-store';
import { useSubscriberPnl } from '../hooks/use-subscriber-pnl';
import { SubscriberKpiCard } from '../components/subscriber-kpi-card';

type Lang = 'en' | 'vi';

const COPY: Record<Lang, {
  langToggle: string;
  title: string;
  tenantLabel: string;
  refresh: string;
  refreshing: string;
  retry: string;
  pnlSummary: string;
  totalRealizedPnl: string;
  winRate: string;
  totalTrades: string;
  lifetimeFills: string;
  profitFactor: string;
  activity: string;
  activeSignals: string;
  totalFills: string;
  pendingOrders: string;
  blockedByDlp: string;
  ironClawPhase: string;
  tradeExtremes: string;
  bestTrade: string;
  worstTrade: string;
  noIdentity: string;
  noIdentityHint: string;
  loading: string;
}> = {
  en: {
    langToggle: 'Tiếng Việt',
    title: 'Subscriber Overview',
    tenantLabel: 'Tenant',
    refresh: 'Refresh',
    refreshing: 'Refreshing...',
    retry: 'Retry',
    pnlSummary: 'P&L Summary',
    totalRealizedPnl: 'Total Realized P&L',
    winRate: 'Win Rate',
    totalTrades: 'Total Trades',
    lifetimeFills: 'lifetime fills',
    profitFactor: 'Profit Factor',
    activity: 'Activity',
    activeSignals: 'Active Signals',
    totalFills: 'Total Fills',
    pendingOrders: 'Pending Orders',
    blockedByDlp: 'Blocked by DLP',
    ironClawPhase: 'IronClaw Phase 03',
    tradeExtremes: 'Trade Extremes',
    bestTrade: 'Best Trade',
    worstTrade: 'Worst Trade',
    noIdentity: 'No subscriber identity found. Please log in with a valid license key.',
    noIdentityHint: 'Please log in with a valid license key.',
    loading: 'Loading subscriber metrics...',
  },
  vi: {
    langToggle: 'English',
    title: 'Tổng Quan Người Đăng Ký',
    tenantLabel: 'Đối tác',
    refresh: 'Làm mới',
    refreshing: 'Đang làm mới...',
    retry: 'Thử lại',
    pnlSummary: 'Tóm Tắt P&L',
    totalRealizedPnl: 'Tổng P&L Thực Hiện',
    winRate: 'Tỷ Lệ Thắng',
    totalTrades: 'Tổng Giao Dịch',
    lifetimeFills: 'lần khớp lệnh',
    profitFactor: 'Hệ Số Lợi Nhuận',
    activity: 'Hoạt Động',
    activeSignals: 'Tín Hiệu Hoạt Động',
    totalFills: 'Tổng Lệnh Khớp',
    pendingOrders: 'Lệnh Chờ',
    blockedByDlp: 'Bị Chặn bởi DLP',
    ironClawPhase: 'IronClaw Phase 03',
    tradeExtremes: 'Cực Điểm Giao Dịch',
    bestTrade: 'Giao Dịch Tốt Nhất',
    worstTrade: 'Giao Dịch Tệ Nhất',
    noIdentity: 'Không tìm thấy danh tính người đăng ký. Vui lòng đăng nhập bằng khóa bản quyền hợp lệ.',
    noIdentityHint: 'Vui lòng đăng nhập bằng khóa bản quyền hợp lệ.',
    loading: 'Đang tải số liệu người đăng ký...',
  },
};

function fmt(n: number, dec = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function pctFmt(n: number): string {
  return `${fmt(n * 100, 1)}%`;
}

interface ErrorBannerProps {
  message: string;
  retryLabel: string;
  onRetry: () => void;
}
function ErrorBanner({ message, retryLabel, onRetry }: ErrorBannerProps) {
  return (
    <div className="p-4 bg-loss/10 border border-loss/40 rounded-lg text-loss text-sm font-mono flex items-center justify-between">
      <span>{message}</span>
      <button
        onClick={onRetry}
        className="ml-4 px-3 py-1 bg-loss/20 hover:bg-loss/30 rounded text-xs transition-colors"
      >
        {retryLabel}
      </button>
    </div>
  );
}

export function SubscriberOverviewPage() {
  const [lang, setLang] = useState<Lang>('en');
  const t = COPY[lang];

  const tenantId = useAuthStore((s) => s.tenantId);
  const { summary, activity, loading, error, refresh } = useSubscriberPnl(tenantId);

  if (!tenantId) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-[#e3e2e2] font-sans">
        {/* Language Toggle — globe icon, top right */}
        <div className="fixed top-4 right-4 z-50">
          <button
            onClick={() => setLang(lang === 'en' ? 'vi' : 'en')}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#121414]/80 backdrop-blur-xl border border-[#414754] text-[#e3e2e2] hover:text-[#aec6ff] transition-colors"
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
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            <span className="text-sm font-medium">{lang === 'en' ? 'VN' : 'EN'}</span>
          </button>
        </div>
        <div className="p-6 text-muted text-sm font-mono">{t.noIdentity}</div>
      </div>
    );
  }

  if (loading && !summary) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-[#e3e2e2] font-sans">
        {/* Language Toggle — globe icon, top right */}
        <div className="fixed top-4 right-4 z-50">
          <button
            onClick={() => setLang(lang === 'en' ? 'vi' : 'en')}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#121414]/80 backdrop-blur-xl border border-[#414754] text-[#e3e2e2] hover:text-[#aec6ff] transition-colors"
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
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            <span className="text-sm font-medium">{lang === 'en' ? 'VN' : 'EN'}</span>
          </button>
        </div>
        <div className="flex flex-col items-center justify-center py-20 text-muted font-mono text-sm">
          {t.loading}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e3e2e2] font-sans">
      {/* Language Toggle — globe icon, top right */}
      <div className="fixed top-4 right-4 z-50">
        <button
          onClick={() => setLang(lang === 'en' ? 'vi' : 'en')}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#121414]/80 backdrop-blur-xl border border-[#414754] text-[#e3e2e2] hover:text-[#aec6ff] transition-colors"
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
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          <span className="text-sm font-medium">{lang === 'en' ? 'VN' : 'EN'}</span>
        </button>
      </div>

      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between pt-8">
          <div>
            <h1 className="text-xl font-bold text-white font-mono">{t.title}</h1>
            <p className="text-muted text-xs font-mono mt-0.5">
              {t.tenantLabel}: <span className="text-accent">{tenantId}</span>
            </p>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="px-3 py-1.5 bg-surface border border-border rounded text-xs font-mono text-muted hover:text-white hover:border-accent transition-colors disabled:opacity-40"
          >
            {loading ? t.refreshing : t.refresh}
          </button>
        </div>

        {error && <ErrorBanner message={error} retryLabel={t.retry} onRetry={refresh} />}

        {/* P&L KPI row */}
        <section>
          <h2 className="text-[10px] uppercase tracking-widest text-muted font-mono mb-3">
            {t.pnlSummary}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <SubscriberKpiCard
              label={t.totalRealizedPnl}
              value={summary ? (summary.totalRealizedPnl >= 0 ? '+' : '') + fmt(summary.totalRealizedPnl, 4) : '—'}
              accent={summary && summary.totalRealizedPnl >= 0 ? 'profit' : 'loss'}
              subLabel="USDT"
            />
            <SubscriberKpiCard
              label={t.winRate}
              value={summary ? pctFmt(summary.winRate) : '—'}
              accent={summary && summary.winRate >= 0.5 ? 'profit' : 'loss'}
              subLabel={summary ? `${summary.winCount}W / ${summary.lossCount}L` : undefined}
            />
            <SubscriberKpiCard
              label={t.totalTrades}
              value={summary?.tradeCount ?? '—'}
              subLabel={t.lifetimeFills}
            />
            <SubscriberKpiCard
              label={t.profitFactor}
              value={summary
                ? summary.profitFactor === Infinity ? '∞' : fmt(summary.profitFactor)
                : '—'}
              accent={summary && summary.profitFactor >= 1 ? 'profit' : 'loss'}
            />
          </div>
        </section>

        {/* Activity KPI row */}
        <section>
          <h2 className="text-[10px] uppercase tracking-widest text-muted font-mono mb-3">
            {t.activity}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <SubscriberKpiCard
              label={t.activeSignals}
              value={activity?.activeSignalsCount ?? '—'}
              accent="default"
            />
            <SubscriberKpiCard
              label={t.totalFills}
              value={activity?.totalFillsCount ?? '—'}
              accent="profit"
            />
            <SubscriberKpiCard
              label={t.pendingOrders}
              value={activity?.pendingOrdersCount ?? '—'}
              accent="warning"
            />
            <SubscriberKpiCard
              label={t.blockedByDlp}
              value={activity?.blockedDlpCount ?? '—'}
              accent={activity && activity.blockedDlpCount > 0 ? 'loss' : 'muted'}
              subLabel={t.ironClawPhase}
            />
          </div>
        </section>

        {/* Best / Worst */}
        {summary && (
          <section>
            <h2 className="text-[10px] uppercase tracking-widest text-muted font-mono mb-3">
              {t.tradeExtremes}
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <SubscriberKpiCard
                label={t.bestTrade}
                value={`+${fmt(summary.bestTrade, 4)}`}
                accent="profit"
                subLabel="USDT"
              />
              <SubscriberKpiCard
                label={t.worstTrade}
                value={fmt(summary.worstTrade, 4)}
                accent="loss"
                subLabel="USDT"
              />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
