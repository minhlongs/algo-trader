/**
 * Solo Quant Desk landing — community-first `/` page (phase-02 dual-layer).
 * Stitch dark fintech bilingual VN+EN pattern with Dual-Funnel CTAs.
 * Polar-safe copy: no "AI", "wellness", "health", "medical", or "fitness".
 * Composition: public navbar → hero → paper stats → principles strip → dual-funnel CTA → footer.
 */
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { PublicNavbar } from '../components/public-navbar';
import { Footer } from '../components/footer';
import { HeroSoloQuant } from '../components/hero-solo-quant';
import { PaperStatsCard } from '../components/paper-stats-card';
import { COLORS } from '../lib/stitch-design-tokens';
import { LANDING_COPY, type LandingLang } from './landing-copy';

export function LandingSoloQuant() {
  const [lang, setLang] = useState<LandingLang>('en');
  const t = LANDING_COPY[lang];

  const langToggleNode = (
    <button
      onClick={() => setLang((l: LandingLang) => (l === 'en' ? 'vi' : 'en'))}
      className="flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full border text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2"
      style={{
        backgroundColor: `${COLORS.surface}CC`,
        borderColor: COLORS.outline,
        color: COLORS.onSurfaceVariant,
      }}
      aria-label="Toggle language"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10" />
      </svg>
      <span>{t.langToggle}</span>
    </button>
  );

  return (
    <div
      className="min-h-screen font-sans"
      style={{ backgroundColor: COLORS.bg, color: COLORS.onSurface }}
    >
      <PublicNavbar rightSlot={langToggleNode} />

      <HeroSoloQuant lang={lang} />

      <PaperStatsCard />

      {/* Principles strip */}
      <section className="py-16 px-4 sm:px-6 max-w-5xl mx-auto">
        <p
          className="text-xs uppercase tracking-[0.2em] mb-8"
          style={{ color: COLORS.primary }}
        >
          {t.principlesEyebrow}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {t.principles.map((principleData) => (
            <div key={principleData.label} className="glass-card p-6">
              <p className="font-bold text-sm mb-2" style={{ color: COLORS.onSurface }}>
                {principleData.label}
              </p>
              <p
                className="text-sm leading-relaxed"
                style={{ color: COLORS.onSurfaceVariant }}
              >
                {principleData.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Dual-Funnel Closing CTA row */}
      <section className="py-16 px-4 sm:px-6 max-w-3xl mx-auto text-center">
        <p
          className="text-xs uppercase tracking-[0.2em] font-mono mb-3"
          style={{ color: COLORS.primary }}
        >
          {t.dualFunnelEyebrow}
        </p>
        <h3
          className="text-2xl sm:text-3xl font-bold mb-4 tracking-tight"
          style={{ color: COLORS.onSurface }}
        >
          {t.dualFunnelTitle}
        </h3>
        <p
          className="text-base mb-8 leading-relaxed"
          style={{ color: COLORS.onSurfaceVariant }}
        >
          {t.dualFunnelBody}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            to="/methodology"
            className="font-bold px-6 py-3 rounded transition-colors text-sm min-h-touch inline-flex items-center hover:opacity-90"
            style={{
              backgroundColor: COLORS.primary,
              color: COLORS.surface,
            }}
          >
            {t.ctaMethodologyBtn}
          </Link>
          <Link
            to="/pricing"
            className="font-bold px-6 py-3 rounded transition-colors text-sm min-h-touch inline-flex items-center hover:opacity-90"
            style={{
              backgroundColor: COLORS.primaryContainer,
              color: COLORS.onSurface,
              border: `1px solid ${COLORS.primary}`,
            }}
          >
            {t.ctaPricingBtn}
          </Link>
          <Link
            to="/signup?tier=free"
            className="font-semibold px-6 py-3 rounded transition-colors text-sm min-h-touch inline-flex items-center hover:text-white"
            style={{
              border: `1px solid ${COLORS.outline}`,
              color: COLORS.onSurfaceVariant,
            }}
          >
            {t.ctaSignupBtn}
          </Link>
          <Link
            to="/manifesto"
            className="font-semibold px-6 py-3 rounded transition-colors text-sm min-h-touch inline-flex items-center hover:text-white"
            style={{
              border: `1px solid ${COLORS.outline}`,
              color: COLORS.onSurfaceVariant,
            }}
          >
            {t.ctaManifestoBtn}
          </Link>
          <a
            href="https://github.com/longtho638-jpg/algo-trader"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold px-6 py-3 rounded transition-colors text-sm min-h-touch inline-flex items-center"
            style={{
              border: `1px solid ${COLORS.outline}`,
              color: COLORS.onSurfaceVariant,
            }}
          >
            {t.viewSourceBtn}
          </a>
        </div>
      </section>

      <Footer />
    </div>
  );
}
