/**
 * CashClaw Landing — Stitch dark fintech bilingual VN+EN.
 * Polymarket automated market making platform.
 */
import { useRef, useState } from 'react';
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
} from '@phosphor-icons/react';
import { PublicNavbar } from '../components/public-navbar';
import { Footer } from '../components/footer';
import { TerminalAnimation } from '../components/terminal-animation';
import { TIER_LIMITS } from '../lib/tier-config';
import { COLORS } from '../lib/stitch-design-tokens';

type Lang = 'en' | 'vi';

const COPY: Record<Lang, Record<string, string>> = {
  en: {
    langToggle: 'Tiếng Việt',
    title: 'Polymarket',
    titleAccent: 'market making',
    titleMuted: 'automated.',
    subtitle: 'CashClaw quotes bid/ask spreads on Polymarket 24/7. You earn the spread. Safety limits protect your capital. No manual trading required.',
    cta: 'Start Free',
    ctaSecondary: 'View Pricing',
    nonCustodial: 'Non-custodial',
    fundsWallet: 'Funds stay in your wallet',
    eyebrow: 'Prediction Market Automation',
    howTitle: 'Three steps to passive spread income',
    howEyebrow: 'How It Works',
    pricingEyebrow: 'Pricing',
    pricingTitle: 'Simple, transparent plans',
    seeFullPricing: 'See full pricing details',
    statLabel1: 'maker fees on Polymarket',
    statLabel2: 'of traders lose money — you take the other side',
    statLabel3: 'automated operation',
    statLabel4: 'requote latency',
    how1Title: 'Select Markets',
    how1Body: 'The bot scans Polymarket for high-liquidity questions with favourable spreads and selects the top candidates automatically.',
    how2Title: 'Bot Quotes',
    how2Body: 'CashClaw posts bid and ask orders around the fair-value mid-price, earning the spread on every matched trade.',
    how3Title: 'You Profit',
    how3Body: 'Filled orders generate spread income. Safety limits cap inventory risk. Funds stay in your Polymarket wallet.',
    popular: 'POPULAR',
    featureStrategies: 'active strategies',
    featureTrades: 'trades/day',
    featureLossCap: 'daily loss cap',
    featureMaxPos: 'max position',
    freeName: 'Free',
    freePrice: '$0',
    freeSub: 'forever',
    proName: 'Pro',
    proPrice: '$49',
    proSub: '/month',
    enterpriseName: 'Enterprise',
    enterprisePrice: '$199',
    enterpriseSub: '/month',
    enterpriseCta: 'Contact Us',
  },
  vi: {
    langToggle: 'English',
    title: 'Polymarket',
    titleAccent: 'tạo thị trường',
    titleMuted: 'tự động.',
    subtitle: 'CashClaw đưa giá bid/ask trên Polymarket 24/7. Bạn kiếm spread. Giới hạn an toàn bảo vệ vốn. Không cần giao dịch thủ công.',
    cta: 'Bắt đầu miễn phí',
    ctaSecondary: 'Xem giá',
    nonCustodial: 'Phi lưu ký',
    fundsWallet: 'Vốn giữ trong ví của bạn',
    eyebrow: 'Tự Động Thị Trường Dự Đoán',
    howTitle: 'Ba bước đến thu nhập thụ động từ spread',
    howEyebrow: 'Cách Hoạt Động',
    pricingEyebrow: 'Bảng Giá',
    pricingTitle: 'Kế hoạch đơn giản, minh bạch',
    seeFullPricing: 'Xem chi tiết bảng giá',
    statLabel1: 'phí maker trên Polymarket',
    statLabel2: 'trader thua tiền — bạn ở phía kiếm',
    statLabel3: 'hoạt động tự động 24/7',
    statLabel4: 'độ trễ đặt giá',
    how1Title: 'Chọn thị trường',
    how1Body: 'Bot quét Polymarket tìm câu hỏi thanh khoản cao với spread tốt và tự chọn ứng viên hàng đầu.',
    how2Title: 'Bot đưa giá',
    how2Body: 'CashClaw đặt lệnh mua/bán quanh giá trung bình giá trị hợp lý, kiếm spread trên mỗi giao dịch khớp.',
    how3Title: 'Bạn thu lợi',
    how3Body: 'Lệnh khớp tạo thu nhập spread. Giới hạn an toàn kiểm soát rủi ro tồn kho. Vốn giữ trong ví Polymarket.',
    popular: 'PHỔ BIẾN',
    featureStrategies: 'chiến lược',
    featureTrades: 'giao dịch/ngày',
    featureLossCap: 'giới hạn lỗ ngày',
    featureMaxPos: 'vị thế tối đa',
    freeName: 'Miễn phí',
    freePrice: '$0',
    freeSub: 'mãi mãi',
    proName: 'Pro',
    proPrice: '$49',
    proSub: '/tháng',
    enterpriseName: 'Doanh nghiệp',
    enterprisePrice: '$199',
    enterpriseSub: '/tháng',
    enterpriseCta: 'Liên hệ chúng tôi',
  },
};

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
    titleKey: 'how1Title',
    bodyKey: 'how1Body',
    icon: MagnifyingGlass,
    accent: COLORS.profit,
  },
  {
    titleKey: 'how2Title',
    bodyKey: 'how2Body',
    icon: ChartLine,
    accent: COLORS.profit,
  },
  {
    titleKey: 'how3Title',
    bodyKey: 'how3Body',
    icon: CurrencyDollar,
    accent: COLORS.primaryContainer,
  },
];

