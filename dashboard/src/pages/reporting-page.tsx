/**
 * Reporting page: generate and export analytics reports.
 * Bilingual EN/VI dark fintech pattern.
 */
import { useState } from 'react';
import { StitchCardHeader, StitchCardBody } from '../components/ui/stitch-card';
import { StitchStatCard } from '../components/ui/stitch-stat-card';
import { StitchBadge } from '../components/ui/stitch-badge';
import { StitchButton } from '../components/ui/stitch-button';
import { StitchTabs } from '../components/ui/stitch-tabs';
import { StitchSectionTitle } from '../components/ui/stitch-section-title';
import { COLORS } from '../lib/stitch-design-tokens';
import { useRevenueAnalytics } from '../hooks/use-revenue-analytics';
import { useLicenseAnalytics } from '../hooks/use-license-analytics';
import { ExportReportButton } from '../components/export-report-button';

type ReportType = 'revenue' | 'licenses' | 'usage' | 'combined';
type StatTone = 'primary' | 'profit' | 'loss' | 'warning' | 'neutral';
type Lang = 'en' | 'vi';

const COPY: Record<Lang, Record<string, string>> = {
  en: {
    langToggle: 'Tiếng Việt',
    title: 'Reporting',
    subtitle: 'Generate and export analytics reports',
    eyebrow: 'SHORTCUTS',
    tabRevenue: 'Revenue',
    tabLicenses: 'Licenses',
    tabUsage: 'Usage',
    tabCombined: 'Combined',
    timeRange7d: '7 days',
    timeRange30d: '30 days',
    timeRange90d: '90 days',
    timeRange1y: '1 year',
    periodLabel: 'reporting period',
    scheduleReport: 'Schedule Report',
    revenueDesc: 'Revenue reports: MRR, DAL, churn, ARPA. Updated every 30s.',
    licensesDesc: 'License reports: active licenses, usage, audit logs, health metrics.',
    usageDesc: 'Usage reports: API volumes, endpoint breakdown, quota consumption.',
    combinedDesc: 'Combined: all metrics in a single comprehensive export.',
    btnViewDetails: 'View Details',
    btnDownloadTemplate: 'Download Template',
    btnGenerateFull: 'Generate Full Report',
    btnCustomize: 'Customize Fields',
    btnDailySummary: 'Daily Summary',
    btnWeeklyTrends: 'Weekly Trends',
    btnMonthlyPackage: 'Monthly Package',
    btnRealtime: 'Real-time',
    hintDaily: 'Last 24h',
    hintWeekly: '7-day comparison',
    hintMonthly: 'Full month data',
    hintRealtime: 'Live snapshot',
    statTotalRevenue: 'Total Revenue',
    statMRR: 'MRR',
    statDAL: 'DAL',
    statChurn: 'Churn Rate',
    statTotalLicenses: 'Total Licenses',
    statAtRisk: 'At Risk',
    statExceeded: 'Exceeded',
    statHealth: 'Health Score',
  },
  vi: {
    langToggle: 'English',
    title: 'Báo cáo',
    subtitle: 'Tạo và xuất báo cáo phân tích',
    eyebrow: 'LỐI TẮT',
    tabRevenue: 'Doanh thu',
    tabLicenses: 'Giấy phép',
    tabUsage: 'Sử dụng',
    tabCombined: 'Tổng hợp',
    timeRange7d: '7 ngày',
    timeRange30d: '30 ngày',
    timeRange90d: '90 ngày',
    timeRange1y: '1 năm',
    periodLabel: 'kỳ báo cáo',
    scheduleReport: 'Lên lịch báo cáo',
    revenueDesc: 'Báo cáo doanh thu: MRR, DAL, tỷ lệ rời bỏ, ARPA. Cập nhật mỗi 30s.',
    licensesDesc: 'Báo cáo giấy phép: giấy phép hoạt động, mức sử dụng, nhật ký kiểm toán, chỉ số sức khỏe.',
    usageDesc: 'Báo cáo sử dụng: khối lượng API, phân tích endpoint, tiêu thúc hạn ngạch.',
    combinedDesc: 'Tổng hợp: tất cả chỉ số trong một xuất đơn, toàn diện.',
    btnViewDetails: 'Xem chi tiết',
    btnDownloadTemplate: 'Tải mẫu',
    btnGenerateFull: 'Tạo báo cáo đầy đủ',
    btnCustomize: 'Tùy chỉnh trường',
    btnDailySummary: 'Tóm tắt ngày',
    btnWeeklyTrends: 'Xu hướng tuần',
    btnMonthlyPackage: 'Gói tháng',
    btnRealtime: 'Thời gian thực',
    hintDaily: '24h qua',
    hintWeekly: 'So sánh 7 ngày',
    hintMonthly: 'Dữ liệu cả tháng',
    hintRealtime: 'Ảnh chụp trực tiếp',
    statTotalRevenue: 'Tổng doanh thu',
    statMRR: 'MRR',
    statDAL: 'DAL',
    statChurn: 'Tỷ lệ rời bỏ',
    statTotalLicenses: 'Tổng giấy phép',
    statAtRisk: 'Có rủi ro',
    statExceeded: 'Vượt ngạch',
    statHealth: 'Điểm sức khỏe',
  },
};

