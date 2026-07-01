/**
 * Sticky public navbar — Quant Elite design.
 * Phosphor icons. Blurs on scroll. Mobile hamburger menu.
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { X, List } from '@phosphor-icons/react';

export function PublicNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const linkClass = 'text-muted hover:text-white text-sm transition-colors';
  const ctaClass = 'bg-accent text-bg text-sm font-semibold px-4 py-1.5 rounded-lg hover:bg-accent/80 transition-colors';

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-200 ${
      scrolled ? 'bg-bg/90 backdrop-blur-md border-b border-bg-border' : 'bg-transparent'
    }`}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link to="/" className="text-accent font-bold text-lg tracking-tight">
          CashClaw
        </Link>

        <nav className="hidden md:flex items-center gap-6">
          <Link to="/pricing" className={linkClass}>Pricing</Link>
          <Link to="/docs" className={linkClass}>Docs</Link>
          <Link to="/login" className={linkClass}>Login</Link>
          <Link to="/signup" className={ctaClass}>Get Started</Link>
        </nav>

        <button
          className="md:hidden text-muted hover:text-white p-1 min-h-touch min-w-touch flex items-center justify-center"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {menuOpen ? <X weight="bold" className="w-6 h-6" /> : <List weight="bold" className="w-6 h-6" />}
        </button>
      </div>

      {menuOpen && (
        <div className="md:hidden bg-bg-surface border-b border-bg-border px-4 py-4 flex flex-col gap-3">
          <Link to="/pricing" onClick={() => setMenuOpen(false)} className={linkClass}>Pricing</Link>
          <Link to="/docs" onClick={() => setMenuOpen(false)} className={linkClass}>Docs</Link>
          <Link to="/login" onClick={() => setMenuOpen(false)} className={linkClass}>Login</Link>
          <Link to="/signup" onClick={() => setMenuOpen(false)} className={`${ctaClass} text-center`}>Get Started</Link>
        </div>
      )}
    </header>
  );
}
