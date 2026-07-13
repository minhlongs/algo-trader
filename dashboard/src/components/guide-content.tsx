/**
 * Main guide/SOPs content — customer-facing user guide.
 * Used by both /docs (public) and /app/guide (app) routes.
 * Updated: 2026-03-28
 */
import { GuideInfrastructure } from './guide-section-infrastructure';
import { COLORS as _COLORS } from '../lib/stitch-design-tokens';
import { GuideQuickStart } from './guide-section-m1-max-setup';
import { GuideParameters } from './guide-section-vps-setup';
import { GuidePricing } from './guide-section-payment-setup';
import { GuideDailyOps } from './guide-section-coupon-management';
import { GuideTroubleshooting } from './guide-section-monitoring';
import { InfoBanner } from './guide-shared-components';

export function GuideContent() {
  return (
    <div className="space-y-16 text-[${_COLORS.onSurfaceVariant}]">

      {/* Banner */}
      <InfoBanner color="cyan" label="CashClaw — Self-Hosted Algo Trading Bot">
        <p>
          Run the bot on your own VPS or Mac. Your keys, your server, your profits.
          CashClaw provides the software + dashboard + updates.
        </p>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="bg-[${_COLORS.surface}] rounded p-2">
            <span className="text-[${_COLORS.profit}]">Setup:</span> ~15 minutes
          </div>
          <div className="bg-[${_COLORS.surface}] rounded p-2">
            <span className="text-[${_COLORS.primary}]">Cost:</span> VPS $5-20/mo + CashClaw tier
          </div>
          <div className="bg-[${_COLORS.surface}] rounded p-2">
            <span className="text-yellow-400">Payment:</span> Crypto (USDT, BTC, ETH, 100+)
          </div>
        </div>
      </InfoBanner>

      {/* Table of Contents */}
      <nav aria-label="Table of contents">
        <p className="text-xs text-[${_COLORS.primary}] uppercase tracking-widest mb-3">Contents</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          {[
            { href: '#how-it-works', label: '1. How CashClaw Works' },
            { href: '#quick-start', label: '2. Quick Start (15 min)' },
            { href: '#parameters', label: '3. Trading Parameters' },
            { href: '#pricing', label: '4. Pricing & Payment' },
            { href: '#daily-ops', label: '5. Daily Operations' },
            { href: '#troubleshooting', label: '6. Troubleshooting & Emergency' },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-[${_COLORS.onSurfaceVariant}] hover:text-[${_COLORS.primary}] transition-colors"
            >
              {item.label}
            </a>
          ))}
        </div>
      </nav>

      <GuideInfrastructure />
      <GuideQuickStart />
      <GuideParameters />
      <GuidePricing />
      <GuideDailyOps />
      <GuideTroubleshooting />

    </div>
  );
}
