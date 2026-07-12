/**
 * Analytics Dashboard Page
 *
 * Main revenue analytics dashboard with metrics, charts, and filters.
 * Auto-refreshes every 30 seconds with live indicator.
 * Bilingual EN/VI dark fintech pattern.
 */
import { useState } from 'react';
import { useRevenueAnalytics, TIME_RANGES } from '../hooks/use-revenue-analytics';
import { useLicenseAnalytics } from '../hooks/use-license-analytics';
import { RevenueMetricsCard, MRRIcon, DALIcon, ChurnIcon, ARPAIcon } from '../components/revenue-metrics-card';
import { RevenueTrendChart } from '../components/revenue-trend-chart';
import { RevenueByTierChart } from '../components/revenue-by-tier';
import { ExportReportButton } from '../components/export-report-button';
import { RoiMetricsOverview } from '../components/roi-metrics-overview';
import { OverageRevenueCard } from '../components/overage-revenue-card';
import { LicenseHealthGauge } from '../components/license-health-gauge';
import { UsageAnalyticsDashboard } from '../components/usage-analytics-dashboard';
import { COLORS } from '../lib/stitch-design-tokens';

type Lang = 'en' | 'vi';

const COPY: Record<Lang, Record<string, string>> = {
  en: {
    langToggle: 'Tiếng Việt',
    title: 'Revenue Analytics',
    subtitle: 'Key metrics, trends, and license health at a glance',
    loading: 'Loading analytics...',
    errorHeading: 'Error Loading Analytics',
    retry: 'Retry',
    live: 'Live',
    paused: 'Paused',
    updated: 'Updated',
    pauseTooltip: 'Pause auto-refresh',
    resumeTooltip: 'Resume auto-refresh',
    filterByTier: 'Filter by Tier',
    allTiers: 'All Tiers',
    quickStats: 'Quick Stats',
    totalRevenue: 'Total Revenue',
    avgGrowth: 'Avg Growth',
    activeSubscriptions: 'Active Subscriptions',
    dataFreshness: 'Data Freshness',
    subs: 'subs',
    mrr: 'MRR',
    dal: 'DAL',
    churnRate: 'Churn Rate',
    arpa: 'ARPA',
  },
  vi: {
    langToggle: 'English',
    title: 'Phân tích Doanh thu',
    subtitle: 'Chỉ số chính, xu hướng và sức khỏe giấy phép trong một cái nhìn',
    loading: 'Đang tải phân tích...',
    errorHeading: 'Lỗi tải Phân tích',
    retry: 'Thử lại',
    live: 'Trực tiếp',
    paused: 'Tạm dừng',
    updated: 'Cập nhật',
    pauseTooltip: 'Tạm dừng tự động làm mới',
    resumeTooltip: 'Tiếp tục tự động làm mới',
    filterByTier: 'Lọc theo Gói',
    allTiers: 'Tất cả gói',
    quickStats: 'Thống kê nhanh',
    totalRevenue: 'Tổng doanh thu',
    avgGrowth: 'Tăng trưởng TB',
    activeSubscriptions: 'Đăng ký hoạt động',
    dataFreshness: 'Độ mới dữ liệu',
    subs: 'đăng ký',
    mrr: 'MRR',
    dal: 'DAL',
    churnRate: 'Tỷ lệ rời bỏ',
    arpa: 'ARPA',
  },
};

const TIME_RANGE_MAP: Record<string, { en: string; vi: string }> = {
  '7d': { en: '7 days', vi: '7 ngày' },
  '30d': { en: '30 days', vi: '30 ngày' },
  '90d': { en: '90 days', vi: '90 ngày' },
  '1y': { en: '1 year', vi: '1 năm' },
};

