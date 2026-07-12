/**
 * Solo Quant Desk landing — community-first `/` page (phase-02 dual-layer).
 * Stitch dark fintech bilingual VN+EN pattern.
 * Polar-safe copy: no "AI", "wellness", "health", "medical", or "fitness".
 * Composition: public navbar → hero → paper stats → principles strip → footer.
 */
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { PublicNavbar } from '../components/public-navbar';
import { Footer } from '../components/footer';
import { HeroSoloQuant } from '../components/hero-solo-quant';
import { PaperStatsCard } from '../components/paper-stats-card';
import { COLORS } from '../lib/stitch-design-tokens';

type Lang = 'en' | 'vi';

const COPY: Record<Lang, {
  langToggle: string;
  title: string;
  subtitle: string;
  heroEyebrow: string;
  heroTitleLine1: string;
  heroTitleLine2: string;
  heroTagline: string;
  heroDesc: string;
  readMethodology: string;
  readManifesto: string;
  viewSource: string;
  principlesEyebrow: string;
  principleOneHuman: { label: string; body: string };
  principleZeroOverhead: { label: string; body: string };
  principleOpen: { label: string; body: string };
  principleVerifiable: { label: string; body: string };
  readManifestoBtn: string;
  viewSourceBtn: string;
  manifestoEyebrow: string;
  manifestoTitle: string;
  manifestoBody: string;
  manifestoCta: string;
}> = {
  en: {
    langToggle: 'Tiếng Việt',
    title: 'Solo Quant Desk',
    subtitle: 'One human. Zero overhead. Verifiable edge.',
    heroEyebrow: 'Prediction-Market Desk — Polymarket',
    heroTitleLine1: 'Solo Quant Desk',
    heroTitleLine2: 'Live on Polymarket',
    heroTagline: 'One human. Zero overhead. Open methodology.',
    heroDesc: 'A single operator runs an entire quantitative desk with an autonomous agent stack, a local model, and a public trade log. The claim is verifiable — every trade is recorded, every batch published.',
    readMethodology: 'Read Methodology',
    readManifesto: 'Read Manifesto',
    viewSource: 'View Source',
    principlesEyebrow: 'What the desk refuses to become',
    principleOneHuman: {
      label: 'One human',
      body: 'No employees, no contractors. The operator runs every module — research, sizing, execution, monitoring.',
    },
    principleZeroOverhead: {
      label: 'Zero overhead',
      body: 'M1 Max workstation, a local model on port 11435, SQLite, Cloudflare free tier. Monthly operating cost: $0.',
    },
    principleOpen: {
      label: 'Open methodology',
      body: 'Blind-prompt alpha extraction. Quarter-Kelly sizing. Event markets only. Source repo is public.',
    },
    principleVerifiable: {
      label: 'Verifiable',
      body: 'Every paper trade recorded. Batches published on cadence. Losing weeks posted alongside winning ones.',
    },
    readManifestoBtn: 'Read the Manifesto',
    viewSourceBtn: 'View Source',
    manifestoEyebrow: 'Follow the build, in public.',
    manifestoTitle: 'Follow the build, in public.',
    manifestoBody: 'The repository and rolling stats update with every resolved batch. No newsletter funnel. No paywall.',
    manifestoCta: 'The repository and rolling stats update with every resolved batch. No newsletter funnel. No paywall.',
  },
  vi: {
    langToggle: 'English',
    title: 'Solo Quant Desk',
    subtitle: 'Một người vận hành. Không chi phí phát sinh. Lợi thế có thể kiểm chứng.',
    heroEyebrow: 'Phòng giao dịch Prediction Market — Polymarket',
    heroTitleLine1: 'Solo Quant Desk',
    heroTitleLine2: 'Trực tiếp trên Polymarket',
    heroTagline: 'Một người vận hành. Không chi phí phát sinh. Phương pháp minh bạch.',
    heroDesc: 'Một người vận hành duy nhất điều hành toàn bộ phòng giao dịch định lượng với STACK tác nhân tự chủ, mô hình cục bộ, và nhật ký giao dịch công khai. Tuyên bố có thể được kiểm chứng — Mỗi giao dịch được ghi lại, mỗi batch được công bố.',
    readMethodology: 'Đọc Phương pháp luận',
    readManifesto: 'Đọc Manifesto',
    viewSource: 'Xem Nguồn',
    principlesEyebrow: 'Những nguyên tắc không thể phá vỡ',
    principleOneHuman: {
      label: 'Một người vận hành',
      body: 'Không nhân viên, không đối tác. Người vận hành điều hành mọi module — nghiên cứu, tính sizing, thực thi, giám sát.',
    },
    principleZeroOverhead: {
      label: 'Không chi phí phát sinh',
      body: 'Workstation M1 Max, local model trên port 11435, SQLite, Cloudflare free tier. Chi phí vận hành hàng tháng: $0.',
    },
    principleOpen: {
      label: 'Phương pháp minh bạch',
      body: 'Alpha extraction blind-prompt. Sizing Quarter-Kelly. Chỉ thị trường event. Source repo public.',
    },
    principleVerifiable: {
      label: 'Có thể kiểm chứng',
      body: 'Mọi paper trade được ghi lại. Batches được công bố đúng định kỳ. Các tuần lỗ được công bố công khai bên cạnh các tuần thắng.',
    },
    readManifestoBtn: 'Đọc Manifesto',
    viewSourceBtn: 'Xem Nguồn',
    manifestoEyebrow: 'Theo dõi quá trình phát triển công khai.',
    manifestoTitle: 'Theo dõi quá trình phát triển công khai.',
    manifestoBody: 'Repository và thống kê động được cập nhật với mỗi batch đã giải quyết. Không newsletter funnel. Không paywall.',
    manifestoCta: 'Repository và thống kê động được cập nhật với mỗi batch đã giải quyết. Không newsletter funnel. Không paywall.',
  },
};

