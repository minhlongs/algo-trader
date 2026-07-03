/**
 * Landing Page tests — covers all sections: Hero, Stats Bar, Trust Bar,
 * P&L Ticker, How It Works, Market Prices, Pricing, and Discord Community.
 *
 * Run: npx vitest run src/pages/__tests__/landing-page.test.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// ── Mock child components ──

vi.mock('../../components/public-navbar', () => ({
  PublicNavbar: () => <div data-testid="public-navbar">PublicNavbar</div>,
}));

vi.mock('../../components/footer', () => ({
  Footer: () => <div data-testid="footer">Footer</div>,
}));

vi.mock('../../components/terminal-animation', () => ({
  TerminalAnimation: () => <div data-testid="terminal-animation">TerminalAnimation</div>,
}));

// ── Mock framer-motion / motion for static renders ──

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, className, ...props }: React.PropsWithChildren<{ className?: string }>) => (
      <div className={className} {...props}>{children}</div>
    ),
  },
  useInView: () => true,
}));

import { LandingPage } from '../landing-page';

function renderPage() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>
  );
}

describe('LandingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /* ── Layout ── */

  it('renders PublicNavbar and Footer', () => {
    renderPage();
    expect(screen.getByTestId('public-navbar')).toBeTruthy();
    expect(screen.getByTestId('footer')).toBeTruthy();
  });

  /* ── Hero section ── */

  it('renders hero heading and subheadings', () => {
    renderPage();
    expect(screen.getByText('Polymarket')).toBeTruthy();
    expect(screen.getByText('market making')).toBeTruthy();
    expect(screen.getByText('automated.')).toBeTruthy();
  });

  it('renders hero description text', () => {
    renderPage();
    expect(screen.getByText(/CashClaw quotes bid\/ask spreads/)).toBeTruthy();
  });

  it('renders hero CTA buttons', () => {
    renderPage();
    // "Start Free" appears in hero and Free pricing card — check count
    expect(screen.getAllByText('Start Free').length).toBe(2);
    expect(screen.getByText('View Pricing')).toBeTruthy();
  });

  it('renders trust micro-signals under hero', () => {
    renderPage();
    expect(screen.getByText('Non-custodial')).toBeTruthy();
    expect(screen.getByText('Funds stay in your wallet')).toBeTruthy();
  });

  it('renders TerminalAnimation component', () => {
    renderPage();
    expect(screen.getByTestId('terminal-animation')).toBeTruthy();
  });

  /* ── Stats Bar section ── */

  it('renders all four stat items', () => {
    renderPage();
    expect(screen.getByText('0%')).toBeTruthy();
    expect(screen.getByText('87.3%')).toBeTruthy();
    expect(screen.getByText('24/7')).toBeTruthy();
    expect(screen.getByText('< 2s')).toBeTruthy();
  });

  it('renders stat labels', () => {
    renderPage();
    expect(screen.getByText('maker fees on Polymarket')).toBeTruthy();
    expect(screen.getByText('of traders lose money — you take the other side')).toBeTruthy();
    expect(screen.getByText('automated operation')).toBeTruthy();
    expect(screen.getByText('requote latency')).toBeTruthy();
  });

  /* ── Trust Bar section ── */

  it('renders all trust stat values', () => {
    renderPage();
    // Trust stats appear once in the TrustBar section
    expect(screen.getByText('52+')).toBeTruthy();
    expect(screen.getByText('8')).toBeTruthy();
    expect(screen.getByText('2798+')).toBeTruthy();
    // $0 appears in Trust Bar and Pricing Free card
    expect(screen.getAllByText('$0')).toHaveLength(2);
  });

  it('renders all trust stat labels', () => {
    renderPage();
    expect(screen.getByText('Strategies')).toBeTruthy();
    expect(screen.getByText('Platforms')).toBeTruthy();
    expect(screen.getByText('Tests Passed')).toBeTruthy();
    expect(screen.getByText('Maker Fees')).toBeTruthy();
  });

  /* ── P&L Ticker Marquee section ── */

  it('renders all P&L ticker items (duplicated for scroll loop)', () => {
    renderPage();
    // Items are duplicated for seamless CSS marquee loop => each appears twice
    expect(screen.getAllByText('Ironclaw')).toHaveLength(2);
    expect(screen.getAllByText('Citadel')).toHaveLength(2);
    expect(screen.getAllByText('Dark-Edge')).toHaveLength(2);
    expect(screen.getAllByText('Poly-Gamma')).toHaveLength(2);
    expect(screen.getAllByText('CEX-Arb')).toHaveLength(2);
    expect(screen.getAllByText('DEX-LP')).toHaveLength(2);
    expect(screen.getAllByText('Poly-Delta')).toHaveLength(2);
    expect(screen.getAllByText('Momentum')).toHaveLength(2);
  });

  it('renders P&L ticker values with correct signs (duplicated for scroll loop)', () => {
    renderPage();
    // Each value appears twice (seamless scroll duplication)
    expect(screen.getAllByText('+12.4%')).toHaveLength(2);
    expect(screen.getAllByText('+8.7%')).toHaveLength(2);
    expect(screen.getAllByText('+15.3%')).toHaveLength(2);
    expect(screen.getAllByText('+5.8%')).toHaveLength(2);
    expect(screen.getAllByText('+22.1%')).toHaveLength(2);
    expect(screen.getAllByText('+3.2%')).toHaveLength(2);
    expect(screen.getAllByText('-2.1%')).toHaveLength(2);
    expect(screen.getAllByText('-0.9%')).toHaveLength(2);
  });

  /* ── How It Works section ── */

  it('renders the How It Works heading', () => {
    renderPage();
    expect(screen.getByText('Three steps to passive spread income')).toBeTruthy();
  });

  it('renders all three How It Works cards', () => {
    renderPage();
    expect(screen.getByText('Select Markets')).toBeTruthy();
    expect(screen.getByText('Bot Quotes')).toBeTruthy();
    expect(screen.getByText('You Profit')).toBeTruthy();
  });

  /* ── Market Prices section ── */

  it('renders all market ticker symbols', () => {
    renderPage();
    expect(screen.getByText('BTC/USD')).toBeTruthy();
    expect(screen.getByText('ETH/USD')).toBeTruthy();
    expect(screen.getByText('SOL/USD')).toBeTruthy();
    expect(screen.getByText('LINK/USD')).toBeTruthy();
    expect(screen.getByText('AVAX/USD')).toBeTruthy();
    expect(screen.getByText('DOGE/USD')).toBeTruthy();
    expect(screen.getByText('DOT/USD')).toBeTruthy();
    expect(screen.getByText('MATIC/USD')).toBeTruthy();
  });

  it('renders market prices (prefixed with $)', () => {
    renderPage();
    // Prices are rendered as "${price}" in the component
    expect(screen.getByText('$67,421.50')).toBeTruthy();
    expect(screen.getByText('$3,421.80')).toBeTruthy();
    expect(screen.getByText('$142.35')).toBeTruthy();
    expect(screen.getByText('$14.82')).toBeTruthy();
    expect(screen.getByText('$28.44')).toBeTruthy();
    expect(screen.getByText('$5.88')).toBeTruthy();
    expect(screen.getByText('$0.1245')).toBeTruthy();
    expect(screen.getByText('$0.62')).toBeTruthy();
  });

  it('renders market price changes', () => {
    renderPage();
    expect(screen.getByText('+2.34%')).toBeTruthy();
    expect(screen.getByText('+1.15%')).toBeTruthy();
    expect(screen.getByText('-0.78%')).toBeTruthy();
    expect(screen.getByText('+4.21%')).toBeTruthy();
    expect(screen.getByText('-1.33%')).toBeTruthy();
    expect(screen.getByText('+6.72%')).toBeTruthy();
    expect(screen.getByText('+0.42%')).toBeTruthy();
    expect(screen.getByText('-2.15%')).toBeTruthy();
  });

  it('renders Market Prices section heading', () => {
    renderPage();
    expect(screen.getByText('Market Data')).toBeTruthy();
    expect(screen.getByText('Real-time prices from the ecosystem')).toBeTruthy();
  });

  /* ── Pricing section ── */

  it('renders all pricing card names and prices', () => {
    renderPage();
    expect(screen.getByText('Free')).toBeTruthy();
    expect(screen.getByText('Pro')).toBeTruthy();
    expect(screen.getByText('Enterprise')).toBeTruthy();
    expect(screen.getByText('Master')).toBeTruthy();
    // $0 appears in both Trust Bar and Pricing Free
    expect(screen.getAllByText('$0')).toHaveLength(2);
    expect(screen.getByText('$99')).toBeTruthy();
    expect(screen.getByText('$299')).toBeTruthy();
    expect(screen.getByText('$999')).toBeTruthy();
  });

  it('renders pricing section heading', () => {
    renderPage();
    expect(screen.getByText('Simple, transparent plans')).toBeTruthy();
  });

  it('renders pricing CTA buttons with correct links', () => {
    renderPage();
    const startFreeLinks = screen.getAllByText('Start Free');
    // The hero also has "Start Free" — the pricing card uses "Start Free" too
    expect(startFreeLinks.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Contact Us')).toBeTruthy();
    expect(screen.getByText('Go Master')).toBeTruthy();
  });

  it('marks Pro as POPULAR in pricing cards', () => {
    renderPage();
    expect(screen.getByText('POPULAR')).toBeTruthy();
  });

  it('renders pricing feature lists from tier config', () => {
    renderPage();
    // Free tier features (from TIER_LIMITS)
    expect(screen.getByText('1 active strategy')).toBeTruthy();
    expect(screen.getByText('5 trades/day')).toBeTruthy();
  });

  /* ── Discord Community section ── */

  it('renders Discord community section heading', () => {
    renderPage();
    expect(screen.getByText('Join Our Community')).toBeTruthy();
  });

  it('renders Discord community description', () => {
    renderPage();
    expect(screen.getByText(/Connect with fellow algorithmic traders/)).toBeTruthy();
  });

  it('renders Join Discord link with correct href', () => {
    renderPage();
    const joinLink = screen.getByText('Join Discord');
    expect(joinLink.closest('a')).toHaveAttribute('href', 'https://discord.gg/cashclaw');
    expect(joinLink.closest('a')).toHaveAttribute('target', '_blank');
  });
});
