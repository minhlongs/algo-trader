/**
 * Subscriber Equity Page
 * Renders the per-subscriber equity curve (NAV over time) + summary stats.
 * Dark fintech bilingual VN+EN pattern.
 */

import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/auth-store';
import { useSubscriberPnl } from '../hooks/use-subscriber-pnl';
import { SubscriberEquityChart } from '../components/subscriber-equity-chart';
import { SubscriberKpiCard } from '../components/subscriber-kpi-card';
import { COLORS } from '../lib/stitch-design-tokens';

type Lang = 'en' | 'vi';

const COPY: Record<Lang, Record<string, string>> = {
  en: {
    langToggle: 'Tiếng Việt',
    title: 'Equity Curve',
    subtitle: 'Per-subscriber NAV over time · performance snapshot',
    labelStartingCapital: 'Starting Capital',
    currency: 'USDT',
    labelCurrentNav: 'Current NAV',
    labelTotalReturn: 'Total Return',
    labelMaxDrawdown: 'Max Drawdown',
    refresh: 'Refresh',
    refreshing: 'Refreshing...',
    noIdentity: 'No subscriber identity found. Please log in with a valid license key.',
    loading: 'Loading equity curve...',
    retry: 'Retry',
    snapshotCount: 'daily snapshots · last',
  },
  vi: {
    langToggle: 'English',
    title: 'Đường cong Vốn',
    subtitle: 'NAV theo thời gian cho từng người dùng · ảnh chụp hiệu suất',
    labelStartingCapital: 'Vốn Ban đầu',
    currency: 'USDT',
    labelCurrentNav: 'NAV Hiện tại',
    labelTotalReturn: 'Lợi nhuận Tổng',
    labelMaxDrawdown: 'Mất giá Tối đa',
    refresh: 'Làm mới',
    refreshing: 'Đang làm mới...',
    noIdentity: 'Không tìm thấy danh tính người dùng. Vui lòng đăng nhập bằng license key hợp lệ.',
    loading: 'Đang tải đường cong vốn...',
    retry: 'Thử lại',
    snapshotCount: 'ảnh chụp hàng ngày · mới nhất:',
  },
};

function fmt(n: number, dec = 4): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

export function SubscriberEquityPage() {
  const tenantId = useAuthStore((s) => s.tenantId);
  const { equity, loading, error, refresh } = useSubscriberPnl(tenantId);

  const [lang, setLang] = useState<Lang>('en');
  const t = COPY[lang];
  const langLabel = lang === 'en' ? COPY.vi.langToggle : COPY.en.langToggle;

  useEffect(() => {
    if (!tenantId) refresh();
  }, [tenantId, refresh]);

  if (!tenantId) {
    return (
      <div className="p-6 text-sm font-mono" style={{ color: COLORS.onSurfaceVariant }}>
        {t.noIdentity}
      </div>
    );
  }

  if (loading && !equity) {
    return (
      <div
        className="flex items-center justify-center py-20 text-sm font-mono"
        style={{ color: COLORS.onSurfaceVariant }}
      >
        {t.loading}
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="p-4 rounded-lg text-sm font-mono flex items-center justify-between gap-4"
        style={{
          backgroundColor: `${COLORS.loss}10`,
          border: `1px solid ${COLORS.loss}40`,
          color: COLORS.loss,
        }}
      >
        <span>{error}</span>
        <button
          onClick={refresh}
          className="px-3 py-1 rounded text-xs transition-colors"
          style={{
            backgroundColor: `${COLORS.loss}20`,
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.backgroundColor = `${COLORS.loss}30`)
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.backgroundColor = `${COLORS.loss}20`)
          }
        >
          {t.retry}
        </button>
      </div>
    );
  }

  const totalReturn = equity?.totalReturn ?? 0;
  const currentNav = equity?.currentNav ?? equity?.startingCapital ?? 0;
  const startingCapital = equity?.startingCapital ?? 10000;
  const maxDrawdown = equity?.maxDrawdown ?? 0;
  const navAccent = currentNav >= startingCapital ? 'profit' : 'loss';
  const retAccent = totalReturn >= 0 ? 'profit' : 'loss';
  const ddAccent = maxDrawdown > 0.1 ? 'loss' : 'warning';

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e3e2e2] font-sans">
      <div className="space-y-6 p-6">
        {/* Header + language toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: COLORS.onSurface }}>
              {t.title}
            </h1>
            <p
              className="text-sm mt-1"
              style={{ color: COLORS.onSurfaceVariant }}
            >
              {t.subtitle}
            </p>
          </div>
          <button
            onClick={() => setLang(lang === 'en' ? 'vi' : 'en')}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors self-start"
            style={{
              backgroundColor: COLORS.surface,
              border: `1px solid ${COLORS.outline}`,
              color: COLORS.onSurfaceVariant,
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
            </svg>
            {langLabel}
          </button>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <SubscriberKpiCard
            label={t.labelStartingCapital}
            value={fmt(startingCapital)}
            subLabel={t.currency}
          />
          <SubscriberKpiCard
            label={t.labelCurrentNav}
            value={fmt(currentNav)}
            accent={navAccent}
            subLabel={t.currency}
          />
          <SubscriberKpiCard
            label={t.labelTotalReturn}
            value={`${totalReturn >= 0 ? '+' : ''}${fmt(totalReturn * 100, 2)}%`}
            accent={retAccent}
          />
          <SubscriberKpiCard
            label={t.labelMaxDrawdown}
            value={`${fmt(maxDrawdown * 100, 2)}%`}
            accent={ddAccent}
          />
        </div>

        {/* Chart */}
        <div
          className="rounded-2xl p-4"
          style={{
            backgroundColor: `${COLORS.surface}CC`,
            backdropFilter: 'blur 24px',
            WebkitBackdropFilter: 'blur 24px',
            border: `1px solid ${COLORS.outline}`,
          }}
        >
          <SubscriberEquityChart
            curve={equity?.curve ?? []}
            totalReturn={totalReturn}
            height={280}
          />
        </div>

        {/* Data points count */}
        {equity && equity.curve.length > 0 && (
          <p
            className="text-[10px] font-mono text-right"
            style={{ color: COLORS.onSurfaceVariant }}
          >
            {equity.curve.length} {t.snapshotCount}{' '}
            {equity.curve[equity.curve.length - 1].date}
          </p>
        )}
      </div>
    </div>
  );
}
