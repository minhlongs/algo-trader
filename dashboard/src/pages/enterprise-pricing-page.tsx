/**
 * Enterprise Pricing Page
 * Shows all three enterprise tiers: Growth ($49k) / Scale ($199k) / Unlimited ($499k).
 * CTA leads to contact form — no self-serve checkout, invoice-based only.
 */

import { Link } from 'react-router-dom';
import { PublicNavbar } from '../components/public-navbar';
import { Footer } from '../components/footer';
import { ENTERPRISE_PLANS, type EnterprisePlanKey } from '../lib/enterprise-plans';

function CheckIcon() {
  return (
    <svg width="13" height="13" fill="none" stroke="#00D4AA" strokeWidth="2.5" viewBox="0 0 24 24">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function PlanCard({
  planKey,
  plan,
  highlight,
}: {
  planKey: EnterprisePlanKey;
  plan: (typeof ENTERPRISE_PLANS)[EnterprisePlanKey];
  highlight: boolean;
}) {
  return (
    <div
      className={`relative rounded-lg p-6 flex flex-col gap-5 ${
        highlight
          ? 'border-2 border-accent bg-bg-surface/80 backdrop-blur-sm'
          : 'border border-bg-border bg-bg-surface/80 backdrop-blur-sm'
      }`}
    >
      {highlight && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-bg text-xs font-bold px-3 py-0.5 rounded-full">
          MOST POPULAR
        </span>
      )}

      <div>
        <p className="text-muted text-xs uppercase tracking-widest mb-2">{plan.name}</p>
        <p className="text-white text-3xl font-bold mb-1">{plan.price}</p>
        <p className="text-muted text-xs">{plan.tagline}</p>
      </div>

      <ul className="space-y-2.5 flex-1">
        {plan.features.map((feat) => (
          <li key={feat} className="flex items-start gap-2 text-xs text-muted">
            <span className="flex-shrink-0 mt-0.5"><CheckIcon /></span>
            <span>{feat}</span>
          </li>
        ))}
      </ul>

      <Link
        to={`/enterprise/contact?tier=${planKey}`}
        className={`text-center text-sm font-bold px-4 py-2.5 rounded transition-colors ${
          highlight
            ? 'bg-accent text-bg hover:bg-accent/80'
            : 'border border-bg-border text-muted hover:text-white hover:border-accent/50'
        }`}
      >
        Contact sales
      </Link>
    </div>
  );
}

const ENTERPRISE_FAQS = [
  {
    q: 'How does billing work?',
    a: 'Enterprise plans are billed annually via invoice. No credit card or self-serve checkout — our team sends a custom proposal after the discovery call.',
  },
  {
    q: 'Can I try before committing?',
    a: 'Yes. A 30-day paper-trading demo is provisioned automatically when you submit a contact form. No payment required.',
  },
  {
    q: 'What SLA is included?',
    a: 'Growth: next-business-day response. Scale: 4-hour response. Unlimited: 1-hour response with 99.9% uptime commitment.',
  },
  {
    q: 'Is a custom contract available?',
    a: 'Yes. All enterprise plans include a custom MSA. BAA and DPA available on Unlimited tier.',
  },
];

export function EnterprisePricingPage() {
  return (
    <div className="min-h-screen bg-bg text-white flex flex-col">
      <PublicNavbar />

      <main className="flex-1 pt-24 pb-16 px-4 sm:px-6 max-w-6xl mx-auto w-full">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-2 mb-3">
            <span className="w-1 h-4 bg-accent rounded-full" />
            <p className="text-accent text-xs uppercase tracking-widest font-mono font-bold">Enterprise</p>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Built for institutional desks
          </h1>
          <p className="text-muted text-sm max-w-lg mx-auto">
            Annual contracts, dedicated support, and custom integrations.
            Pricing is invoice-based — our team works with you on terms.
          </p>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {(Object.entries(ENTERPRISE_PLANS) as [EnterprisePlanKey, (typeof ENTERPRISE_PLANS)[EnterprisePlanKey]][]).map(
            ([key, plan]) => (
              <PlanCard key={key} planKey={key} plan={plan} highlight={key === 'scale'} />
            )
          )}
        </div>

        {/* Compared to self-serve */}
        <div className="border border-bg-border bg-bg-surface/80 backdrop-blur-sm rounded-lg p-6 mb-16 max-w-2xl mx-auto text-center">
          <p className="text-xs text-muted uppercase tracking-widest mb-3">Looking for self-serve?</p>
          <p className="text-sm text-muted mb-4">
            Individual and small-team plans start free. Upgrade to Pro for $49/month via our standard checkout.
          </p>
          <Link
            to="/pricing"
            className="inline-block text-sm border border-bg-border text-muted px-5 py-2 rounded hover:text-white hover:border-accent/40 transition-colors"
          >
            View standard pricing
          </Link>
        </div>

        {/* FAQ */}
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-center gap-2 mb-6">
            <span className="w-1 h-5 bg-accent rounded-full" />
            <h2 className="text-xl font-bold text-white">Enterprise FAQ</h2>
          </div>
          <div className="space-y-4">
            {ENTERPRISE_FAQS.map(({ q, a }) => (
              <div key={q} className="border border-bg-border bg-bg-surface/80 backdrop-blur-sm rounded-lg p-5">
                <p className="text-sm font-semibold text-white mb-2">{q}</p>
                <p className="text-xs text-muted leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
