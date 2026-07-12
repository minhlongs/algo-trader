/**
 * Public docs page at /docs — full page with PublicNavbar + Footer.
 * Left sticky TOC on desktop, horizontal scrollable bar on mobile.
 * Active section tracked via IntersectionObserver.
 *
 * Stitch redesign: dark fintech, bilingual VN+EN.
 */
import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { PublicNavbar } from '../components/public-navbar';
import { Footer } from '../components/footer';
import { GuideContent } from '../components/guide-content';

const COPY = {
  en: {
    langToggle: 'Tiếng Việt',
    title: 'Operator Guide',
    subtitle: 'CashClaw SOPs — everything you need to run the market-making bot profitably.',
    onThisPage: 'On this page',
    haveAccount: 'Have an account?',
    viewInApp: 'View in app →',
  },
  vi: {
    langToggle: 'English',
    title: 'Hướng Dẫn Operator',
    subtitle: 'CashClaw SOPs — mọi thứ bạn cần để vận hành bot market-making có lãi.',
    onThisPage: 'Trang này',
    haveAccount: 'Có tài khoản?',
    viewInApp: 'Xem trong app →',
  },
};

const TOC_ITEMS = [
  { id: 'how-it-works', labelEn: 'How It Works', labelVi: 'Cách Hoạt Động' },
  { id: 'returns', labelEn: 'Expected Returns', labelVi: 'Lợi Nhuận Kỳ Vọng' },
  { id: 'quick-start', labelEn: 'Quick Start', labelVi: 'Bắt Đầu Nhanh' },
  { id: 'daily-ops', labelEn: 'Daily Operations', labelVi: 'Vận Hành Hàng Ngày' },
  { id: 'parameters', labelEn: 'Parameters', labelVi: 'Tham Số' },
  { id: 'troubleshooting', labelEn: 'Troubleshooting', labelVi: 'Xử Lý Sự Cố' },
  { id: 'emergency', labelEn: 'Emergency Stop', labelVi: 'Dừng Khẩn Cấp' },
  { id: 'glossary', labelEn: 'Glossary', labelVi: 'Thuật Ngữ' },
];

type Lang = 'en' | 'vi';

export function DocsPage() {
  const [lang, setLang] = useState<Lang>('en');
  const t = COPY[lang];
  const [activeId, setActiveId] = useState('how-it-works');
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const options = { rootMargin: '-20% 0px -70% 0px', threshold: 0 };

    observerRef.current = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setActiveId(entry.target.id);
        }
      });
    }, options);

    TOC_ITEMS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observerRef.current?.observe(el);
    });

    return () => observerRef.current?.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const tocLabel = (item: typeof TOC_ITEMS[0]) =>
    lang === 'en' ? item.labelEn : item.labelVi;

  return (
    <div className="min-h-screen bg-[${COLORS.bg}] text-[${COLORS.onSurface}] font-sans">
      <PublicNavbar />

      {/* Language toggle */}
      <div className="flex justify-end px-4 sm:px-8 pt-6">
        <button
          onClick={() => setLang((l: Lang) => (l === 'en' ? 'vi' : 'en'))}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[${COLORS.outline}] bg-[${COLORS.surface}]/80 text-[${COLORS.onSurfaceVariant}] text-xs hover:border-[${COLORS.primary}] hover:text-[${COLORS.primary}] transition-colors"
          aria-label="Toggle language"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10" />
          </svg>
          {t.langToggle}
        </button>
      </div>

      {/* Mobile TOC — horizontal scroll bar */}
      <div className="md:hidden sticky top-14 z-40 bg-[${COLORS.bg}]/95 backdrop-blur border-b border-[${COLORS.outline}] px-4 py-2 overflow-x-auto">
        <div className="flex gap-4 whitespace-nowrap">
          {TOC_ITEMS.map(({ id }) => (
            <button
              key={id}
              onClick={() => scrollTo(id)}
              className={`text-xs py-1 transition-colors ${
                activeId === id ? 'text-[${COLORS.primary}]' : 'text-[${COLORS.onSurfaceVariant}] hover:text-white'
              }`}
            >
              {tocLabel(TOC_ITEMS.find((item) => item.id === id)!)}
            </button>
          ))}
        </div>
      </div>

      {/* Main layout */}
      <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 pt-20 md:pt-24 pb-16 flex gap-10">
        {/* Desktop sidebar TOC */}
        <aside className="hidden md:block w-[200px] flex-shrink-0">
          <div className="sticky top-24">
            <p className="text-xs text-[${COLORS.onSurfaceVariant}] uppercase tracking-widest mb-4">{t.onThisPage}</p>
            <nav className="space-y-1">
              {TOC_ITEMS.map(({ id }) => (
                <button
                  key={id}
                  onClick={() => scrollTo(id)}
                  className={`block w-full text-left text-xs py-1.5 px-2 rounded transition-colors ${
                    activeId === id
                      ? 'text-[${COLORS.primary}] bg-[${COLORS.primary}]/10'
                      : 'text-[${COLORS.onSurfaceVariant}] hover:text-white'
                  }`}
                >
                  {tocLabel(TOC_ITEMS.find((item) => item.id === id)!)}
                </button>
              ))}
            </nav>

            <div className="mt-8 pt-6 border-t border-[${COLORS.outline}]">
              <p className="text-xs text-[${COLORS.onSurfaceVariant}] mb-2">{t.haveAccount}</p>
              <Link
                to="/app/guide"
                className="text-xs text-[${COLORS.primary}] hover:underline"
              >
                {t.viewInApp}
              </Link>
            </div>
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 max-w-[800px]">
          <div className="mb-10">
            <h1 className="text-2xl font-bold text-white mb-2">{t.title}</h1>
            <p className="text-sm text-[${COLORS.onSurfaceVariant}]">{t.subtitle}</p>
          </div>
          <GuideContent />
        </main>
      </div>

      <Footer />
    </div>
  );
}
