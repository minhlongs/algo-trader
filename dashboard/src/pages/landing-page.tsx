/**
 * CashClaw Landing — Quant Elite design system.
 * Polymarket automated market making platform.
 * Geist sans for body, JetBrains Mono for data. Phosphor icons. Framer Motion.
 */
import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useInView } from 'motion/react';
import {
  MagnifyingGlass,
  ChartLine,
  CurrencyDollar,
  ShieldCheck,
  Clock,
  Lightning,
  CheckCircle,
  ArrowRight,
  Star,
  Globe,
} from '@phosphor-icons/react';
import { PublicNavbar } from '../components/public-navbar';
import { Footer } from '../components/footer';
import { TerminalAnimation } from '../components/terminal-animation';
import { TIER_LIMITS } from '../lib/tier-config';

function FadeIn({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      {children}
    </motion.div>
  );
}

const HOW_ITEMS = [
  {
    title: 'Select Markets',
    body: 'The bot scans Polymarket for high-liquidity questions with favourable spreads and selects the top candidates automatically.',
    icon: MagnifyingGlass,
    accent: '#F59E0B',
  },
  {
    title: 'Bot Quotes',
    body: 'CashClaw posts bid and ask orders around the fair-value mid-price, earning the spread on every matched trade.',
    icon: ChartLine,
    accent: '#F59E0B',
  },
  {
    title: 'You Profit',
    body: 'Filled orders generate spread income. Safety limits cap inventory risk. Funds stay in your Polymarket wallet.',
    icon: CurrencyDollar,
    accent: '#00E676',
  },
];

const STATS = [
  { value: '0%', label: 'maker fees on Polymarket', icon: Star },
  { value: '87.3%', label: 'of traders lose money — you take the other side', icon: ChartLine },
  { value: '24/7', label: 'automated operation', icon: Clock },
  { value: '< 2s', label: 'requote latency', icon: Lightning },
];

// i18n placeholder — replace `t` with actual translation function when i18n is wired
const t = (s: string) => s;

const TRUST_STATS = [
  { value: '52+', label: t('Strategies'), icon: ChartLine },
  { value: '8', label: t('Platforms'), icon: Globe },
  { value: '2798+', label: t('Tests Passed'), icon: CheckCircle },
  { value: '$0', label: t('Maker Fees'), icon: Star },
] as const;

const TICKER_ITEMS = [
  { label: 'Ironclaw', value: '+12.4%', up: true },
  { label: 'Citadel', value: '+8.7%', up: true },
  { label: 'Dark-Edge', value: '-2.1%', up: false },
  { label: 'Poly-Gamma', value: '+15.3%', up: true },
  { label: 'CEX-Arb', value: '+5.8%', up: true },
  { label: 'DEX-LP', value: '-0.9%', up: false },
  { label: 'Poly-Delta', value: '+22.1%', up: true },
  { label: 'Momentum', value: '+3.2%', up: true },
];

const MARKET_TICKERS = [
  { symbol: 'BTC/USD', price: '67,421.50', change: '+2.34%', up: true },
  { symbol: 'ETH/USD', price: '3,421.80', change: '+1.15%', up: true },
  { symbol: 'SOL/USD', price: '142.35', change: '-0.78%', up: false },
  { symbol: 'LINK/USD', price: '14.82', change: '+4.21%', up: true },
  { symbol: 'AVAX/USD', price: '28.44', change: '-1.33%', up: false },
  { symbol: 'DOGE/USD', price: '0.1245', change: '+6.72%', up: true },
  { symbol: 'DOT/USD', price: '5.88', change: '+0.42%', up: true },
  { symbol: 'MATIC/USD', price: '0.62', change: '-2.15%', up: false },
];

