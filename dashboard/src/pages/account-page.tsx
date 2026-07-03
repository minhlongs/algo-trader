/**
 * Account page — profile, current plan, API key, billing, danger zone.
 */
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/auth-store';
import { Link } from 'react-router-dom';
import { getTierLimits } from '../lib/tier-config';

const TIER_LABELS: Record<string, string> = {
  free: 'Free',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

const TIER_BADGE_COLORS: Record<string, string> = {
  free: 'bg-bg-border text-muted',
  pro: 'bg-accent/10 text-accent border border-accent/30',
  enterprise: 'bg-gold/10 text-gold border border-gold/30',
};

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-bg-surface/80 backdrop-blur-sm border border-bg-border rounded-lg p-6 space-y-4">
      <div className="flex items-center gap-2">
        <span className="w-1 h-4 bg-accent rounded-full" />
        <h2 className="text-accent text-xs font-mono font-bold uppercase tracking-widest">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-bg-border last:border-0">
      <span className="text-muted text-xs">{label}</span>
      <span className="text-white text-xs">{value}</span>
    </div>
  );
}

export function AccountPage() {
  const { t } = useTranslation();
  const { email, tier, tenantId, apiKey, token } = useAuthStore();

  const limits = getTierLimits(tier);
  const badgeClass = TIER_BADGE_COLORS[tier] ?? TIER_BADGE_COLORS['free'];
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
    <div className="space-y-6 max-w-2xl">
        <div className="flex items-center gap-2 mb-6">
          <span className="w-1 h-5 bg-accent rounded-full" />
          <h1 className="text-white text-xl font-bold tracking-tight">{t('account.title')}</h1>
        </div>

      {/* Profile */}
      <Card title={t('account.profile')}>
        <Row label={t('account.email')} value={email || '—'} />
        <Row label={t('account.tenantId')} value={<code className="text-accent text-[10px]">{tenantId ?? '—'}</code>} />
        <Row label={t('account.memberSince')} value={memberSince} />
      </Card>

      {/* Current Plan */}
      <Card title={t('account.currentPlan')}>
        <div className="flex items-center justify-between mb-4">
          <span className={`px-2.5 py-1 rounded text-xs font-bold ${badgeClass}`}>
            {tierLabel}
          </span>
          <Link
            to="/pricing"
            className="text-xs text-accent hover:underline"
          >
            {t('account.upgradePlan')}
          </Link>
        </div>
        <div className="space-y-0">
          <Row label={t('account.tradesPerDay')} value={limits.tradesPerDay} />
          <Row label={t('account.dailyLossCap')} value={limits.dailyLossCap} />
          <Row label={t('account.maxPositionSize')} value={limits.maxPosition} />
        </div>
      </Card>

      {/* API Key */}
      <Card title={t('account.apiKey')}>
        <p className="text-muted text-xs">
          {t('account.apiKeyDescription')}
        </p>
        <div className="bg-bg border border-bg-border rounded px-4 py-3 flex items-center justify-between gap-3">
          <code className="text-accent text-xs">{maskedKey}</code>
          <button
            disabled
            title="Contact support to regenerate your API key"
            aria-label="Regenerate API key — contact support to enable"
            className="text-xs px-3 py-1.5 border border-bg-border rounded text-muted cursor-not-allowed opacity-50 min-h-touch"
          >
            {t('account.regenerate')}
          </button>
        </div>
        <p className="text-muted text-[10px]">
          {t('account.regenerationDisabled')}
        </p>
      </Card>

      {/* Billing */}
      <Card title={t('account.billing')}>
        {tier === 'free' ? (
          <div className="flex items-center justify-between">
            <p className="text-muted text-xs">{t('account.freePlan')}</p>
            <Link
              to="/pricing"
              className="bg-accent text-bg font-bold text-xs px-4 py-2 rounded hover:bg-accent/80 transition-colors min-h-touch"
            >
              {t('account.upgrade')}
            </Link>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-muted text-xs">
              {t('account.activeSubscription', { tier: tierLabel })}
            </p>
            <Link
              to="/pricing"
              className="text-xs px-4 py-2 border border-bg-border rounded text-accent hover:bg-accent/10 transition-colors min-h-touch"
            >
              {t('account.upgradeManage')}
            </Link>
          </div>
        )}
      </Card>

      {/* Danger Zone */}
      <Card title={t('account.dangerZone')}>
        <p className="text-muted text-xs">
          {t('account.deleteDescription')}
        </p>
        <button
          disabled
          title={t('account.deleteAccount')}
          className="text-xs px-4 py-2 border border-[#FF4466]/30 rounded text-[#FF4466]/50 cursor-not-allowed opacity-50 min-h-touch"
        >
          {t('account.deleteAccount')}
        </button>
      </Card>
    </div>
  );
}
