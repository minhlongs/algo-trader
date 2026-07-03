/**
 * Public pricing page. Full-page, no sidebar.
 * 3-column plan table + FAQ accordion.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PublicNavbar } from '../components/public-navbar';
import { Footer } from '../components/footer';
import { TIER_LIMITS } from '../lib/tier-config';

function CheckIcon() {
  return (
    <svg width="14" height="14" fill="none" stroke="#00E676" strokeWidth="2" viewBox="0 0 24 24">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="14" height="14" fill="none" stroke="#8892B0" strokeWidth="2" viewBox="0 0 24 24">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-bg-border">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between py-4 text-left text-sm text-white hover:text-accent transition-colors min-h-touch"
      >
        <span>{q}</span>
        <svg
          width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
          className={`flex-shrink-0 ml-4 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <p className="text-[#8892B0] text-xs leading-relaxed pb-4">{a}</p>
      )}
    </div>
  );
}

export function PricingPage() {
  const { t } = useTranslation();

  const plans = [
    {
      name: 'Free',
      price: '$0',
      sub: t('pricing.forever'),
      href: '/signup?tier=free',
      cta: t('pricing.ctaFree'),
      highlight: false,
      features: [
        { label: t('pricing.features.activeStrategies'), value: TIER_LIMITS.free.activeStrategies },
        { label: t('pricing.features.tradesPerDay'), value: TIER_LIMITS.free.tradesPerDay },
        { label: t('pricing.features.dailyLossCap'), value: TIER_LIMITS.free.dailyLossCap },
        { label: t('pricing.features.maxPositionSize'), value: TIER_LIMITS.free.maxPosition },
        { label: t('pricing.features.marketScanning'), value: t('pricing.scanLevels.basic') },
        { label: t('pricing.features.safetyLimits'), value: true },
        { label: t('pricing.features.apiAccess'), value: false },
        { label: t('pricing.features.prioritySupport'), value: false },
      ],
    },
    {
      name: 'Pro',
      price: '$49',
      sub: t('pricing.perMonth'),
      href: '/signup?tier=pro',
      cta: t('pricing.ctaPro'),
      highlight: true,
      features: [
        { label: t('pricing.features.activeStrategies'), value: TIER_LIMITS.pro.activeStrategies },
        { label: t('pricing.features.tradesPerDay'), value: TIER_LIMITS.pro.tradesPerDay },
        { label: t('pricing.features.dailyLossCap'), value: TIER_LIMITS.pro.dailyLossCap },
        { label: t('pricing.features.maxPositionSize'), value: TIER_LIMITS.pro.maxPosition },
        { label: t('pricing.features.marketScanning'), value: t('pricing.scanLevels.advanced') },
        { label: t('pricing.features.safetyLimits'), value: true },
        { label: t('pricing.features.apiAccess'), value: true },
        { label: t('pricing.features.prioritySupport'), value: false },
      ],
    },
    {
      name: 'Enterprise',
      price: '$199',
      sub: t('pricing.perMonth'),
      href: '/signup?tier=enterprise',
      cta: t('pricing.ctaEnterprise'),
      highlight: false,
      features: [
        { label: t('pricing.features.activeStrategies'), value: TIER_LIMITS.enterprise.activeStrategies },
        { label: t('pricing.features.tradesPerDay'), value: TIER_LIMITS.enterprise.tradesPerDay },
        { label: t('pricing.features.dailyLossCap'), value: TIER_LIMITS.enterprise.dailyLossCap },
        { label: t('pricing.features.maxPositionSize'), value: TIER_LIMITS.enterprise.maxPosition },
        { label: t('pricing.features.marketScanning'), value: t('pricing.scanLevels.fullCoverage') },
        { label: t('pricing.features.safetyLimits'), value: true },
        { label: t('pricing.features.apiAccess'), value: true },
        { label: t('pricing.features.prioritySupport'), value: true },
      ],
    },
  ];

  const faqs = [
    { q: t('pricing.faq.howItWorks.q'), a: t('pricing.faq.howItWorks.a') },
    { q: t('pricing.faq.risk.q'), a: t('pricing.faq.risk.a') },
    { q: t('pricing.faq.markets.q'), a: t('pricing.faq.markets.a') },
    { q: t('pricing.faq.cancel.q'), a: t('pricing.faq.cancel.a') },
    { q: t('pricing.faq.account.q'), a: t('pricing.faq.account.a') },
  ];
  return (
    <div className="min-h-screen bg-[#060912] text-white flex flex-col">
      <PublicNavbar />

      <main className="flex-1 pt-24 pb-16 px-4 sm:px-6 max-w-6xl mx-auto w-full">
        {/* Header */}
        <div className="text-center mb-12">
          <p className="text-accent text-xs font-mono font-bold uppercase tracking-widest mb-3">{t('pricing.title')}</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">{t('pricing.heading')}</h1>
          <p className="text-[#8892B0] text-sm max-w-md mx-auto">
            {t('pricing.subtitle')}
          </p>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-20">
          {plans.map(({ name, price, sub, href, cta, highlight, features }) => (
            <div
              key={name}
              className={`relative p-6 flex flex-col gap-5 bg-bg-surface/80 backdrop-blur-sm rounded-lg overflow-hidden hover:border-accent/30 transition-all duration-300 ${
                highlight
                  ? 'border-2 border-accent'
                  : 'border border-bg-border'
              }`}
            >
              {highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-[#F59E0B] to-[#D97706] text-[#060912] text-xs font-bold px-3 py-0.5 rounded-full">
                  {t('pricing.mostPopular')}
                </span>
              )}

              <div>
                <p className="text-[#8892B0] text-xs font-mono uppercase tracking-widest mb-2">{name}</p>
                <p className="text-white text-4xl font-bold font-mono">
                  {price}
                  <span className="text-[#8892B0] text-sm font-normal ml-1">{sub}</span>
                </p>
              </div>

              <ul className="space-y-2.5 flex-1">
                {features.map(({ label, value }) => (
                  <li key={label} className="flex items-center justify-between text-xs">
                    <span className="text-[#8892B0]">{label}</span>
                    <span className="flex items-center gap-1">
                      {typeof value === 'boolean' ? (
                        value ? <CheckIcon /> : <XIcon />
                      ) : (
                        <span className="text-white">{value}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>

              <Link
                to={href}
                className={`text-center text-sm font-bold px-4 py-2.5 rounded transition-all duration-200 min-h-touch ${
                  highlight
                    ? 'bg-gradient-to-r from-[#F59E0B] to-[#D97706] text-[#060912] hover:brightness-110'
                    : 'border border-bg-border text-[#8892B0] hover:text-white hover:border-accent/30'
                }`}
              >
                {cta}
              </Link>
            </div>
          ))}
        </div>

        {/* FAQ */}
        <div className="max-w-2xl mx-auto">
          <h2 className="text-xl font-bold text-white mb-6 text-center">{t('pricing.faqTitle')}</h2>
          <div className="bg-bg-surface/80 backdrop-blur-sm border border-bg-border rounded-lg overflow-hidden">
            {faqs.map(({ q, a }) => (
              <FaqItem key={q} q={q} a={a} />
            ))}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