const REPORT_TYPES = [
  { id: 'revenue', labelKey: 'tabRevenue' },
  { id: 'licenses', labelKey: 'tabLicenses' },
  { id: 'usage', labelKey: 'tabUsage' },
  { id: 'combined', labelKey: 'tabCombined' },
] as const;

const TIME_RANGES = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: '1y', label: '1 year' },
];

const TIME_RANGE_MAP: Record<string, { en: string; vi: string }> = {
  '7d': { en: '7 days', vi: '7 ngày' },
  '30d': { en: '30 days', vi: '30 ngày' },
  '90d': { en: '90 days', vi: '90 ngày' },
  '1y': { en: '1 year', vi: '1 năm' },
};

export function ReportingPage() {
  const [lang, setLang] = useState<Lang>('en');
  const [activeReport, setActiveReport] = useState<ReportType>('revenue');
  const [timeRange, setTimeRange] = useState('30d');
  const t = COPY[lang];

  const { metrics } = useRevenueAnalytics();
  const { analytics: licenseAnalytics } = useLicenseAnalytics();

  const formatCurrency = (v: number) => `$${v.toLocaleString()}`;
  const formatNumber = (v: number) => v.toLocaleString();

  const getStats = (): Array<{ label: string; value: string; tone: StatTone }> => {
    if (!metrics) return [];
    switch (activeReport) {
      case 'revenue':
        return [
          { label: t.statTotalRevenue, value: formatCurrency(licenseAnalytics?.revenue?.totalRevenue || 0), tone: 'primary' as const },
          { label: t.statMRR, value: formatCurrency(metrics.mrr), tone: 'primary' },
          { label: t.statDAL, value: formatNumber(metrics.dal), tone: 'profit' },
          { label: t.statChurn, value: `${metrics.churnRate.toFixed(2)}%`, tone: 'warning' },
        ];
      case 'licenses':
        return licenseAnalytics
          ? [
              { label: t.statTotalLicenses, value: formatNumber(licenseAnalytics.licenseHealth?.healthy || 0), tone: 'primary' as const },
              { label: t.statAtRisk, value: formatNumber(licenseAnalytics.licenseHealth?.atRisk || 0), tone: 'warning' },
              { label: t.statExceeded, value: formatNumber(licenseAnalytics.licenseHealth?.exceeded || 0), tone: 'loss' },
              { label: t.statHealth, value: `${licenseAnalytics.licenseHealth?.healthScore || 0}%`, tone: 'primary' },
            ]
          : [];
      default:
        return [];
    }
  };

  const stats = getStats();
  const langLabel = lang === 'en' ? COPY.vi.langToggle : COPY.en.langToggle;
  const periodLabel = `${TIME_RANGE_MAP[timeRange]?.[lang] || timeRange} — ${t.periodLabel}`;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e3e2e2] font-sans">
      <div className="space-y-6 p-6">
        {/* Header + language toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: COLORS.onSurface }}>{t.title}</h1>
            <p className="text-sm" style={{ color: COLORS.onSurfaceVariant }}>{t.subtitle}</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Time range selector */}
            <div className="flex items-center gap-1" style={{ backgroundColor: `${COLORS.bg}55`, border: `1px solid ${COLORS.outline}`, borderRadius: '0.5rem' }}>
              {TIME_RANGES.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setTimeRange(r.value)}
                  className="px-3 py-1.5 text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: timeRange === r.value ? `${COLORS.primary}33` : 'transparent',
                    color: timeRange === r.value ? COLORS.primary : COLORS.onSurfaceVariant,
                  }}
                >
                  {lang === 'en' ? r.label : TIME_RANGE_MAP[r.value]?.vi || r.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setLang(lang === 'en' ? 'vi' : 'en')}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors rounded-lg"
              style={{
                backgroundColor: COLORS.surface,
                border: `1px solid ${COLORS.outline}`,
                color: COLORS.onSurfaceVariant,
              }}
              aria-label="Toggle language"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              {langLabel}
            </button>
            {metrics && <ExportReportButton metrics={metrics} timeRange={timeRange} variant="primary" />}
          </div>
        </div>

        <StitchTabs
          active={activeReport}
          tabs={REPORT_TYPES.map((rt) => t[rt.labelKey])}
          onChange={(label) => {
            const next = REPORT_TYPES.find((rt) => t[rt.labelKey] === label);
            if (next) setActiveReport(next.id);
          }}
        />

        {stats.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((s) => <StitchStatCard key={s.label} label={s.label} value={s.value} tone={s.tone} />)}
          </div>
        )}

        <div className="glass-card">
          <StitchCardHeader>
            <div className="flex items-center gap-3">
              <StitchBadge label={t[REPORT_TYPES.find((rt) => rt.id === activeReport)!.labelKey]} tone="primary" />
              <span className="text-sm" style={{ color: COLORS.onSurfaceVariant }}>{periodLabel}</span>
            </div>
            <StitchButton onClick={() => {}} variant="secondary">{t.scheduleReport}</StitchButton>
          </StitchCardHeader>
          <StitchCardBody>
            {activeReport === 'revenue' && (
              <>
                <p style={{ color: COLORS.onSurfaceVariant }}>{t.revenueDesc}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <StitchButton variant="secondary">{t.btnViewDetails}</StitchButton>
                  <StitchButton variant="ghost">{t.btnDownloadTemplate}</StitchButton>
                </div>
              </>
            )}
            {activeReport === 'licenses' && (
              <>
                <p style={{ color: COLORS.onSurfaceVariant }}>{t.licensesDesc}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <StitchButton variant="secondary">{t.btnViewDetails}</StitchButton>
                  <StitchButton variant="ghost">{t.btnDownloadTemplate}</StitchButton>
                </div>
              </>
            )}
            {activeReport === 'usage' && (
              <>
                <p style={{ color: COLORS.onSurfaceVariant }}>{t.usageDesc}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <StitchButton variant="secondary">{t.btnViewDetails}</StitchButton>
                  <StitchButton variant="ghost">{t.btnDownloadTemplate}</StitchButton>
                </div>
              </>
            )}
            {activeReport === 'combined' && (
              <>
                <p style={{ color: COLORS.onSurfaceVariant }}>{t.combinedDesc}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <StitchButton variant="secondary">{t.btnGenerateFull}</StitchButton>
                  <StitchButton variant="ghost">{t.btnCustomize}</StitchButton>
                </div>
              </>
            )}
          </StitchCardBody>
        </div>

        <StitchSectionTitle title={t.eyebrow === 'SHORTCUTS' ? t.eyebrow : ''} eyebrow="SHORTCUTS" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: t.btnDailySummary, emoji: '📊', hint: t.hintDaily },
            { label: t.btnWeeklyTrends, emoji: '📈', hint: t.hintWeekly },
            { label: t.btnMonthlyPackage, emoji: '🎯', hint: t.hintMonthly },
            { label: t.btnRealtime, emoji: '⚡', hint: t.hintRealtime },
          ].map((item) => (
            <StitchButton key={item.label} variant="secondary" className="h-auto py-4 flex flex-col items-start gap-2">
              <span className="text-lg">{item.emoji}</span>
              <span className="font-semibold">{item.label}</span>
              <span className="text-xs" style={{ color: COLORS.onSurfaceVariant }}>{item.hint}</span>
            </StitchButton>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ReportingPage;