const STATS = [
  { value: '0%', labelKey: 'statLabel1', icon: Star },
  { value: '87.3%', labelKey: 'statLabel2', icon: ChartLine },
  { value: '24/7', labelKey: 'statLabel3', icon: Clock },
  { value: '< 2s', labelKey: 'statLabel4', icon: Lightning },
];

const PRICING_CARDS = [
  {
    nameKey: 'freeName',
    priceKey: 'freePrice',
    subKey: 'freeSub',
    ctaKey: 'cta',
    href: '/signup?tier=free',
    highlight: false,
    features: [
      `${TIER_LIMITS.free.activeStrategies} ${COPY.en.featureStrategies}`,
      `${TIER_LIMITS.free.tradesPerDay} ${COPY.en.featureTrades}`,
      `${TIER_LIMITS.free.dailyLossCap} ${COPY.en.featureLossCap}`,
      `${TIER_LIMITS.free.maxPosition} ${COPY.en.featureMaxPos}`,
    ],
  },
  {
    nameKey: 'proName',
    priceKey: 'proPrice',
    subKey: 'proSub',
    ctaKey: 'cta',
    href: '/signup?tier=pro',
    highlight: true,
    features: [
      `${TIER_LIMITS.pro.activeStrategies} ${COPY.en.featureStrategies}`,
      `${TIER_LIMITS.pro.tradesPerDay} ${COPY.en.featureTrades}`,
      `${TIER_LIMITS.pro.dailyLossCap} ${COPY.en.featureLossCap}`,
      `${TIER_LIMITS.pro.maxPosition} ${COPY.en.featureMaxPos}`,
    ],
  },
  {
    nameKey: 'enterpriseName',
    priceKey: 'enterprisePrice',
    subKey: 'enterpriseSub',
    ctaKey: 'enterpriseCta',
    href: '/signup?tier=enterprise',
    highlight: false,
    features: [
      `${TIER_LIMITS.enterprise.activeStrategies} ${COPY.en.featureStrategies}`,
      `${TIER_LIMITS.enterprise.tradesPerDay} ${COPY.en.featureTrades}`,
      `${TIER_LIMITS.enterprise.dailyLossCap} ${COPY.en.featureLossCap}`,
      `${TIER_LIMITS.enterprise.maxPosition} ${COPY.en.featureMaxPos}`,
    ],
  },
];

function SectionEyebrow({ children, lang }: { children: React.ReactNode; lang: Lang }) {
  const eyebrowLabel = lang === 'en' ? (children as string) : (children as keyof typeof COPY.vi ? COPY.vi[children as string] : children);
  return (
    <p
      className="text-xs font-medium uppercase tracking-[0.2em] mb-4 flex items-center gap-2"
      style={{ color: COLORS.primary, letterSpacing: '0.2em' }}
    >
      <span className="w-1 h-1 rounded-full" style={{ backgroundColor: COLORS.primary }} />
      {eyebrowLabel}
    </p>
  );
}

