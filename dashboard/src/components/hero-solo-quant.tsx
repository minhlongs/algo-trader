/**
 * Hero section for Solo Quant Desk landing.
 * Polar-safe copy: no "AI", no health/wellness terms. Uses "autonomous agent",
 * "algorithmic", "model" per phase-02 spec.
 * Supports bilingual VN+EN and Dual-Funnel CTAs (/methodology + /pricing).
 */
import { Link } from 'react-router-dom';
import { COLORS as _COLORS } from '../lib/stitch-design-tokens';

export type HeroLang = 'en' | 'vi';

export interface HeroSoloQuantProps {
  /** External or internal methodology URL — defaults to in-app /methodology route. */
  methodologyHref?: string;
  /** Language toggle ('en' | 'vi'), defaults to 'en'. */
  lang?: HeroLang;
}

const DEFAULT_METHODOLOGY_URL = '/methodology';

const HERO_COPY: Record<
  HeroLang,
  {
    eyebrow: string;
    titleLine1: string;
    titleLine2: string;
    tagline: string;
    description: string;
    ctaMethodology: string;
    ctaPricing: string;
    ctaManifesto: string;
  }
> = {
  en: {
    eyebrow: 'Prediction-Market Desk · Polymarket',
    titleLine1: 'Solo Quant Desk —',
    titleLine2: 'Live on Polymarket',
    tagline: 'One human. Zero overhead. Open methodology.',
    description:
      'A single operator runs an entire quantitative desk with an autonomous agent stack, a local model, and a public trade log. The claim is verifiable — every trade is recorded, every batch is published.',
    ctaMethodology: 'Read Methodology',
    ctaPricing: 'Start CashClaw Free ($0)',
    ctaManifesto: 'Read Manifesto',
  },
  vi: {
    eyebrow: 'Phòng Giao Dịch Định Lượng · Polymarket',
    titleLine1: 'Solo Quant Desk —',
    titleLine2: 'Trực tiếp trên Polymarket',
    tagline: 'Một người vận hành. Không chi phí thừa. Phương pháp minh bạch.',
    description:
      'Một nhà nghiên cứu độc lập vận hành toàn bộ bàn giao dịch định lượng bằng hệ thống tác nhân tự chủ, mô hình cục bộ và nhật ký giao dịch công khai. Mọi số liệu đều có thể kiểm chứng — từng lệnh được ghi nhận, từng chu kỳ được công bố.',
    ctaMethodology: 'Đọc Phương Pháp Luận',
    ctaPricing: 'Bắt Đầu Gói Miễn Phí ($0)',
    ctaManifesto: 'Đọc Tuyên Ngôn',
  },
};

export function HeroSoloQuant({
  methodologyHref = DEFAULT_METHODOLOGY_URL,
  lang = 'en',
}: HeroSoloQuantProps) {
  const isInternal = methodologyHref.startsWith('/');
  const t = HERO_COPY[lang];

  return (
    <section className="pt-32 pb-16 px-4 sm:px-6 max-w-5xl mx-auto">
      <div className="flex flex-col items-start gap-6">
        <p
          className="text-xs uppercase tracking-[0.2em] font-mono"
          style={{ color: _COLORS.primary }}
        >
          {t.eyebrow}
        </p>
        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold leading-[1.05] tracking-tight text-white">
          {t.titleLine1}
          <br />
          <span style={{ color: _COLORS.primary }}>{t.titleLine2}</span>
        </h1>
        <h2
          className="text-lg sm:text-xl leading-relaxed max-w-2xl"
          style={{ color: _COLORS.onSurfaceVariant }}
        >
          {t.tagline}
        </h2>
        <p
          className="text-sm sm:text-base leading-relaxed max-w-2xl"
          style={{ color: `${_COLORS.onSurfaceVariant}CC` }}
        >
          {t.description}
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
              {t.ctaMethodology}
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
              {t.ctaMethodology}
            </a>
          )}
          <Link
            to="/pricing"
            className="font-bold px-6 py-3 rounded transition-colors text-sm min-h-touch inline-flex items-center hover:opacity-90"
            style={{
              backgroundColor: _COLORS.primaryContainer,
              color: _COLORS.onSurface,
              border: `1px solid ${_COLORS.primary}`,
            }}
          >
            {t.ctaPricing}
          </Link>
          <Link
            to="/manifesto"
            className="font-semibold px-6 py-3 rounded transition-colors text-sm min-h-touch inline-flex items-center hover:text-white"
            style={{
              border: `1px solid ${_COLORS.outline}`,
              color: _COLORS.onSurfaceVariant,
            }}
          >
            {t.ctaManifesto}
          </Link>
        </div>
      </div>
    </section>
  );
}
