import { useState } from 'react';
import { GuideContent } from '../components/guide-content';
import { StitchPageShell } from '../components/ui/stitch-page-shell';
import { StitchSectionTitle } from '../components/ui/stitch-section-title';

const COPY = {
  en: {
    langToggle: 'Tiếng Việt',
    eyebrow: 'Operator Guide',
    title: 'CashClaw SOPs',
    subtitle: 'Everything you need to run the market-making bot profitably.',
  },
  vi: {
    langToggle: 'English',
    eyebrow: 'Hướng Dẫn Vận Hành',
    title: 'Hướng Dẫn CashClaw',
    subtitle: 'Mọi thứ bạn cần để vận hành bot giao dịch sinh lời.',
  },
};

type Lang = 'en' | 'vi';

export function GuidePage() {
  const [lang, setLang] = useState<Lang>('en');
  const t = COPY[lang];

  return (
    <div className="min-h-screen bg-[${COLORS.bg}] text-[${COLORS.onSurface}] font-sans">
      {/* Lang toggle */}
      <div className="flex justify-end px-4 sm:px-8 pt-6">
        <button
          onClick={() => setLang((l: Lang) => (l === 'en' ? 'vi' : 'en'))}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[${COLORS.outline}] bg-[${COLORS.surface}]/80 text-[${COLORS.onSurfaceVariant}] text-xs hover:border-[${COLORS.primary}] hover:text-[${COLORS.primary}] transition-colors"
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
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10" />
          </svg>
          {t.langToggle}
        </button>
      </div>

      <StitchPageShell>
        <div className="max-w-[800px] mx-auto px-4 py-8 bg-[${COLORS.surface}]/80 backdrop-blur-xl border border-[${COLORS.outline}] rounded-2xl">
          <StitchSectionTitle eyebrow={t.eyebrow} title={t.title}>
            {t.subtitle}
          </StitchSectionTitle>
          <GuideContent />
        </div>
      </StitchPageShell>
    </div>
  );
}
