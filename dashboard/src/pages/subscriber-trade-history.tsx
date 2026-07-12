/**
 * Subscriber Trade History Page
 * Shows daily P&L breakdown table for the logged-in subscriber.
 * Scoped strictly to tenantId from auth store.
 * Dark fintech bilingual VN+EN pattern.
 */

import { useState } from 'react';
import { useAuthStore } from '../stores/auth-store';
import { useSubscriberPnl } from '../hooks/use-subscriber-pnl';
import { SubscriberTradeTable } from '../components/subscriber-trade-table';

type Lang = 'en' | 'vi';

const COPY: Record<Lang, Record<string, string>> = {
  en: {
    langToggle: 'Tiếng Việt',
    title: 'Trade History',
    subtitle: 'Daily P&L breakdown and lifetime trade summary',
    tenantLabel: 'Tenant',
    lifetimeFills: 'lifetime fills',
    refresh: 'Refresh',
    loading: 'Loading...',
    retry: 'Retry',
    noIdentity: 'No subscriber identity found. Please log in with a valid license key.',
    periodNote: 'Showing last 30 days · {count} daily rows',
    noDataLoad: 'Loading trades...',
    noDataPeriod: 'No trade data for this period',
  },
  vi: {
    langToggle: 'English',
    title: 'Lịch Sử Giao Dịch',
    subtitle: 'Phân tích P&L hàng ngày và tóm tắt giao dịch trọn đời',
    tenantLabel: 'Thuê bao',
    lifetimeFills: 'giao dịch lấp đầy trọn đời',
    refresh: 'Làm mới',
    loading: 'Đang tải...',
    retry: 'Thử lại',
    noIdentity: 'Không tìm thấy danh tính người đăng ký. Vui lòng đăng nhập bằng khóa bản quyền hợp lệ.',
    periodNote: 'Hiển thị 30 ngày gần nhất · {count} hàng hàng ngày',
    noDataLoad: 'Đang tải giao dịch...',
    noDataPeriod: 'Không có dữ liệu giao dịch trong giai đoạn này',
  },
};

export function SubscriberTradeHistoryPage() {
  const [lang, setLang] = useState<Lang>('en');
  const t = COPY[lang];

  const tenantId = useAuthStore((s) => (s as unknown as { tenantId: string | null }).tenantId);
  const { dailyBreakdown, summary, loading, error, refresh } = useSubscriberPnl(tenantId);

  const periodNoteText = lang === 'vi'
    ? t.periodNote.replace('{count}', String(dailyBreakdown.length))
    : t.periodNote.replace('{count}', String(dailyBreakdown.length));

  if (!tenantId) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-[#e3e2e2] font-sans">
        <div className="flex justify-end px-4 sm:px-8 pt-6">
          <button
            onClick={() => setLang((l: Lang) => (l === 'en' ? 'vi' : 'en'))}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#414754] bg-[#121414]/80 text-[#c1c6d7] text-xs hover:border-[#aec6ff] hover:text-[#aec6ff] transition-colors"
            aria-label="Toggle language"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10" />
            </svg>
            {t.langToggle}
          </button>
        </div>
        <div className="p-6 text-[#c1c6d7] text-sm font-mono">
          {t.noIdentity}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e3e2e2] font-sans">
      {/* Lang toggle */}
      <div className="flex justify-end px-4 sm:px-8 pt-6">
        <button
          onClick={() => setLang((l: Lang) => (l === 'en' ? 'vi' : 'en'))}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#414754] bg-[#121414]/80 text-[#c1c6d7] text-xs hover:border-[#aec6ff] hover:text-[#aec6ff] transition-colors"
          aria-label="Toggle language"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10" />
          </svg>
          {t.langToggle}
        </button>
      </div>

      <div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white font-mono">{t.title}</h1>
            <p className="text-[#c1c6d7] text-xs font-mono mt-0.5">
              {t.tenantLabel}: <span className="text-[#aec6ff]">{tenantId}</span>
              {summary && (
                <span className="ml-3 text-[#c1c6d7]">
                  · {summary.tradeCount} {t.lifetimeFills}
                </span>
              )}
            </p>
            <p className="text-[#c1c6d7] text-[10px] font-mono mt-0.5">{t.subtitle}</p>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="px-3 py-1.5 bg-[#121414]/80 border border-[#414754] rounded-lg text-xs font-mono text-[#c1c6d7] hover:text-white hover:border-[#aec6ff] transition-colors disabled:opacity-40"
          >
            {loading ? t.loading : t.refresh}
          </button>
        </div>

        {error && (
          <div className="p-4 bg-[#121414]/80 border border-[#ffb4ab]/40 rounded-2xl text-[#ffb4ab] text-sm font-mono flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={refresh}
              className="ml-4 px-3 py-1 bg-[#ffb4ab]/20 hover:bg-[#ffb4ab]/30 rounded-lg text-xs transition-colors"
            >
              {t.retry}
            </button>
          </div>
        )}

        {/* Trade breakdown table */}
        <div className="glass-card">
          <SubscriberTradeTable rows={dailyBreakdown} loading={loading && dailyBreakdown.length === 0} />
        </div>

        {/* Period note */}
        {!loading && dailyBreakdown.length > 0 && (
          <p className="text-[#c1c6d7] text-[10px] font-mono text-right">
            {periodNoteText}
          </p>
        )}
      </div>
    </div>
  );
}