export function AnalyticsPage() {
  const {
    metrics,
    loading,
    error,
    timeRange,
    setTimeRange,
    lastUpdated,
    isPolling,
    togglePolling,
    reload,
  } = useRevenueAnalytics();

  const { analytics: licenseAnalytics } = useLicenseAnalytics();

  const [selectedTier, setSelectedTier] = useState<string>('all');
  const [lang, setLang] = useState<Lang>('en');
  const t = COPY[lang];

  // Format last updated time
  const formatLastUpdated = () => {
    if (!lastUpdated) return '';
    const now = new Date();
    const diff = Math.floor((now.getTime() - lastUpdated.getTime()) / 1000);

    if (diff < 5) return t.updated === 'Updated' ? 'Just now' : 'Vừa xong';
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    return `${Math.floor(diff / 3600)}h`;
  };

  const langLabel = lang === 'en' ? COPY.vi.langToggle : COPY.en.langToggle;

  if (loading && !metrics) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-[#e3e2e2] font-sans">
        <div className="flex flex-col items-center justify-center py-20" style={{ color: COLORS.onSurfaceVariant }}>
          <svg className="animate-spin h-10 w-10 mb-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-sm">{t.loading}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-[#e3e2e2] font-sans">
        <div className="p-6 rounded-lg" style={{ backgroundColor: `${COLORS.loss}15`, border: `1px solid ${COLORS.loss}55`, color: COLORS.loss }}>
          <h3 className="font-semibold mb-2">{t.errorHeading}</h3>
          <p className="text-sm mb-4">{error}</p>
          <button
            onClick={reload}
            className="px-4 py-2 rounded text-xs transition-colors"
            style={{ backgroundColor: `${COLORS.loss}30`, color: COLORS.loss }}
          >
            {t.retry}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e3e2e2] font-sans">
      <div className="space-y-6 p-6">
        {/* Header + language toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: COLORS.onSurface }}>{t.title}</h1>
            <p className="text-sm mt-1" style={{ color: COLORS.onSurfaceVariant }}>{t.subtitle}</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Time Range Selector */}
            <div className="flex items-center gap-1 p-1 rounded" style={{ backgroundColor: `${COLORS.bg}55`, border: `1px solid ${COLORS.outline}` }}>
              {TIME_RANGES.map((range) => (
                <button
                  key={range.value}
                  onClick={() => setTimeRange(range.value)}
                  className="px-3 py-1.5 text-xs font-medium rounded transition-colors"
                  style={{
                    backgroundColor: timeRange === range.value ? `${COLORS.primary}33` : 'transparent',
                    color: timeRange === range.value ? COLORS.primary : COLORS.onSurfaceVariant,
                    border: timeRange === range.value ? `1px solid ${COLORS.primary}55` : '1px solid transparent',
                  }}
                >
                  {TIME_RANGE_MAP[range.value]?.[lang] || range.label}
                </button>
              ))}
            </div>

            {/* Polling Toggle */}
            <button
              onClick={togglePolling}
              className="px-3 py-1.5 text-xs rounded border transition-colors"
              style={{
                borderColor: isPolling ? `${COLORS.profit}55` : COLORS.outline,
                color: isPolling ? COLORS.profit : COLORS.onSurfaceVariant,
              }}
              title={isPolling ? t.pauseTooltip : t.resumeTooltip}
            >
              {isPolling ? (
                <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            {/* Export Button */}
            <ExportReportButton metrics={metrics} timeRange={timeRange} variant="primary" />

            {/* Language Toggle */}
            <button
              onClick={() => setLang(lang === 'en' ? 'vi' : 'en')}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors"
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
          </div>
        </div>

        {/* Live indicator */}
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{
              backgroundColor: isPolling ? COLORS.profit : COLORS.onSurfaceVariant,
              animation: isPolling ? 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' : 'none',
            }}
          />
          <span className="text-xs" style={{ color: COLORS.onSurfaceVariant }}>
            {isPolling ? `${t.live} · ${t.updated} ${formatLastUpdated()}` : t.paused}
          </span>
        </div>

        {/* Phase 5 - ROI Metrics Overview */}
        {licenseAnalytics && (
          <RoiMetricsOverview
            mrr={licenseAnalytics.revenue?.mrr || 0}
            arr={licenseAnalytics.revenue?.arr || 0}
            totalRevenue={licenseAnalytics.revenue?.totalRevenue || 0}
            overageRevenue={licenseAnalytics.revenue?.overageRevenue || 0}
            ltv={licenseAnalytics.customerMetrics?.ltv || 0}
            churnRate={licenseAnalytics.customerMetrics?.churnRate || 0}
            healthScore={licenseAnalytics.licenseHealth?.healthScore || 0}
          />
        )}

        {/* Overage Revenue + License Health Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {licenseAnalytics && (
            <OverageRevenueCard
              overageRevenue={licenseAnalytics.revenue?.overageRevenue || 0}
              overageCalls={licenseAnalytics.usage?.overageCalls || 0}
              licensesInOverage={licenseAnalytics.licenseHealth?.exceeded || 0}
              projectedOverage={(licenseAnalytics.revenue?.overageRevenue || 0) * 3}
            />
          )}
          {licenseAnalytics && (
            <LicenseHealthGauge
              healthScore={licenseAnalytics.licenseHealth?.healthScore || 0}
              healthy={licenseAnalytics.licenseHealth?.healthy || 0}
              atRisk={licenseAnalytics.licenseHealth?.atRisk || 0}
              exceeded={licenseAnalytics.licenseHealth?.exceeded || 0}
              size="sm"
            />
          )}
        </div>

        {/* Revenue Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <RevenueMetricsCard
            label={t.mrr}
            value={`$${metrics?.mrr.toLocaleString() || 0}`}
            change={metrics?.mrrGrowth}
            icon={<MRRIcon />}
            accent="accent"
          />
          <RevenueMetricsCard
            label={t.dal}
            value={metrics?.dal.toLocaleString() || 0}
            subValue={`${metrics?.activityRate.toFixed(1)}% activity rate`}
            icon={<DALIcon />}
            accent="profit"
          />
          <RevenueMetricsCard
            label={t.churnRate}
            value={`${(metrics?.churnRate || 0).toFixed(2)}%`}
            icon={<ChurnIcon />}
            accent={metrics?.churnRate && metrics.churnRate > 5 ? 'loss' : 'profit'}
          />
          <RevenueMetricsCard
            label={t.arpa}
            value={`$${(metrics?.arpa || 0).toFixed(2)}`}
            icon={<ARPAIcon />}
            accent="warning"
          />
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <RevenueTrendChart data={metrics?.trend || []} height={280} />
          <RevenueByTierChart data={metrics?.byTier || []} height={280} />
        </div>

        {/* Additional Info Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Tier Filter Info */}
          <div className="glass-card p-4">
            <h4 className="font-semibold mb-3" style={{ color: COLORS.onSurface }}>{t.filterByTier}</h4>
            <div className="space-y-2">
              <button
                onClick={() => setSelectedTier('all')}
                className="w-full px-3 py-2 text-sm text-left rounded border transition-colors"
                style={{
                  backgroundColor: selectedTier === 'all' ? `${COLORS.primary}22` : 'transparent',
                  borderColor: selectedTier === 'all' ? `${COLORS.primary}55` : COLORS.outline,
                  color: selectedTier === 'all' ? COLORS.primary : COLORS.onSurfaceVariant,
                }}
              >
                {t.allTiers}
              </button>
              {metrics?.byTier.map((tier) => (
                <button
                  key={tier.tier}
                  onClick={() => setSelectedTier(tier.tier)}
                  className="w-full px-3 py-2 text-sm text-left rounded border transition-colors flex items-center justify-between"
                  style={{
                    backgroundColor: selectedTier === tier.tier ? `${COLORS.primary}22` : 'transparent',
                    borderColor: selectedTier === tier.tier ? `${COLORS.primary}55` : COLORS.outline,
                    color: selectedTier === tier.tier ? COLORS.primary : COLORS.onSurfaceVariant,
                  }}
                >
                  <span>{tier.tier}</span>
                  <span className="text-xs">{tier.subscriptionCount} {t.subs}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Quick Stats */}
          <div className="glass-card p-4 lg:col-span-2">
            <h4 className="font-semibold mb-3" style={{ color: COLORS.onSurface }}>{t.quickStats}</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <div className="text-xs mb-1" style={{ color: COLORS.onSurfaceVariant }}>{t.totalRevenue}</div>
                <div className="font-bold text-lg" style={{ color: COLORS.onSurface }}>
                  ${metrics?.trend.reduce((sum, tItem) => sum + tItem.totalMRR, 0).toLocaleString() || 0}
                </div>
              </div>
              <div>
                <div className="text-xs mb-1" style={{ color: COLORS.onSurfaceVariant }}>{t.avgGrowth}</div>
                <div
                  className="font-bold text-lg"
                  style={{ color: (metrics?.mrrGrowth || 0) >= 0 ? COLORS.profit : COLORS.loss }}
                >
                  {(metrics?.mrrGrowth || 0) >= 0 ? '+' : ''}{metrics?.mrrGrowth?.toFixed(1) || '0.0'}%
                </div>
              </div>
              <div>
                <div className="text-xs mb-1" style={{ color: COLORS.onSurfaceVariant }}>{t.activeSubscriptions}</div>
                <div className="font-bold text-lg" style={{ color: COLORS.onSurface }}>
                  {metrics?.byTier.reduce((sum, tItem) => sum + tItem.subscriptionCount, 0).toLocaleString() || 0}
                </div>
              </div>
              <div>
                <div className="text-xs mb-1" style={{ color: COLORS.onSurfaceVariant }}>{t.dataFreshness}</div>
                <div className="font-bold text-lg" style={{ color: COLORS.profit }}>
                  {formatLastUpdated()}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Phase 5 - Usage Analytics Dashboard */}
        <UsageAnalyticsDashboard />
      </div>
    </div>
  );
}
