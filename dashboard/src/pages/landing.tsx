/**
 * Solo Quant Desk landing — community-first `/` page (phase-02 dual-layer).
 * Polar-safe copy: no "AI", "wellness", "health", "medical", or "fitness".
 * Composition: public navbar → hero → paper stats → principles strip → footer.
 */
import { Link } from 'react-router-dom';
import { PublicNavbar } from '../components/public-navbar';
import { Footer } from '../components/footer';
import { HeroSoloQuant } from '../components/hero-solo-quant';
import { PaperStatsCard } from '../components/paper-stats-card';

const PRINCIPLES: Array<{ label: string; body: string }> = [
  {
    label: 'One human',
    body: 'No employees, no contractors. The operator runs every module — research, sizing, execution, monitoring.',
  },
  {
    label: 'Zero overhead',
    body: 'M1 Max workstation, a local model on port 11435, SQLite, Cloudflare free tier. Monthly operating cost: $0.',
  },
  {
    label: 'Open methodology',
    body: 'Blind-prompt alpha extraction. Quarter-Kelly sizing. Event markets only. Source repo is public.',
  },
  {
    label: 'Verifiable',
    body: 'Every paper trade recorded. Batches published on cadence. Losing weeks posted alongside winning ones.',
  },
];

export function LandingSoloQuant() {
  return (
    <div
      className="min-h-screen bg-[#080B14] text-white font-sans"
      style={{
        backgroundImage:
          'radial-gradient(circle at 1px 1px, #1E2640 1px, transparent 0)',
        backgroundSize: '32px 32px',
      }}
    >
      <PublicNavbar />

      <HeroSoloQuant />

      <PaperStatsCard />

      {/* Principles strip */}
      <section className="py-16 px-4 sm:px-6 max-w-5xl mx-auto">
        <p className="text-[#00C8E8] text-xs uppercase tracking-[0.2em] font-mono mb-8">
          What the desk refuses to become
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {PRINCIPLES.map(({ label, body }) => (
            <div
              key={label}
              className="bg-[#111627] border border-[#1E2640] rounded-lg p-6 hover:border-[#00C8E8]/40 transition-colors"
            >
              <p className="text-white font-bold text-sm mb-2 font-mono">
                {label}
              </p>
              <p className="text-[#8892B0] text-sm leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Closing CTA row */}
      <section className="py-16 px-4 sm:px-6 max-w-3xl mx-auto text-center">
        <h3 className="text-white text-2xl sm:text-3xl font-bold mb-4 tracking-tight">
          Follow the build, in public.
        </h3>
        <p className="text-[#8892B0] text-base mb-6 leading-relaxed">
          The repository and rolling stats update with every resolved batch. No
          newsletter funnel. No paywall.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            to="/manifesto"
            className="bg-[#00C8E8] text-[#080B14] font-bold px-6 py-3 rounded hover:bg-[#00C8E8]/80 transition-colors text-sm min-h-touch inline-flex items-center"
          >
            Read the Manifesto
          </Link>
          <a
            href="https://github.com/longtho638-jpg/algo-trader"
            target="_blank"
            rel="noopener noreferrer"
            className="border border-[#1E2640] text-[#8892B0] hover:text-white hover:border-[#00C8E8]/50 font-semibold px-6 py-3 rounded transition-colors text-sm min-h-touch inline-flex items-center"
          >
            View Source
          </a>
        </div>
      </section>

      <Footer />
    </div>
  );
}
