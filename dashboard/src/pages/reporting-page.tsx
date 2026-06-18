/**
 * Reporting page: generate and export analytics reports.
 */
import { useState } from 'react';
import { StitchPageShell } from '../components/ui/stitch-page-shell';
import { StitchCard, StitchCardHeader, StitchCardBody } from '../components/ui/stitch-card';
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

const REPORT_TYPES = [
  { id: 'revenue', label: 'Revenue' },
  { id: 'licenses', label: 'Licenses' },
  { id: 'usage', label: 'Usage' },
  { id: 'combined', label: 'Combined' },
] as const;

const TIME_RANGES = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: '1y', label: '1 year' },
];

export function ReportingPage() {
  const [activeReport, setActiveReport] = useState<ReportType>('revenue');
  const [timeRange, setTimeRange] = useState('30d');
  const { metrics } = useRevenueAnalytics();
  const { analytics: licenseAnalytics } = useLicenseAnalytics();

  const formatCurrency = (v: number) => `$${v.toLocaleString()}`;
  const formatNumber = (v: number) => v.toLocaleString();

  const getStats = (): Array<{ label: string; value: string; tone: StatTone }> => {
    if (!metrics) return [];
    switch (activeReport) {
      case 'revenue':
        return [
          { label: 'Total Revenue', value: formatCurrency(licenseAnalytics?.revenue?.totalRevenue || 0), tone: 'primary' as const },
          { label: 'MRR', value: formatCurrency(metrics.mrr), tone: 'primary' },
          { label: 'DAL', value: formatNumber(metrics.dal), tone: 'profit' },
          { label: 'Churn Rate', value: `${metrics.churnRate.toFixed(2)}%`, tone: 'warning' },
        ];
      case 'licenses':
        return licenseAnalytics
          ? [
              { label: 'Total Licenses', value: formatNumber(licenseAnalytics.licenseHealth?.healthy || 0), tone: 'primary' as const },
              { label: 'At Risk', value: formatNumber(licenseAnalytics.licenseHealth?.atRisk || 0), tone: 'warning' },
              { label: 'Exceeded', value: formatNumber(licenseAnalytics.licenseHealth?.exceeded || 0), tone: 'loss' },
              { label: 'Health Score', value: `${licenseAnalytics.licenseHealth?.healthScore || 0}%`, tone: 'primary' },
            ]
          : [];
      default:
        return [];
    }
  };

  const stats = getStats();

  return (
    <StitchPageShell>
      <div className="space-y-6 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: COLORS.onSurface }}>Reporting</h1>
            <p className="text-sm" style={{ color: COLORS.onSurfaceVariant }}>Generate and export analytics reports</p>
          </div>
          <div className="flex items-center gap-3">
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
                  {r.label}
                </button>
              ))}
            </div>
            {metrics && <ExportReportButton metrics={metrics} timeRange={timeRange} variant="primary" />}
          </div>
        </div>

        <StitchTabs active={activeReport} tabs={REPORT_TYPES.map((t) => t.label)} onChange={(label) => {
          const next = REPORT_TYPES.find((t) => t.label === label);
          if (next) setActiveReport(next.id);
        }} />

        {stats.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((s) => <StitchStatCard key={s.label} label={s.label} value={s.value} tone={s.tone} />)}
          </div>
        )}

        <StitchCard>
          <StitchCardHeader>
            <div className="flex items-center gap-3">
              <StitchBadge label={REPORT_TYPES.find((t) => t.id === activeReport)!.label} tone="primary" />
              <span className="text-sm" style={{ color: COLORS.onSurfaceVariant }}>{timeRange} reporting period</span>
            </div>
            <StitchButton onClick={() => {}} variant="secondary">Schedule Report</StitchButton>
          </StitchCardHeader>
          <StitchCardBody>
            {activeReport === 'revenue' && (
              <>
                <p style={{ color: COLORS.onSurfaceVariant }}>Revenue reports: MRR, DAL, churn, ARPA. Updated every 30s.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <StitchButton variant="secondary">View Details</StitchButton>
                  <StitchButton variant="ghost">Download Template</StitchButton>
                </div>
              </>
            )}
            {activeReport === 'licenses' && (
              <>
                <p style={{ color: COLORS.onSurfaceVariant }}>License reports: active licenses, usage, audit logs, health metrics.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <StitchButton variant="secondary">View Details</StitchButton>
                  <StitchButton variant="ghost">Download Template</StitchButton>
                </div>
              </>
            )}
            {activeReport === 'usage' && (
              <>
                <p style={{ color: COLORS.onSurfaceVariant }}>Usage reports: API volumes, endpoint breakdown, quota consumption.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <StitchButton variant="secondary">View Details</StitchButton>
                  <StitchButton variant="ghost">Download Template</StitchButton>
                </div>
              </>
            )}
            {activeReport === 'combined' && (
              <>
                <p style={{ color: COLORS.onSurfaceVariant }}>Combined: all metrics in a single comprehensive export.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <StitchButton variant="secondary">Generate Full Report</StitchButton>
                  <StitchButton variant="ghost">Customize Fields</StitchButton>
                </div>
              </>
            )}
          </StitchCardBody>
        </StitchCard>

        <StitchSectionTitle title="Quick Actions" eyebrow="SHORTCUTS" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {['Daily Summary', 'Weekly Trends', 'Monthly Package', 'Real-time'].map((label, i) => (
            <StitchButton key={label} variant="secondary" className="h-auto py-4 flex flex-col items-start gap-2">
              <span className="text-lg">{['📊','📈','🎯','⚡'][i]}</span>
              <span className="font-semibold">{label}</span>
              <span className="text-xs" style={{ color: COLORS.onSurfaceVariant }}>
                {['Last 24h','7-day comparison','Full month data','Live snapshot'][i]}
              </span>
            </StitchButton>
          ))}
        </div>
      </div>
    </StitchPageShell>
  );
}

export default ReportingPage;
