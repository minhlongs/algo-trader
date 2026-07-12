/**
 * Public pricing page. Full-page, no sidebar.
 * 3-column plan table + FAQ accordion.
 * Stitch dark fintech bilingual VN+EN.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PublicNavbar } from '../components/public-navbar';
import { Footer } from '../components/footer';
import { COLORS } from '../lib/stitch-design-tokens';
import { TIER_LIMITS } from '../lib/tier-config';

type Lang = 'en' | 'vi';

const COPY: Record<Lang, Record<string, string>> = {
  en: {
    langToggle: 'Tiếng Việt',
    eyebrow: 'Pricing',
    title: 'Simple, transparent plans',
    subtitle: 'Start free. Upgrade when you\'re ready. No hidden fees. Cancel anytime.',
    planFree: 'Free',
    planPro: 'Pro',
    planEnterprise: 'Enterprise',
    priceFree: '$0',
    pricePro: '$49',
    priceEnterprise: '$199',
    subFree: 'forever',
    subMonthly: '/ month',
    ctaGetStarted: 'Get Started',
    ctaStartPro: 'Start Pro',
    popular: 'POPULAR',
    featActiveStrategies: 'Active strategies',
    featTradesPerDay: 'Trades per day',
    featDailyLossCap: 'Daily loss cap',
    featMaxPosition: 'Max position size',
    featScanningBasic: 'Basic',
    featScanningAdvanced: 'Advanced',
    featScanningFull: 'Full coverage',
    featSafetyLimits: 'Safety limits',
    featApiAccess: 'API access',
    featPrioritySupport: 'Priority support',
    faqTitle: 'Frequently asked questions',
    faq1q: 'How does CashClaw make money for me?',
    faq1a: 'CashClaw posts bid and ask orders around the fair-value mid-price on Polymarket. When both sides fill, you earn the spread. Higher liquidity markets produce more fills.',
    faq2q: 'Is my capital at risk?',
    faq2a: 'All trading carries risk. CashClaw enforces daily loss caps and maximum position sizes to limit downside. You control your Polymarket wallet at all times — funds never leave your account.',
    faq3q: 'What markets does CashClaw trade?',
    faq3a: 'The bot targets high-liquidity Polymarket prediction markets with measurable spreads. The selection algorithm scores markets by volume, liquidity depth, and spread width.',
    faq4q: 'Can I cancel anytime?',
    faq4a: 'Yes. Pro and Enterprise plans are month-to-month with no lock-in. Cancel before your next billing date and you will not be charged again.',
    faq5q: 'Do I need a Polymarket account?',
    faq5a: 'Yes. CashClaw connects to your existing Polymarket account via API key. You retain full custody of funds.',
  },
  vi: {
    langToggle: 'English',
    eyebrow: 'Bảng giá',
    title: 'Gói dịch vụ đơn giản, minh bạch',
    subtitle: 'Dùng thử miễn phí. Nâng cấp khi bạn sẵn sàng. Không phí ẩn. Hủy bất cứ lúc nào.',
    planFree: 'Free',
    planPro: 'Pro',
    planEnterprise: 'Enterprise',
    priceFree: '$0',
    pricePro: '$49',
    priceEnterprise: '$199',
    subFree: 'vĩnh viễn',
    subMonthly: '/ tháng',
    ctaGetStarted: 'Bắt đầu',
    ctaStartPro: 'Dùng Pro',
    popular: 'PHỔ BIẾN',
    featActiveStrategies: 'Chiến lược hoạt động',
    featTradesPerDay: 'Giao dịch/ngày',
    featDailyLossCap: 'Giới hạn lỗ/ngày',
    featMaxPosition: 'Vị thế tối đa',
    featScanningBasic: 'Cơ bản',
    featScanningAdvanced: 'Nâng cao',
    featScanningFull: 'Toàn diện',
    featSafetyLimits: 'Giới hạn bảo vệ',
    featApiAccess: 'Truy cập API',
    featPrioritySupport: 'Hỗ trợ ưu tiên',
    faqTitle: 'Câu hỏi thường gặp',
    faq1q: 'CashClaw giúp tôi kiếm tiền như thế nào?',
    faq1a: 'CashClaw đặt lệnh mua và bán quanh giá trung bình trên Polymarket. Khi cả hai phía được khớp, bạn kiếm được spread. Thị trường thanh khoản cao tạo ra nhiều khớp lệnh hơn.',
    faq2q: 'Vốn của tôi có bị rủi ro không?',
    faq2a: 'Mọi giao dịch đều có rủi ro. CashClaw áp dụng giới hạn lỗ hàng ngày và giới hạn vị thế tối đa để giảm thiểu rủi ro. Bạn kiểm soát hoàn toàn ví Polymarket — tiền không rời khỏi tài khoản của bạn.',
    faq3q: 'CashClaw giao dịch những thị trường nào?',
    faq3a: 'Bot nhắm đến các thị trường dự đoán Polymarket có thanh khoản cao và spread đo lường được. Thuật toán chọn lọc thị trường theo khối lượng, độ sâu thanh khoản và độ rộng spread.',
    faq4q: 'Tôi có thể hủy bất cứ lúc nào không?',
    faq4a: 'Có. Gói Pro và Enterprise tính theo tháng, không ràng buộc. Hủy trước ngày thanh toán tiếp theo và bạn sẽ không bị tính phí thêm.',
    faq5q: 'Tôi có cần tài khoản Polymarket không?',
    faq5a: 'Có. CashClaw kết nối với tài khoản Polymarket hiện tại của bạn qua API key. Bạn giữ quyền kiểm soát vốn hoàn toàn.',
  },
};

const PLANS = [
  {
    name: 'Free',
    price: '$0',
    sub: 'forever',
    href: '/signup?tier=free',
    cta: 'ctaGetStarted',
    highlight: false,
    features: [
      { label: 'featActiveStrategies', value: TIER_LIMITS.free.activeStrategies },
      { label: 'featTradesPerDay', value: TIER_LIMITS.free.tradesPerDay },
      { label: 'featDailyLossCap', value: TIER_LIMITS.free.dailyLossCap },
      { label: 'featMaxPosition', value: TIER_LIMITS.free.maxPosition },
      { label: 'featScanningBasic', value: true },
      { label: 'featSafetyLimits', value: true },
      { label: 'featApiAccess', value: false },
      { label: 'featPrioritySupport', value: false },
    ],
  },
  {
    name: 'Pro',
    price: '$49',
    sub: '/ month',
    href: '/signup?tier=pro',
    cta: 'ctaStartPro',
    highlight: true,
    features: [
      { label: 'featActiveStrategies', value: TIER_LIMITS.pro.activeStrategies },
      { label: 'featTradesPerDay', value: TIER_LIMITS.pro.tradesPerDay },
      { label: 'featDailyLossCap', value: TIER_LIMITS.pro.dailyLossCap },
      { label: 'featMaxPosition', value: TIER_LIMITS.pro.maxPosition },
      { label: 'featScanningAdvanced', value: true },
      { label: 'featSafetyLimits', value: true },
      { label: 'featApiAccess', value: true },
      { label: 'featPrioritySupport', value: false },
    ],
  },
  {
    name: 'Enterprise',
    price: '$199',
    sub: '/ month',
    href: '/signup?tier=enterprise',
    cta: 'ctaGetStarted',
    highlight: false,
    features: [
      { label: 'featActiveStrategies', value: TIER_LIMITS.enterprise.activeStrategies },
      { label: 'featTradesPerDay', value: TIER_LIMITS.enterprise.tradesPerDay },
      { label: 'featDailyLossCap', value: TIER_LIMITS.enterprise.dailyLossCap },
      { label: 'featMaxPosition', value: TIER_LIMITS.enterprise.maxPosition },
      { label: 'featScanningFull', value: true },
      { label: 'featSafetyLimits', value: true },
      { label: 'featApiAccess', value: true },
      { label: 'featPrioritySupport', value: true },
    ],
  },
];

const FAQS = [
  {
    q: 'faq1q',
    a: 'faq1a',
  },
  {
    q: 'faq2q',
    a: 'faq2a',
  },
  {
    q: 'faq3q',
    a: 'faq3a',
  },
  {
    q: 'faq4q',
    a: 'faq4a',
  },
  {
    q: 'faq5q',
    a: 'faq5a',
  },
];

function glassCard(extra = '') {
  return `bg-[${COLORS.surface}]/80 backdrop-blur-xl border border-[${COLORS.outline}] rounded-2xl ${extra}`.trim();
}

function CheckIcon() {
  return (
    <svg width="14" height="14" fill="none" stroke={COLORS.profit} strokeWidth="2" viewBox="0 0 24 24">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="14" height="14" fill="none" stroke={COLORS.onSurfaceVariant} strokeWidth="2" viewBox="0 0 24 24">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function FaqItem({ qKey, aKey, t }: { qKey: string; aKey: string; t: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-[${COLORS.outline}]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between py-4 text-left text-sm text-[${COLORS.onSurface}] hover:text-[${COLORS.primary}] transition-colors"
      >
        <span>{t[qKey]}</span>
        <svg
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
          className={`flex-shrink-0 ml-4 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <p className="text-[${COLORS.onSurfaceVariant}] text-sm leading-relaxed pb-4">{t[aKey]}</p>
      )}
    </div>
  );
}

export function PricingPage() {
  const [lang, setLang] = useState<Lang>('en');
  const t = COPY[lang];

  return (
    <div className="min-h-screen bg-[${COLORS.bg}] text-[${COLORS.onSurface}] font-sans flex flex-col">
      <PublicNavbar />

      {/* Language toggle */}
      <div className="flex justify-end px-4 sm:px-6 pt-4 max-w-6xl mx-auto w-full">
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

      <main className="flex-1 pt-12 pb-16 px-4 sm:px-6 max-w-6xl mx-auto w-full">
        {/* Header */}
        <div className="text-center mb-12">
          <p className="text-[${COLORS.primary}] text-xs uppercase tracking-widest mb-3">{t.eyebrow}</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-[${COLORS.onSurface}] mb-4">{t.title}</h1>
          <p className="text-[${COLORS.onSurfaceVariant}] text-sm max-w-md mx-auto">{t.subtitle}</p>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-20">
          {PLANS.map(({ name, price, sub, href, cta, highlight, features }) => (
            <div
              key={name}
              className={`relative p-6 flex flex-col gap-5 ${highlight ? glassCard('border-2 border-[${COLORS.primary}]') : glassCard()}`}
            >
              {highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[${COLORS.primary}] text-white text-xs font-bold px-3 py-0.5 rounded-full">
                  {t.popular}
                </span>
              )}

              <div>
                <p className="text-[${COLORS.onSurfaceVariant}] text-xs uppercase tracking-widest mb-2">{t[`plan${name}` as keyof typeof t] as string}</p>
                <p className="text-[${COLORS.onSurface}] text-4xl font-bold">
                  {price}
                  <span className="text-[${COLORS.onSurfaceVariant}] text-sm font-normal ml-1">
                    {sub === 'forever' ? t.subFree : t.subMonthly}
                  </span>
                </p>
              </div>

              <ul className="space-y-2.5 flex-1">
                {features.map(({ label, value }) => (
                  <li key={label} className="flex items-center justify-between text-xs">
                    <span className="text-[${COLORS.onSurfaceVariant}]">{t[label as keyof typeof t] as string}</span>
                    <span className="flex items-center gap-1">
                      {typeof value === 'boolean' ? (
                        value ? <CheckIcon /> : <XIcon />
                      ) : (
                        <span className="text-[${COLORS.onSurface}]">{value}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>

              <Link
                to={href}
                className={`text-center text-sm font-bold px-4 py-2.5 rounded transition-colors ${
                  highlight
                    ? 'bg-[${COLORS.primary}] text-white hover:bg-[${COLORS.primary}]/80'
                    : 'border border-[${COLORS.outline}] text-[${COLORS.onSurfaceVariant}] hover:text-[${COLORS.onSurface}] hover:border-[${COLORS.primary}]'
                }`}
              >
                {t[cta as keyof typeof t] as string}
              </Link>
            </div>
          ))}
        </div>

        {/* FAQ */}
        <div className="max-w-2xl mx-auto">
          <h2 className="text-xl font-bold text-[${COLORS.onSurface}] mb-6 text-center">{t.faqTitle}</h2>
          <div className={glassCard('p-6')}>
            {FAQS.map(({ q, a }) => (
              <FaqItem key={q} qKey={q} aKey={a} t={t} />
            ))}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