const PRINCIPLES = [
  COPY.en.principleOneHuman,
  COPY.en.principleZeroOverhead,
  COPY.en.principleOpen,
  COPY.en.principleVerifiable,
] as const;

export function LandingSoloQuant() {
  const [lang, setLang] = useState<Lang>('en');
  const t = COPY[lang];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e3e2e2] font-sans">
      {/* Language toggle — top-right, unsticks from content flow */}
      <div className="fixed top-4 right-4 z-50">
        <button
          onClick={() => setLang((l: Lang) => (l === 'en' ? 'vi' : 'en'))}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#414754] bg-[#121414]/80 text-[#c1c6d7] text-xs hover:border-[#aec6ff] hover:text-[#aec6ff] transition-colors"
          aria-label="Toggle language"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10" />
          </svg>
          {t.langToggle}
        </button>
      </div>

      <PublicNavbar />

      <HeroSoloQuant />

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
          {PRINCIPLES.map((p) => {
            const principleData = lang === 'vi'
              ? (p === PRINCIPLES[0] ? COPY.vi.principleOneHuman
                : p === PRINCIPLES[1] ? COPY.vi.principleZeroOverhead
                : p === PRINCIPLES[2] ? COPY.vi.principleOpen
                : COPY.vi.principleVerifiable)
              : p;
            return (
              <div
                key={principleData.label}
                className="glass-card p-6"
              >
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
            );
          })}
        </div>
      </section>

      {/* Closing CTA row */}
      <section className="py-16 px-4 sm:px-6 max-w-3xl mx-auto text-center">
        <h3
          className="text-2xl sm:text-3xl font-bold mb-4 tracking-tight"
          style={{ color: COLORS.onSurface }}
        >
          {t.manifestoTitle}
        </h3>
        <p
          className="text-base mb-6 leading-relaxed"
          style={{ color: COLORS.onSurfaceVariant }}
        >
          {t.manifestoBody}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            to="/manifesto"
            className="font-bold px-6 py-3 rounded transition-colors text-sm min-h-touch inline-flex items-center"
            style={{
              backgroundColor: COLORS.primaryContainer,
              color: COLORS.onSurface,
            }}
          >
            {t.readManifestoBtn}
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
