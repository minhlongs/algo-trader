/**
 * Hero section for Solo Quant Desk landing.
 * Polar-safe copy: no "AI", no health/wellness terms. Uses "autonomous agent",
 * "algorithmic", "model" per phase-02 spec.
 */
import { Link } from 'react-router-dom';
import { COLORS as _COLORS } from '../lib/stitch-design-tokens';

export interface HeroSoloQuantProps {
  /** External or internal methodology URL — defaults to in-app /methodology route. */
  methodologyHref?: string;
}

const DEFAULT_METHODOLOGY_URL = '/methodology';

export function HeroSoloQuant({
  methodologyHref = DEFAULT_METHODOLOGY_URL,
}: HeroSoloQuantProps) {
  const isInternal = methodologyHref.startsWith('/');

  return (
    <section className="pt-32 pb-16 px-4 sm:px-6 max-w-5xl mx-auto">
      <div className="flex flex-col items-start gap-6">
        <p
          className="text-xs uppercase tracking-[0.2em] font-mono"
          style={{ color: _COLORS.primary }}
        >
          Prediction-Market Desk · Polymarket
        </p>
        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold leading-[1.05] tracking-tight text-white">
          Solo Quant Desk —
          <br />
          <span style={{ color: _COLORS.primary }}>Live on Polymarket</span>
        </h1>
        <h2
          className="text-lg sm:text-xl leading-relaxed max-w-2xl"
          style={{ color: _COLORS.onSurfaceVariant }}
        >
          One human. Zero overhead. Open methodology.
        </h2>
        <p
          className="text-sm sm:text-base leading-relaxed max-w-2xl"
          style={{ color: `${_COLORS.onSurfaceVariant}CC` }}
        >
          A single operator runs an entire quantitative desk with an autonomous
          agent stack, a local model, and a public trade log. The claim is
          verifiable — every trade is recorded, every batch is published.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          {isInternal ? (
            <Link
              to={methodologyHref}
              className="font-bold px-6 py-3 rounded transition-colors text-sm min-h-touch inline-flex items-center hover:opacity-90"
              style={{
                backgroundColor: _COLORS.primary,
                color: _COLORS.surface,
              }}
            >
              Read Methodology
            </Link>
          ) : (
            <a
              href={methodologyHref}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold px-6 py-3 rounded transition-colors text-sm min-h-touch inline-flex items-center hover:opacity-90"
              style={{
                backgroundColor: _COLORS.primary,
                color: _COLORS.surface,
              }}
            >
              Read Methodology
            </a>
          )}
          <Link
            to="/manifesto"
            className="font-semibold px-6 py-3 rounded transition-colors text-sm min-h-touch inline-flex items-center hover:text-white"
            style={{
              border: `1px solid ${_COLORS.outline}`,
              color: _COLORS.onSurfaceVariant,
            }}
          >
            Read Manifesto
          </Link>
        </div>
      </div>
    </section>
  );
}
