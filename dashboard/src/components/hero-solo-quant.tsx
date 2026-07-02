/**
 * Hero section for Solo Quant Desk landing.
 * Polar-safe copy: no "AI", no health/wellness terms. Uses "autonomous agent",
 * "algorithmic", "model" per phase-02 spec.
 */
import { Link } from 'react-router-dom';

export interface HeroSoloQuantProps {
  /** External methodology URL — GitHub direct link for v1 per phase-02 §Architecture. */
  methodologyHref?: string;
}

const DEFAULT_METHODOLOGY_URL =
  'https://github.com/longtho638-jpg/algo-trader/blob/main/docs/BINH_PHAP_TRADING.md';

export function HeroSoloQuant({
  methodologyHref = DEFAULT_METHODOLOGY_URL,
}: HeroSoloQuantProps) {
  return (
    <section className="pt-32 pb-16 px-4 sm:px-6 max-w-5xl mx-auto">
      <div className="flex flex-col items-start gap-6">
        <p className="text-[#F59E0B] text-xs uppercase tracking-[0.2em]">
          Prediction-Market Desk · Polymarket
        </p>
        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold leading-[1.05] tracking-tight text-white">
          Solo Quant Desk —
          <br />
          <span className="text-[#F59E0B]">Live on Polymarket</span>
        </h1>
        <h2 className="text-[#8892B0] text-lg sm:text-xl leading-relaxed max-w-2xl">
          One human. Zero overhead. Open methodology.
        </h2>
        <p className="text-[#8892B0]/80 text-sm sm:text-base leading-relaxed max-w-2xl">
          A single operator runs an entire quantitative desk with an autonomous
          agent stack, a local model, and a public trade log. The claim is
          verifiable — every trade is recorded, every batch is published.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <a
            href={methodologyHref}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-[#F59E0B] text-[#080B14] font-bold px-6 py-3 rounded hover:bg-[#F59E0B]/80 transition-colors text-sm min-h-touch inline-flex items-center"
          >
            Read Methodology
          </a>
          <Link
            to="/manifesto"
            className="border border-[#1E2640] text-[#8892B0] hover:text-white hover:border-[#F59E0B]/50 font-semibold px-6 py-3 rounded transition-colors text-sm min-h-touch inline-flex items-center"
          >
            Read Manifesto
          </Link>
        </div>
      </div>
    </section>
  );
}
