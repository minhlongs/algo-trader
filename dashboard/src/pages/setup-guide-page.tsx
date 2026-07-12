import { useState } from 'react';
import { SetupGuideContent } from '../components/setup-guide-content';
import { StitchPageShell } from '../components/ui/stitch-page-shell';
import { StitchSectionTitle } from '../components/ui/stitch-section-title';

type Lang = 'en' | 'vi';

const COPY: Record<Lang, {
  langToggle: string;
  title: string;
  subtitle: string;
  eyebrow: string;
  stepLabel: string;
  statusLabel: string;
}> = {
  en: {
    langToggle: 'Tiếng Việt',
    title: 'From Zero to Live Trading',
    subtitle: 'Step-by-step: from zero to live trading with CashClaw.',
    eyebrow: 'Full Setup Guide',
    stepLabel: 'Step',
    statusLabel: 'Status',
  },
  vi: {
    langToggle: 'English',
    title: 'Từ Zero đến Giao Dịch Thực',
    subtitle: 'Từng bước: từ zero đến giao dịch thực với CashClaw.',
    eyebrow: 'Hướng Dẫn Cài Đặt Đầy Đủ',
    stepLabel: 'Bước',
    statusLabel: 'Trạng Thái',
  },
};

export function SetupGuidePage() {
  const [lang, setLang] = useState<Lang>('en');
  const t = COPY[lang];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e3e2e2] font-sans">
      {/* Language Toggle — globe icon, top right */}
      <div className="fixed top-4 right-4 z-50">
        <button
          onClick={() => setLang(lang === 'en' ? 'vi' : 'en')}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#121414]/80 backdrop-blur-xl border border-[#414754] text-[#e3e2e2] hover:text-[#aec6ff] transition-colors"
          aria-label={`Switch to ${t.langToggle}`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          <span className="text-sm font-medium">{lang === 'en' ? 'VN' : 'EN'}</span>
        </button>
      </div>

      <StitchPageShell>
        <div className="max-w-[800px] mx-auto px-4 py-8">
          <StitchSectionTitle eyebrow={t.eyebrow} title={t.title}>
            {t.subtitle}
          </StitchSectionTitle>
          <SetupGuideContent />
        </div>
      </StitchPageShell>
    </div>
  );
}