export function LandingPage() {
  const [lang, setLang] = useState<Lang>('en');
  const t = COPY[lang];
  const langLabel = lang === 'en' ? COPY.vi.langToggle : COPY.en.langToggle;

  return (
    <div
      className="min-h-screen font-sans"
      style={{
        backgroundColor: COLORS.bg,
        color: COLORS.onSurface,
        backgroundImage: `radial-gradient(ellipse 80% 60% at 50% -10%, ${COLORS.primary}0f 0%, transparent 60%), radial-gradient(circle at 1px 1px, ${COLORS.surfaceHigh}80 1px, transparent 0)`,
        backgroundSize: '100% 100%, 32px 32px',
      }}
    >
      {/* Language Toggle */}
      <div className="fixed top-4 right-4 z-50">
        <button
          onClick={() => setLang(lang === 'en' ? 'vi' : 'en')}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors"
          style={{
            backgroundColor: COLORS.surface,
            border: `1px solid ${COLORS.outline}`,
            color: COLORS.onSurfaceVariant,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
          </svg>
          {langLabel}
        </button>
      </div>

      <PublicNavbar />

      {/* ── Hero ── */}
      <section className="relative pt-28 sm:pt-36 pb-16 sm:pb-24 px-4 sm:px-6 max-w-6xl mx-auto overflow-hidden">
        {/* Ambient glow behind hero */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full blur-[120px] opacity-10 pointer-events-none"
          style={{ background: `radial-gradient(circle, ${COLORS.primary}, transparent)` }}
        />

        <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className="flex flex-col gap-6">
            <FadeIn>
              <SectionEyebrow lang={lang}>{t.eyebrow}</SectionEyebrow>
            </FadeIn>
            <FadeIn delay={0.1}>
              <h1
                className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.08] tracking-[-0.02em]"
                style={{ color: COLORS.onSurface }}
              >
                {t.title}
                <br />
                <span style={{ color: COLORS.primary }}>{t.titleAccent}</span>
                <br />
                <span style={{ color: COLORS.onSurfaceVariant }}>{t.titleMuted}</span>
              </h1>
            </FadeIn>
            <FadeIn delay={0.2}>
              <p
                className="text-base sm:text-lg leading-relaxed max-w-lg text-balance"
                style={{ color: COLORS.onSurfaceVariant }}
              >
                {t.subtitle}
              </p>
            </FadeIn>
            <FadeIn delay={0.3}>
              <div className="flex flex-wrap gap-3">
                <Link
                  to="/signup"
                  className="font-semibold px-6 py-3 rounded-lg transition-colors text-sm inline-flex items-center gap-2 group"
                  style={{
                    backgroundColor: COLORS.primaryContainer,
                    color: COLORS.primaryContainer,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                >
                  {t.cta}
                  <ArrowRight weight="bold" className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </Link>
                <Link
                  to="/pricing"
                  className="font-medium px-6 py-3 rounded-lg transition-colors text-sm"
                  style={{
                    border: `1px solid ${COLORS.outline}`,
                    color: COLORS.onSurfaceVariant,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = COLORS.onSurface;
                    e.currentTarget.style.borderColor = `${COLORS.primary}80`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = COLORS.onSurfaceVariant;
                    e.currentTarget.style.borderColor = COLORS.outline;
                  }}
                >
                  {t.ctaSecondary}
                </Link>
              </div>
            </FadeIn>
            {/* Trust micro-signals */}
            <FadeIn delay={0.4}>
              <div className="flex flex-wrap items-center gap-4 pt-2">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck weight="fill" className="w-4 h-4" style={{ color: COLORS.profit }} />
                  <span className="text-xs" style={{ color: COLORS.onSurfaceVariant }}>{t.nonCustodial}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle weight="fill" className="w-4 h-4" style={{ color: COLORS.profit }} />
                  <span className="text-xs" style={{ color: COLORS.onSurfaceVariant }}>{t.fundsWallet}</span>
                </div>
              </div>
            </FadeIn>
          </div>

          <FadeIn delay={0.2}>
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                backgroundColor: COLORS.surface,
                border: `1px solid ${COLORS.outline}`,
                boxShadow: `0 0 40px ${COLORS.primary}10`,
              }}
            >
              <TerminalAnimation />
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── Stats Bar ── */}
      <FadeIn>
        <section
          className="backdrop-blur-sm py-8 px-4 sm:px-6"
          style={{
            borderTop: `1px solid ${COLORS.outline}`,
            borderBottom: `1px solid ${COLORS.outline}`,
            backgroundColor: `${COLORS.surface}66`,
          }}
        >
          <div className="max-w-6xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-8">
            {STATS.map(({ value, labelKey, icon: Icon }) => (
              <div key={labelKey} className="text-center sm:text-left">
                <div className="flex items-center justify-center sm:justify-start gap-1.5 mb-1">
                  <Icon weight="bold" className="w-4 h-4" style={{ color: COLORS.primary }} />
                  <p className="text-xl sm:text-2xl font-bold tabular-nums" style={{ color: COLORS.primary }}>
                    {value}
                  </p>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: COLORS.onSurfaceVariant }}>
                  {t[labelKey as keyof typeof t]}
                </p>
              </div>
            ))}
          </div>
        </section>
      </FadeIn>

      {/* ── How It Works ── */}
      <section className="py-20 sm:py-28 px-4 sm:px-6 max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <FadeIn>
            <SectionEyebrow lang={lang}>{t.howEyebrow}</SectionEyebrow>
          </FadeIn>
          <FadeIn delay={0.1}>
            <h2
              className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-[-0.01em]"
              style={{ color: COLORS.onSurface }}
            >
              {t.howTitle}
            </h2>
          </FadeIn>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {HOW_ITEMS.map(({ titleKey, bodyKey, icon: Icon, accent }, i) => (
            <FadeIn key={titleKey} delay={i * 0.1}>
              <div
                className="flex flex-col gap-4 p-6 sm:p-8 rounded-2xl transition-all duration-300"
                style={{
                  backgroundColor: `${COLORS.surface}cc`,
                  border: `1px solid ${COLORS.outline}`,
                  backdropFilter: 'blur(24px)',
                }}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${accent}14` }}
                >
                  <Icon weight="bold" className="w-5 h-5" style={{ color: accent }} />
                </div>
                <div>
                  <h3 className="font-semibold mb-2 text-base" style={{ color: COLORS.onSurface }}>
                    {t[titleKey as keyof typeof t]}
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: COLORS.onSurfaceVariant }}>
                    {t[bodyKey as keyof typeof t]}
                  </p>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="py-20 sm:py-28 px-4 sm:px-6 max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <FadeIn>
            <SectionEyebrow lang={lang}>{t.pricingEyebrow}</SectionEyebrow>
          </FadeIn>
          <FadeIn delay={0.1}>
            <h2
              className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-[-0.01em]"
              style={{ color: COLORS.onSurface }}
            >
              {t.pricingTitle}
            </h2>
          </FadeIn>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {PRICING_CARDS.map(({ nameKey, priceKey, subKey, ctaKey, href, highlight, features }, i) => (
            <FadeIn key={nameKey} delay={i * 0.1}>
              <div
                className="relative flex flex-col gap-5 p-6 sm:p-8 rounded-2xl transition-all duration-300"
                style={{
                  backgroundColor: highlight ? COLORS.surfaceHigh : `${COLORS.surface}cc`,
                  border: highlight
                    ? `2px solid ${COLORS.primaryContainer}`
                    : `1px solid ${COLORS.outline}`,
                  backdropFilter: 'blur(24px)',
                }}
              >
                {highlight && (
                  <span
                    className="absolute -top-3 left-1/2 -translate-x-1/2 text-[11px] font-bold px-3 py-0.5 rounded-full tracking-wide"
                    style={{ backgroundColor: COLORS.primaryContainer, color: COLORS.primaryContainer }}
                  >
                    {t.popular}
                  </span>
                )}
                <div>
                  <p
                    className="text-xs font-medium uppercase tracking-wider mb-1"
                    style={{ color: COLORS.onSurfaceVariant }}
                  >
                    {t[nameKey as keyof typeof t]}
                  </p>
                  <p className="text-4xl font-bold tracking-tight tabular-nums" style={{ color: COLORS.onSurface }}>
                    {t[priceKey as keyof typeof t]}
                    <span
                      className="text-sm font-normal font-sans ml-1"
                      style={{ color: COLORS.onSurfaceVariant }}
                    >
                      {t[subKey as keyof typeof t]}
                    </span>
                  </p>
                </div>
                <ul className="space-y-3 flex-1">
                  {features.map((f) => (
                    <li
                      key={f}
                      className="flex items-center gap-2.5 text-sm"
                      style={{ color: COLORS.onSurfaceVariant }}
                    >
                      <CheckCircle weight="fill" className="w-4 h-4 flex-shrink-0" style={{ color: COLORS.primary }} />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  to={href}
                  className="text-center text-sm font-semibold px-5 py-3 rounded-lg transition-all duration-200"
                  style={
                    highlight
                      ? {
                          backgroundColor: COLORS.primaryContainer,
                          color: COLORS.primaryContainer,
                          boxShadow: `0 4px 20px ${COLORS.primaryContainer}40`,
                        }
                      : {
                          border: `1px solid ${COLORS.outline}`,
                          color: COLORS.onSurfaceVariant,
                        }
                  }
                  onMouseEnter={(e) => {
                    if (highlight) e.currentTarget.style.opacity = '0.85';
                    else {
                      e.currentTarget.style.color = COLORS.onSurface;
                      e.currentTarget.style.borderColor = `${COLORS.primary}80`;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (highlight) e.currentTarget.style.opacity = '1';
                    else {
                      e.currentTarget.style.color = COLORS.onSurfaceVariant;
                      e.currentTarget.style.borderColor = COLORS.outline;
                    }
                  }}
                >
                  {t[ctaKey as keyof typeof t]}
                </Link>
              </div>
            </FadeIn>
          ))}
        </div>
        <FadeIn delay={0.2}>
          <p className="text-center mt-8">
            <Link
              to="/pricing"
              className="text-sm hover:underline inline-flex items-center gap-1"
              style={{ color: COLORS.primary }}
            >
              {t.seeFullPricing}
              <ArrowRight className="w-3 h-3" />
            </Link>
          </p>
        </FadeIn>
      </section>

      <Footer />
    </div>
  );
}