const PRICING_CARDS = [
  {
    name: 'Free', price: '$0', sub: 'forever', cta: 'Start Free', href: '/signup?tier=free', highlight: false,
    features: [
      `${TIER_LIMITS.free.activeStrategies} active strategy`,
      `${TIER_LIMITS.free.tradesPerDay} trades/day`,
      `${TIER_LIMITS.free.dailyLossCap} daily loss cap`,
      `${TIER_LIMITS.free.maxPosition} max position`,
    ],
  },
  {
    name: 'Pro', price: '$99', sub: '/month', cta: 'Start Pro', href: '/signup?tier=pro', highlight: true,
    features: [
      `${TIER_LIMITS.pro.activeStrategies} active strategies`,
      `${TIER_LIMITS.pro.tradesPerDay} trades/day`,
      `${TIER_LIMITS.pro.dailyLossCap} daily loss cap`,
      `${TIER_LIMITS.pro.maxPosition} max position`,
    ],
  },
  {
    name: 'Enterprise', price: '$299', sub: '/month', cta: 'Contact Us', href: '/signup?tier=enterprise', highlight: false,
    features: [
      `${TIER_LIMITS.enterprise.activeStrategies} strategies`,
      `${TIER_LIMITS.enterprise.tradesPerDay} trades/day`,
      `${TIER_LIMITS.enterprise.dailyLossCap} daily loss cap`,
      `${TIER_LIMITS.enterprise.maxPosition} max position`,
    ],
  },
  {
    name: 'Master', price: '$999', sub: '/month', cta: 'Go Master', href: '/signup?tier=master', highlight: false,
    features: [
      `${t('All strategies included')}`,
      `${t('Unlimited trades')}`,
      `${t('Custom loss cap')}`,
      `${t('Unlimited position')}`,
    ],
  },
];

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-accent text-xs font-medium uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
      <span className="w-1 h-1 rounded-full bg-accent" />
      {children}
    </p>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-screen bg-bg text-white font-sans" style={{
      backgroundImage: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(0,200,232,0.06) 0%, transparent 60%), radial-gradient(circle at 1px 1px, rgba(30,38,64,0.5) 1px, transparent 0)',
      backgroundSize: '100% 100%, 32px 32px',
    }}>
      <PublicNavbar />

      {/* ── Hero ── */}
      <section className="relative pt-28 sm:pt-36 pb-16 sm:pb-24 px-4 sm:px-6 max-w-6xl mx-auto overflow-hidden">
        {/* Ambient glow behind hero */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full blur-[120px] opacity-10 pointer-events-none"
          style={{ background: 'radial-gradient(circle, #F59E0B, transparent)' }} />

        <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className="flex flex-col gap-6">
            <FadeIn>
              <SectionEyebrow>Prediction Market Automation</SectionEyebrow>
            </FadeIn>
            <FadeIn delay={0.1}>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.08] tracking-[-0.02em] text-white">
                Polymarket
                <br />
                <span className="text-accent">market making</span>
                <br />
                <span className="text-muted">automated.</span>
              </h1>
            </FadeIn>
            <FadeIn delay={0.2}>
              <p className="text-muted text-base sm:text-lg leading-relaxed max-w-lg text-balance">
                CashClaw quotes bid/ask spreads on Polymarket 24/7.
                You earn the spread. Safety limits protect your capital.
                No manual trading required.
              </p>
            </FadeIn>
            <FadeIn delay={0.3}>
              <div className="flex flex-wrap gap-3">
                <Link
                  to="/signup"
                  className="bg-accent text-bg font-semibold px-6 py-3 rounded-lg hover:bg-accent/80 transition-colors text-sm inline-flex items-center gap-2 group"
                >
                  Start Free
                  <ArrowRight weight="bold" className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </Link>
                <Link
                  to="/pricing"
                  className="border border-bg-border text-muted hover:text-white hover:border-accent/50 font-medium px-6 py-3 rounded-lg transition-colors text-sm"
                >
                  View Pricing
                </Link>
              </div>
            </FadeIn>
            {/* Trust micro-signals */}
            <FadeIn delay={0.4}>
              <div className="flex flex-wrap items-center gap-4 pt-2">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck weight="fill" className="w-4 h-4 text-profit" />
                  <span className="text-muted text-xs">Non-custodial</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle weight="fill" className="w-4 h-4 text-profit" />
                  <span className="text-muted text-xs">Funds stay in your wallet</span>
                </div>
              </div>
            </FadeIn>
          </div>

          <FadeIn delay={0.2}>
            <div className="bg-bg-surface border border-bg-border rounded-xl overflow-hidden shadow-[0_0_40px_rgba(0,200,232,0.04)]">
              <TerminalAnimation />
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── Stats Bar ── */}
      <FadeIn>
        <section className="border-y border-bg-border bg-bg-surface/40 backdrop-blur-sm py-8 px-4 sm:px-6">
          <div className="max-w-6xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-8">
            {STATS.map(({ value, label, icon: Icon }) => (
              <div key={label} className="text-center sm:text-left">
                <div className="flex items-center justify-center sm:justify-start gap-1.5 mb-1">
                  <Icon weight="bold" className="w-4 h-4 text-accent" />
                  <p className="text-accent text-xl sm:text-2xl font-bold tabular-nums">{value}</p>
                </div>
                <p className="text-muted text-xs leading-relaxed">{label}</p>
              </div>
            ))}
          </div>
        </section>
      </FadeIn>

      {/* ── Trust Bar ── */}
      <FadeIn>
        <section className="py-8 px-4 sm:px-6 bg-gradient-to-r from-bg-surface/20 via-bg-surface/40 to-bg-surface/20 border-b border-bg-border">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-8">
              {TRUST_STATS.map(({ value, label, icon: Icon }) => (
                <div key={label} className="flex flex-col items-center gap-1.5 text-center">
                  <div className="flex items-center gap-2">
                    <Icon weight="bold" className="w-5 h-5 text-accent" />
                    <span className="text-accent text-2xl sm:text-3xl font-bold tabular-nums">{value}</span>
                  </div>
                  <span className="text-muted text-xs">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </FadeIn>

      {/* ── P&L Ticker Marquee ── */}
      <section className="relative overflow-hidden py-5 border-b border-bg-border bg-bg-surface/30">
        <div className="flex whitespace-nowrap gap-0 ticker-track">
          {/* Duplicated for seamless loop */}
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
            <span key={i} className="inline-flex items-center gap-2 mx-4">
              <span className="text-muted text-xs font-mono uppercase tracking-wider">{item.label}</span>
              <span className={`text-sm font-bold tabular-nums font-mono ${item.up ? 'text-profit' : 'text-loss'}`}>
                {item.value}
              </span>
            </span>
          ))}
        </div>
        <style>{`
          .ticker-track {
            animation: ticker 30s linear infinite;
            width: max-content;
          }
          @media (prefers-reduced-motion: reduce) {
            .ticker-track { animation: none; }
          }
        `}</style>
      </section>

      {/* ── How It Works ── */}
      <section className="py-20 sm:py-28 px-4 sm:px-6 max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <FadeIn>
            <SectionEyebrow>How It Works</SectionEyebrow>
          </FadeIn>
          <FadeIn delay={0.1}>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white tracking-[-0.01em]">
              Three steps to passive spread income
            </h2>
          </FadeIn>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {HOW_ITEMS.map(({ title, body, icon: Icon, accent }, i) => (
            <FadeIn key={title} delay={i * 0.1}>
              <div className="group bg-bg-surface border border-bg-border rounded-xl p-6 sm:p-8 hover:border-accent/30 transition-all duration-300 hover:shadow-[0_0_30px_rgba(0,200,232,0.03)] flex flex-col gap-4">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${accent}14` }}>
                  <Icon weight="bold" className="w-5 h-5" style={{ color: accent }} />
                </div>
                <div>
                  <h3 className="text-white font-semibold mb-2 text-base">{title}</h3>
                  <p className="text-muted text-sm leading-relaxed">{body}</p>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ── Market Prices ── */}
      <section className="py-20 sm:py-28 px-4 sm:px-6 max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <FadeIn>
            <SectionEyebrow>{t('Market Data')}</SectionEyebrow>
          </FadeIn>
          <FadeIn delay={0.1}>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white tracking-[-0.01em]">
              {t('Real-time prices from the ecosystem')}
            </h2>
          </FadeIn>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {MARKET_TICKERS.map(({ symbol, price, change, up }, i) => (
            <FadeIn key={symbol} delay={i * 0.05}>
              <div className="bg-bg-surface border border-bg-border rounded-lg p-4 flex flex-col gap-1.5 hover:border-accent/20 transition-colors">
                <p className="text-muted text-[10px] font-mono uppercase tracking-wider">{symbol}</p>
                <p className="text-white text-base font-bold tabular-nums font-mono">${price}</p>
                <p className={`text-xs font-semibold tabular-nums font-mono ${up ? 'text-profit' : 'text-loss'}`}>
                  {change}
                </p>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="py-20 sm:py-28 px-4 sm:px-6 max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <FadeIn>
            <SectionEyebrow>Pricing</SectionEyebrow>
          </FadeIn>
          <FadeIn delay={0.1}>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white tracking-[-0.01em]">
              Simple, transparent plans
            </h2>
          </FadeIn>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
          {PRICING_CARDS.map(({ name, price, sub, cta, href, highlight, features }, i) => (
            <FadeIn key={name} delay={i * 0.1}>
              <div
                className={`relative rounded-xl p-6 sm:p-8 flex flex-col gap-5 transition-all duration-300 ${
                  highlight
                    ? 'bg-bg-surface border-2 border-accent shadow-[0_0_30px_rgba(0,200,232,0.08)]'
                    : 'bg-bg-surface border border-bg-border hover:border-accent/20'
                }`}
              >
                {highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-bg text-[11px] font-bold px-3 py-0.5 rounded-full tracking-wide">
                    POPULAR
                  </span>
                )}
                <div>
                  <p className="text-muted text-xs font-medium uppercase tracking-wider mb-1">{name}</p>
                  <p className="text-white text-4xl font-bold tracking-tight tabular-nums">
                    {price}
                    <span className="text-muted text-sm font-normal font-sans ml-1">{sub}</span>
                  </p>
                </div>
                <ul className="space-y-3 flex-1">
                  {features.map((f) => (
                    <li key={f} className="flex items-center gap-2.5 text-sm text-muted">
                      <CheckCircle weight="fill" className="w-4 h-4 text-accent flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  to={href}
                  className={`text-center text-sm font-semibold px-5 py-3 rounded-lg transition-all duration-200 ${
                    highlight
                      ? 'bg-accent text-bg hover:bg-accent/80 shadow-[0_4px_20px_rgba(0,200,232,0.2)]'
                      : 'border border-bg-border text-muted hover:text-white hover:border-accent/40'
                  }`}
                >
                  {cta}
                </Link>
              </div>
            </FadeIn>
          ))}
        </div>
        <FadeIn delay={0.2}>
          <p className="text-center mt-8">
            <Link to="/pricing" className="text-accent text-sm hover:underline inline-flex items-center gap-1">
              See full pricing details <ArrowRight className="w-3 h-3" />
            </Link>
          </p>
        </FadeIn>
      </section>

      {/* ── Discord Community ── */}
      <section className="py-20 sm:py-28 px-4 sm:px-6 border-t border-bg-border bg-bg-surface/20">
        <div className="max-w-3xl mx-auto text-center">
          <FadeIn>
            <SectionEyebrow>Community</SectionEyebrow>
          </FadeIn>
          <FadeIn delay={0.1}>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white tracking-[-0.01em] mb-4">
              Join Our Community
            </h2>
          </FadeIn>
          <FadeIn delay={0.2}>
            <p className="text-muted text-base sm:text-lg leading-relaxed max-w-lg mx-auto mb-8 text-balance">
              Connect with fellow algorithmic traders. Share strategies, discuss market opportunities,
              and get early access to new features before anyone else.
            </p>
          </FadeIn>
          <FadeIn delay={0.3}>
            <a
              href="https://discord.gg/cashclaw"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-accent text-bg font-semibold px-6 py-3 rounded-lg hover:bg-accent/80 transition-colors text-sm group"
            >
              Join Discord
              <ArrowRight weight="bold" className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </a>
          </FadeIn>
        </div>
      </section>

      <Footer />
    </div>
  );
}
