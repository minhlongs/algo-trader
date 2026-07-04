/**
 * Referral Dashboard Page
 * Displays referral program stats, code, commissions, and payouts
 */

import { useEffect } from 'react';
import { useReferralStore } from '../stores/referral-store';
import { StitchCard, StitchCardBody, StitchCardHeader } from '../components/ui/stitch-card';
import { StitchSectionTitle } from '../components/ui/stitch-section-title';
import { StitchButton } from '../components/ui/stitch-button';
import { StitchBadge } from '../components/ui/stitch-badge';
import { COLORS } from '../lib/stitch-design-tokens';

function StatCard({ label, value, subtext }: { label: string; value: string | number; subtext?: string }) {
  return (
    <StitchCard>
      <StitchCardBody>
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-wider" style={{ color: COLORS.onSurfaceVariant }}>
            {label}
          </div>
          <div className="text-2xl font-bold" style={{ color: COLORS.onSurface }}>
            {value}
          </div>
          {subtext && (
            <div className="text-xs" style={{ color: COLORS.profit }}>
              {subtext}
            </div>
          )}
        </div>
      </StitchCardBody>
    </StitchCard>
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function ReferralPage() {
  const {
    stats,
    referralCode,
    commissions,
    payouts,
    loading,
    error,
    fetchStats,
    fetchReferralCode,
    generateReferralCode,
    fetchCommissions,
    fetchPayouts,
  } = useReferralStore();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    await Promise.all([
      fetchStats(),
      fetchReferralCode(),
      fetchCommissions(undefined, 1, 20),
      fetchPayouts(1, 20),
    ]);
  };

  const handleCopyCode = () => {
    if (referralCode?.code) {
      navigator.clipboard.writeText(referralCode.code);
      alert('Referral code copied to clipboard!');
    }
  };

  const handleRegenerateCode = async () => {
    if (confirm('Are you sure? This will invalidate your previous code.')) {
      await generateReferralCode();
    }
  };

  const shareLink = `${window.location.origin}/signup?ref=${referralCode?.code || ''}`;

  return (
    <div className="space-y-6" style={{ color: COLORS.onSurface }}>
      <StitchSectionTitle
        eyebrow="Growth Program"
        title="Referral Program"
      />

      {error && (
        <div className="p-4 rounded" style={{ backgroundColor: COLORS.loss + '20', color: COLORS.loss }}>
          {error}
        </div>
      )}

      {/* Referral Code Section */}
      <StitchCard>
        <StitchCardHeader>
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: COLORS.onSurfaceVariant }}>
            Your Referral Link
          </span>
        </StitchCardHeader>
        <StitchCardBody>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                {referralCode ? (
                  <div className="flex items-center gap-3">
                    <code className="px-4 py-3 rounded bg-[#1e293b] text-[#4cd7f6] text-lg border border-[#334155]">
                      {referralCode.code}
                    </code>
                    <StitchButton variant="secondary" onClick={handleCopyCode}>
                      Copy Code
                    </StitchButton>
                    <StitchButton variant="secondary" onClick={handleRegenerateCode} disabled={loading}>
                      Regenerate
                    </StitchButton>
                  </div>
                ) : (
                  <StitchButton onClick={generateReferralCode} disabled={loading}>
                    Generate Referral Code
                  </StitchButton>
                )}
              </div>
            </div>

            {referralCode && (
              <div className="space-y-2">
                <div className="text-xs" style={{ color: COLORS.onSurfaceVariant }}>
                  Share this link:
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={shareLink}
                    className="flex-1 px-3 py-2 rounded bg-[#1e293b] border border-[#334155] text-sm"
                    style={{ color: COLORS.onSurface }}
                  />
                  <StitchButton
                    onClick={() => {
                      navigator.clipboard.writeText(shareLink);
                      alert('Link copied!');
                    }}
                  >
                    Copy Link
                  </StitchButton>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 pt-4 border-t" style={{ borderColor: COLORS.outline }}>
              <div>
                <div className="text-xs" style={{ color: COLORS.onSurfaceVariant }}>Times Used</div>
                <div className="text-lg" style={{ color: COLORS.onSurface }}>
                  {referralCode?.usedCount ?? 0}
                </div>
              </div>
              <div>
                <div className="text-xs" style={{ color: COLORS.onSurfaceVariant }}>Status</div>
                <div className="text-lg">
                  {referralCode?.isActive ? (
                    <StitchBadge label="Active" tone="profit" />
                  ) : (
                    <StitchBadge label="Inactive" tone="loss" />
                  )}
                </div>
              </div>
            </div>
          </div>
        </StitchCardBody>
      </StitchCard>

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Total Clicks"
            value={stats.totalClicks.toLocaleString()}
            subtext={`${stats.uniqueClicks} unique`}
          />
          <StatCard
            label="Conversions"
            value={stats.conversions.toLocaleString()}
            subtext={`${stats.conversionRate.toFixed(1)}% rate`}
          />
          <StatCard
            label="Total Revenue"
            value={formatCurrency(stats.totalRevenue)}
          />
          <StatCard
            label="Commissions Earned"
            value={formatCurrency(stats.totalCommissions)}
            subtext={`${formatCurrency(stats.pendingCommissions)} pending`}
          />
        </div>
      )}

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Commissions Table */}
        <StitchCard>
          <StitchCardHeader>
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: COLORS.onSurfaceVariant }}>
              Recent Commissions
            </span>
          </StitchCardHeader>
          <StitchCardBody>
            {commissions.length === 0 ? (
              <div className="text-center py-8" style={{ color: COLORS.onSurfaceVariant }}>
                No commissions yet. When someone uses your referral link and becomes a paying customer, you'll earn 10% of their fees.
              </div>
            ) : (
              <div className="space-y-3">
                {commissions.map((commission) => (
                  <div
                    key={commission.id}
                    className="flex items-center justify-between p-3 rounded bg-[#1e293b]"
                  >
                    <div>
                      <div className="text-sm" style={{ color: COLORS.onSurface }}>
                        {formatCurrency(commission.commissionAmount)}
                      </div>
                      <div className="text-xs" style={{ color: COLORS.onSurfaceVariant }}>
                        {formatDate(commission.periodStart)} - {formatDate(commission.periodEnd)}
                      </div>
                    </div>
                    <div>
                      <StitchBadge
                        label={commission.status}
                        tone={
                          commission.status === 'paid'
                            ? 'profit'
                            : commission.status === 'approved'
                            ? 'primary'
                            : commission.status === 'void'
                            ? 'loss'
                            : 'warning'
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </StitchCardBody>
        </StitchCard>

        {/* Payouts Table */}
        <StitchCard>
          <StitchCardHeader>
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: COLORS.onSurfaceVariant }}>
              Payout History
            </span>
          </StitchCardHeader>
          <StitchCardBody>
            {payouts.length === 0 ? (
              <div className="text-center py-8" style={{ color: COLORS.onSurfaceVariant }}>
                No payouts yet. Payouts are processed monthly for commissions over $10.
              </div>
            ) : (
              <div className="space-y-3">
                {payouts.map((payout) => (
                  <div
                    key={payout.id}
                    className="flex items-center justify-between p-3 rounded bg-[#1e293b]"
                  >
                    <div>
                      <div className="text-sm" style={{ color: COLORS.onSurface }}>
                        {formatCurrency(payout.amount)}
                      </div>
                      <div className="text-xs" style={{ color: COLORS.onSurfaceVariant }}>
                        {payout.commissionCount} commissions
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm" style={{ color: COLORS.onSurface }}>
                        {formatDate(payout.paidAt || payout.periodStart)}
                      </div>
                      <StitchBadge label={payout.status} tone={payout.status === 'completed' ? 'profit' : 'neutral'} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </StitchCardBody>
        </StitchCard>
      </div>

      {/* Top Referrers */}
      {stats && stats.topReferrers.length > 0 && (
        <StitchCard>
          <StitchCardHeader>
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: COLORS.onSurfaceVariant }}>
              Top Referrers
            </span>
          </StitchCardHeader>
          <StitchCardBody>
            <div className="space-y-2">
              {stats.topReferrers.map((referrer, index) => (
                <div
                  key={referrer.tenantId}
                  className="flex items-center justify-between p-3 rounded bg-[#1e293b]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ backgroundColor: COLORS.primary, color: COLORS.onPrimary }}>
                      {index + 1}
                    </div>
                    <div>
                      <div className="text-sm" style={{ color: COLORS.onSurface }}>
                        {referrer.tenantId.slice(0, 12)}...
                      </div>
                      <div className="text-xs" style={{ color: COLORS.onSurfaceVariant }}>
                        {referrer.conversions} conversion{referrer.conversions !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                  <div className="text-sm" style={{ color: COLORS.profit }}>
                    {formatCurrency(referrer.commissionEarned)}
                  </div>
                </div>
              ))}
            </div>
          </StitchCardBody>
        </StitchCard>
      )}

      {/* How It Works */}
      <StitchCard>
        <StitchCardHeader>
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: COLORS.onSurfaceVariant }}>
            How It Works
          </span>
        </StitchCardHeader>
        <StitchCardBody>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <div className="w-8 h-8 rounded flex items-center justify-center font-bold"
                style={{ backgroundColor: COLORS.primary, color: COLORS.onPrimary }}>
                1
              </div>
              <div className="text-sm font-bold" style={{ color: COLORS.onSurface }}>
                Share Your Link
              </div>
              <div className="text-xs" style={{ color: COLORS.onSurfaceVariant }}>
                Use your unique referral code or link to share AlgoTrader with your network.
              </div>
            </div>
            <div className="space-y-2">
              <div className="w-8 h-8 rounded flex items-center justify-center font-bold"
                style={{ backgroundColor: COLORS.primary, color: COLORS.onPrimary }}>
                2
              </div>
              <div className="text-sm font-bold" style={{ color: COLORS.onSurface }}>
                They Sign Up & Pay
              </div>
              <div className="text-xs" style={{ color: COLORS.onSurfaceVariant }}>
                When someone uses your link and becomes a paying customer, we track it.
              </div>
            </div>
            <div className="space-y-2">
              <div className="w-8 h-8 rounded flex items-center justify-center font-bold"
                style={{ backgroundColor: COLORS.primary, color: COLORS.onPrimary }}>
                3
              </div>
              <div className="text-sm font-bold" style={{ color: COLORS.onSurface }}>
                Earn 10% Commission
              </div>
              <div className="text-xs" style={{ color: COLORS.onSurfaceVariant }}>
                You earn 10% of all fees paid by your referred tenants for 12 months. Payouts are monthly.
              </div>
            </div>
          </div>
        </StitchCardBody>
      </StitchCard>
    </div>
  );
}
