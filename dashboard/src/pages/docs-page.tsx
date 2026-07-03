/**
 * Public docs page at /docs — full page with PublicNavbar + Footer.
 * Left sticky TOC on desktop, horizontal scrollable bar on mobile.
 * Active section tracked via IntersectionObserver.
 */
import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { PublicNavbar } from '../components/public-navbar';
import { Footer } from '../components/footer';
import { GuideContent } from '../components/guide-content';

const TOC_ITEMS = [
  { id: 'how-it-works', label: 'How It Works' },
  { id: 'returns', label: 'Expected Returns' },
  { id: 'quick-start', label: 'Quick Start' },
  { id: 'daily-ops', label: 'Daily Operations' },
  { id: 'parameters', label: 'Parameters' },
  { id: 'troubleshooting', label: 'Troubleshooting' },
  { id: 'emergency', label: 'Emergency Stop' },
  { id: 'glossary', label: 'Glossary' },
];

export function DocsPage() {
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

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <PublicNavbar />

      {/* Mobile TOC — horizontal scroll bar */}
      <div className="md:hidden sticky top-14 z-40 bg-bg/95 backdrop-blur border-b border-bg-border px-4 py-2 overflow-x-auto">
        <div className="flex gap-4 whitespace-nowrap">
          {TOC_ITEMS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => scrollTo(id)}
              className={`text-xs py-1 transition-colors min-h-touch ${
                activeId === id ? 'text-accent' : 'text-muted hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Main layout */}
      <div className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 pt-20 md:pt-24 pb-16 flex gap-10">

        {/* Desktop sidebar TOC */}
        <aside className="hidden md:block w-[200px] flex-shrink-0">
          <div className="sticky top-24">
            <p className="text-xs text-muted uppercase tracking-widest mb-4">On this page</p>
            <nav className="space-y-1">
              {TOC_ITEMS.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => scrollTo(id)}
                  className={`block w-full text-left text-xs py-1.5 px-2 rounded transition-colors min-h-touch ${
                    activeId === id
                      ? 'text-accent bg-accent/10'
                      : 'text-muted hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </nav>

            <div className="mt-8 pt-6 border-t border-bg-border">
              <p className="text-xs text-muted mb-2">Have an account?</p>
              <Link
                to="/app/guide"
                className="text-xs text-accent hover:underline"
              >
                View in app →
              </Link>
            </div>
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 max-w-[800px]">
          <div className="mb-10">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-1 h-5 bg-accent rounded-full" />
              <h1 className="text-2xl font-bold text-white">Operator Guide</h1>
            </div>
            <p className="text-sm text-muted">
              CashClaw SOPs — everything you need to run the market-making bot profitably.
            </p>
          </div>
          <GuideContent />
        </main>
      </div>

      <Footer />
    </div>
  );
}
