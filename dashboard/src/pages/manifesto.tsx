/** /manifesto route — renders docs/manifesto.md (copied to /public at build). Dark fintech bilingual VN+EN pattern. */

import { useState } from 'react';
import { Footer } from '../components/footer';
import { MarkdownViewer } from '../components/markdown-viewer';
import { COLORS } from '../lib/stitch-design-tokens';

type Lang = 'en' | 'vi';

const COPY: Record<Lang, Record<string, string>> = {
  en: {
    langToggle: 'Tieng Viet',
    loading: 'Loading manifesto…',
    loadingError: 'Failed to load manifest',
  },
  vi: {
    langToggle: 'English',
    loading: 'Dang tai manifesto…',
    loadingError: 'Khong tai duoc manifest',
  },
};

export function ManifestoPage() {
  const [lang, setLang] = useState<Lang>('en');
  const t = COPY[lang];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e3e2e2] font-sans flex flex-col">
      {/* Globe language toggle */}
      <div className="p-4 flex justify-end">
        <button
          onClick={() => setLang(lang === 'en' ? 'vi' : 'en')}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors"
          style={{
            backgroundColor: COLORS.surface,
            border: `1px solid ${COLORS.outline}`,
            color: COLORS.onSurfaceVariant,
          }}
          aria-label={`Switch to ${lang === 'en' ? 'Vietnamese' : 'English'}`}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10A15.3 15.3 0 0112 2z" />
          </svg>
          {lang === 'en' ? 'Tieng Viet' : 'English'}
        </button>
      </div>

      <main className="flex-1 pt-4">
        <div className="bg-[#121414]/80 backdrop-blur-xl border border-[#414754] rounded-2xl mx-4">
          <MarkdownViewer
            src="/manifesto.md"
            loadingLabel={t.loading}
          />
        </div>
      </main>

      <Footer />
    </div>
  );
}
