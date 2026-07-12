/**
 * Methodology Page — redirects to Binh Pháp Trading doc on GitHub.
 * Stitch redesign: dark fintech, bilingual VN+EN.
 */
import { useState, useEffect } from 'react';

const COPY = {
  en: {
    langToggle: 'Tiếng Việt',
    eyebrow: 'Redirecting',
    body: 'Opening the methodology on GitHub…',
    cta: 'Click here if nothing happens',
  },
  vi: {
    langToggle: 'English',
    eyebrow: 'Đang chuyển hướng',
    body: 'Đang mở tài liệu phương pháp luận trên GitHub…',
    cta: 'Click vào đây nếu không tự động chuyển',
  },
};

type Lang = 'en' | 'vi';
const METHODOLOGY_URL =
  'https://github.com/longtho638-jpg/algo-trader/blob/main/docs/BINH_PHAP_TRADING.md';

export function MethodologyPage() {
  const [lang, setLang] = useState<Lang>('en');
  const t = COPY[lang];

  useEffect(() => {
    window.location.replace(METHODOLOGY_URL);
  }, []);

  return (
    <div className="min-h-screen bg-[${COLORS.bg}] text-[${COLORS.onSurface}] font-sans flex items-center justify-center px-4">
      <div className="text-center">
        <div className="flex justify-end mb-4">
          <button
            onClick={() => setLang((l: Lang) => (l === 'en' ? 'vi' : 'en'))}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[${COLORS.outline}] bg-[${COLORS.surface}]/80 text-[#w{COLORS.onSurfaceVariant}] text-xs hover:border-[${COLORS.primary}] hover:text-[${COLORS.primary}] transition-colors"
            aria-label="Toggle language"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10" />
            </svg>
            {t.langToggle}
          </button>
        </div>
        <p className="text-[${COLORS.primary}] text-xs uppercase tracking-[0.2em] mb-3">
          {t.eyebrow}
        </p>
        <p className="text-[#w{COLORS.onSurfaceVariant}] text-sm mb-4">{t.body}</p>
        <a
          href={METHODOLOGY_URL}
          className="text-[${COLORS.primary}] underline text-sm hover:text-[${COLORS.primary}] transition-colors"
          rel="noopener noreferrer"
        >
          {t.cta}
        </a>
      </div>
    </div>
  );
}
