/**
 * Account page — profile, current plan, API key, billing, danger zone.
 * Stitch-aligned UI using shared components.
 */
import { useAuthStore } from '../stores/auth-store';
import { Link } from 'react-router-dom';
import { getTierLimits } from '../lib/tier-config';
import { StitchCard, StitchCardBody, StitchCardHeader } from '../components/ui/stitch-card';
import { StitchBadge } from '../components/ui/stitch-badge';
import { StitchButton } from '../components/ui/stitch-button';
import { StitchSectionTitle } from '../components/ui/stitch-section-title';
import { COLORS } from '../lib/stitch-design-tokens';

const TIER_LABELS: Record<string, string> = {
  free: 'Free',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

const TIER_TONES: Record<string, 'neutral' | 'primary' | 'warning'> = {
  free: 'neutral',
  pro: 'primary',
  enterprise: 'warning',
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-[#3f4e5f] last:border-0">
      <span className="text-[#94a3b8] text-xs font-mono">{label}</span>
      <span className="text-[#e2e8f0] text-xs font-mono">{value}</span>
    </div>
  );
}

export function AccountPage() {
  const { email, tier, tenantId, apiKey, token } = useAuthStore();

  const limits = getTierLimits(tier);
  const badgeTone = TIER_TONES[tier] ?? 'neutral';
  const tierLabel = TIER_LABELS[tier] ?? tier;

  // Mask the API key — show prefix + first 8 chars then ****
  const maskedKey = apiKey
    ? apiKey.slice(0, 12) + '••••••••••••'
    : token
    ? 'algo_••••••••••••••••••••••••'
    : '—';

  const memberSince = (() => {
    // Derive from JWT iat if available, else show dash
    if (!token) return '—';
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return '—';
      const payload = JSON.parse(atob(parts[1]!.replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.iat) return new Date(payload.iat * 1000).toLocaleDateString();
    } catch (error) {
      console.error('[Account Page] Failed to parse JWT:', error);
      /* ignore */ }
    return '—';
  })();

  return (
    <div className="space-y-6 max-w-2xl" style={{ color: COLORS.onSurface }}>
      <StitchSectionTitle
        eyebrow="Account Settings"
        title="Account"
      />

      {/* Profile */}
      <StitchCard>
        <StitchCardHeader>
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: COLORS.onSurfaceVariant }}>Profile</span>
        </StitchCardHeader>
        <StitchCardBody className="space-y-0">
          <Row label="Email" value={email || '—'} />
          <Row label="Tenant ID" value={<code className="text-[#4cd7f6] text-[10px]">{tenantId ?? '—'}</code>} />
          <Row label="Member since" value={memberSince} />
        </StitchCardBody>
      </StitchCard>

      {/* Current Plan */}
      <StitchCard>
        <StitchCardHeader>
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: COLORS.onSurfaceVariant }}>Current Plan</span>
        </StitchCardHeader>
        <StitchCardBody>
          <div className="flex items-center justify-between mb-4">
            <StitchBadge label={tierLabel} tone={badgeTone} />
            <Link
              to="/pricing"
              className="text-xs font-mono text-[#4cd7f6] hover:underline"
            >
              Upgrade plan →
            </Link>
          </div>
          <div className="space-y-0">
            <Row label="Trades / day" value={String(limits.tradesPerDay)} />
            <Row label="Daily loss cap" value={limits.dailyLossCap} />
            <Row label="Max position size" value={limits.maxPosition} />
          </div>
        </StitchCardBody>
      </StitchCard>

      {/* API Key */}
      <StitchCard>
        <StitchCardHeader>
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: COLORS.onSurfaceVariant }}>API Key</span>
        </StitchCardHeader>
        <StitchCardBody className="space-y-3">
          <p className="text-[#94a3b8] text-xs font-mono">
            Use this key to authenticate CLI and programmatic access.
          </p>
          <div className="bg-[#051424] border border-[#3f4e5f] rounded px-4 py-3 flex items-center justify-between gap-3">
            <code className="text-[#4cd7f6] text-xs font-mono">{maskedKey}</code>
            <StitchButton
              variant="secondary"
              onClick={() => {}}
              disabled
              title="Contact support to regenerate your API key"
            >
              Regenerate
            </StitchButton>
          </div>
          <p className="text-[#94a3b8] text-[10px] font-mono">
            Key regeneration is disabled.{' '}
            <a
              href="mailto:support@cashclaw.cc"
              className="text-[#4cd7f6] hover:underline"
            >
              Contact support
            </a>{' '}
            to rotate your key.
          </p>
        </StitchCardBody>
      </StitchCard>

      {/* Billing */}
      <StitchCard>
        <StitchCardHeader>
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: COLORS.onSurfaceVariant }}>Billing</span>
        </StitchCardHeader>
        <StitchCardBody>
          {tier === 'free' ? (
            <div className="flex items-center justify-between">
              <p className="text-[#94a3b8] text-xs font-mono">You're on the free plan.</p>
              <StitchButton asChild>
                <Link to="/pricing">Upgrade</Link>
              </StitchButton>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-[#94a3b8] text-xs font-mono">
                Active <StitchBadge label={tierLabel} tone={badgeTone} /> subscription.
              </p>
              <StitchButton variant="secondary" asChild>
                <Link to="/pricing">Upgrade / Manage →</Link>
              </StitchButton>
            </div>
          )}
        </StitchCardBody>
      </StitchCard>

      {/* Danger Zone */}
      <StitchCard>
        <StitchCardHeader>
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: COLORS.onSurfaceVariant }}>Danger Zone</span>
        </StitchCardHeader>
        <StitchCardBody className="space-y-2">
          <p className="text-[#94a3b8] text-xs font-mono">
            Permanently delete your account and all associated data.
          </p>
          <StitchButton
            variant="secondary"
            onClick={() => {}}
            disabled
            title="Contact support to delete your account"
            style={{ borderColor: '#ef444480', color: '#ef444480' }}
          >
            Delete Account
          </StitchButton>
        </StitchCardBody>
      </StitchCard>
    </div>
  );
}
