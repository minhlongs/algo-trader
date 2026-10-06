/**
 * Public pricing page. Full-page, no sidebar.
 * 3-column plan table + FAQ accordion.
 * Stitch dark fintech bilingual VN+EN.
 * Coupon redeem flow: /api/coupons/redeem -> NOWPayments checkout or free activation.
 */
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PublicNavbar } from '../components/public-navbar';
import { Footer } from '../components/footer';
import { COLORS } from '../lib/stitch-design-tokens';
import { TIER_LIMITS } from '../lib/tier-config';
import { useCoupons } from '../hooks/use-coupons';

type Lang = 'en' | 'vi';
type Plan = 'Free' | 'Pro' | 'Enterprise';

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
    faq3a: 'Bot nhắm đến các thị trường dự đoán Polymarket có thanh khoản cao và spread đo lường được. Thuật toán chọn lọc thị trường theo khối lượng, độ sâu thanh khoản và độ rộng spread.',
    faq4q: 'I can cancel anytime?',
    faq4a: 'Yes. Gói Pro và Enterprise tính theo tháng, không ràng buộc. Hủy trước ngày thanh toán tiếp theo và bạn sẽ không bị tính phí thêm.',
    faq5q: 'Do I need a Polymarket account?',
    faq5a: 'Yes. CashClaw connects to your existing Polymarket account via API key. You keep full capital control.',
  },
  vi: {
    langToggle: 'English',
    eyebrow: 'Bảng giá',
    title: 'Gói đơn giản, minh bạch',
    subtitle: 'Dùng miễn phí, nâng cấp khi sẵn sàng. Không phí ẩn. Hủy bất cứ lúc nào.',
    planFree: 'Miễn phí',
    planPro: 'Pro',
    planEnterprise: 'Doanh nghiệp',
    priceFree: '$0',
    pricePro: '$49',
    priceEnterprise: '$199',
    subFree: 'mãi mãi',
    subMonthly: '/ tháng',
    ctaGetStarted: 'Bắt đầu',
    ctaStartPro: 'Nâng cấp Pro',
    popular: 'PHỔ BIẾN',
    featActiveStrategies: 'chiến lược',
    featTradesPerDay: 'giao dịch/ngày',
    featDailyLossCap: 'giới hạn lỗ ngày',
    featMaxPosition: 'vị thế tối đa',
    featScanningBasic: 'Cơ bản',
    featScanningAdvanced: 'Nâng cao',
    featScanningFull: 'Toàn diện',
    featSafetyLimits: 'Giới hạn an toàn',
    featApiAccess: 'Truy cập API',
    featPrioritySupport: 'Hỗ trợ ưu tiên',
    faqTitle: 'Câu hỏi thường gặp',
    faq1q: 'CashClaw kiếm tiền như thế nào cho tôi?',
    faq1a: 'CashClaw đặt lệnh mua/bán quanh giá trung bình giá trị hợp lý. Khi cả hai phía khớp, bạn kiếm spread. Thị trường càng thanh khoản thì khớp càng nhiều.',
    faq2q: 'Vốn của tôi có bị rủi ro không?',
    faq2a: 'Mọi hoạt động giao dịch đều có rủi ro. CashClaw áp dụng giới hạn lỗ ngày và kích thước vị thế tối đa để giảm thiểu rủi ro. Bạn quản lý chính ví Polymarket của mình — vốn không bao giờ rời khỏi tài khoản.',
    faq3q: 'CashClaw giao dịch những thị trường nào?',
    faq3a: 'Bot nhắm đến các thị trường dự đoán Polymarket có thanh khoản cao và spread đo lường được. Thuật toán chọn lọc thị trường theo khối lượng, độ sâu thanh khoản và độ rộng spread.',
    faq4q: 'Tôi có thể hủy bất cứ lúc nào không?',
    faq4a: 'Có. Gói Pro và Enterprise tính theo tháng, không ràng buộc. Hủy trước ngày thanh toán tiếp theo và bạn sẽ không bị tính phí thêm.',
    faq5q: 'Tôi có cần tài khoản Polymarket không?',
    faq5a: 'Có. CashClaw kết nối với tài khoản Polymarket hiện tại của bạn qua API key. Bạn giữ quyền kiểm soát vốn hoàn toàn.',
  },
};

const PLANS: { name: Plan; price: string; sub: string; href: string; tier: string; apiBasePrice: number; highlight: boolean; features: { label: string; value: number | string | boolean }[] }[] = [
  {
    name: 'Free',
    price: '$0',
    sub: 'forever',
    href: '/signup?tier=free',
    tier: 'free',
    highlight: false,
    apiBasePrice: 0,
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
    tier: 'pro',
    highlight: true,
    apiBasePrice: 49,
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
    tier: 'enterprise',
    highlight: false,
    apiBasePrice: 199,
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
  return `glass-card backdrop-blur-xl border border-white/10 rounded-2xl ${extra}`.trim();
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function FaqItem({ qKey, aKey, t }: { qKey: string; aKey: string; t: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b" style={{ borderColor: COLORS.outline }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between py-4 text-left text-sm hover:opacity-80 transition-opacity"
        style={{ color: COLORS.onSurface }}
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
        <p className="text-sm leading-relaxed pb-4" style={{ color: COLORS.onSurfaceVariant }}>{t[aKey]}</p>
      )}
    </div>
  );
}

const TRUSTED_CHECKOUT_DOMAINS = [
  'nowpayments.io',
  'sandbox.nowpayments.io',
];

const isTrustedCheckoutUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    return TRUSTED_CHECKOUT_DOMAINS.some(
      (d) => parsed.hostname === d || parsed.hostname.endsWith(`.${d}`)
    );
  } catch {
    return false;
  }
};

export function PricingPage() {
  const [lang, setLang] = useState<Lang>('en');
  const t = COPY[lang];
  const [couponCode, setCouponCode] = useState('');
  const [couponBusy, setCouponBusy] = useState<Plan | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { redeemCoupon } = useCoupons('');

  const handleCTAClick = useCallback(
    async (plan: typeof PLANS[number]) => {
      if (!couponCode || plan.apiBasePrice === 0) {
        navigate(plan.href);
        return;
      }
      setCouponBusy(plan.name);
      setCouponError(null);
      try {
        const result = await redeemCoupon(couponCode, plan.tier);
        setCouponBusy(null);
        if (!result) {
          navigate(plan.href);
          return;
        }
        if (result.checkoutUrl && isTrustedCheckoutUrl(result.checkoutUrl)) {
          window.location.assign(result.checkoutUrl);
        } else if (result.checkoutUrl) {
          setCouponError('Invalid checkout URL');
          navigate(plan.href);
        } else if (result.finalPrice === 0 && result.message) {
          navigate(`/signup?tier=${plan.tier}&coupon=${encodeURIComponent(couponCode)}`);
        } else {
          navigate(plan.href);
        }
      } catch (_err) {
        setCouponBusy(null);
        navigate(plan.href);
      }
    },
    [couponCode, navigate, redeemCoupon]
  );

  return (
    <div
      className="min-h-screen font-sans flex flex-col"
      style={{ backgroundColor: COLORS.bg, color: COLORS.onSurface }}
    >
      <PublicNavbar />

      {/* Language toggle */}
      <div className="flex justify-end px-4 sm:px-6 pt-4 max-w-6xl mx-auto w-full">
        <button
          onClick={() => setLang((l: Lang) => (l === 'en' ? 'vi' : 'en'))}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs transition-colors focus-visible:outline-none focus-visible:ring-2"
          style={{
            backgroundColor: `${COLORS.surface}CC`,
            borderColor: COLORS.outline,
            color: COLORS.onSurfaceVariant,
          }}
          aria-label="Toggle language"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10" />
          </svg>
          {t.langToggle}
        </button>
      </div>

      <main className="flex-1 pt-12 pb-16 px-4 sm:px-6 max-w-6xl mx-auto w-full">
        {/* Coupon bar with WCAG 2.1 AA accessible label and aria-label */}
        <div className="max-w-md mx-auto mb-10">
          <div className="flex items-center gap-2">
            <label htmlFor="coupon-code" className="sr-only">
              Coupon code
            </label>
            <input
              id="coupon-code"
              name="coupon-code"
              aria-label="Coupon code"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              placeholder="COUPON CODE"
              className="flex-1 rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent transition-colors"
              style={{
                borderColor: COLORS.outline,
                backgroundColor: `${COLORS.surface}CC`,
                color: COLORS.onSurface,
              }}
            />
          </div>
          {couponError && (
            <p className="text-xs mt-2" style={{ color: COLORS.loss }}>{couponError}</p>
          )}
        </div>

        {/* Header */}
        <div className="text-center mb-12">
          <p className="text-xs uppercase tracking-widest mb-3" style={{ color: COLORS.primary }}>{t.eyebrow}</p>
          <h1 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: COLORS.onSurface }}>{t.title}</h1>
          <p className="text-sm max-w-md mx-auto" style={{ color: COLORS.onSurfaceVariant }}>{t.subtitle}</p>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-20">
          {PLANS.map((plan) => {
            const busy = couponBusy === plan.name;
            return (
              <div
                key={plan.name}
                className={`relative p-6 flex flex-col gap-5 ${plan.highlight ? glassCard('border-2 border-accent') : glassCard()}`}
              >
                {plan.highlight && (
                  <span
                    className="absolute -top-3 left-1/2 -translate-x-1/2 text-black text-xs font-bold px-3 py-0.5 rounded-full"
                    style={{ backgroundColor: COLORS.primary }}
                  >
                    {t.popular}
                  </span>
                )}

                <div>
                  <p className="text-xs uppercase tracking-widest mb-2" style={{ color: COLORS.onSurfaceVariant }}>{t[`plan${plan.name}` as keyof typeof t] as string}</p>
                  <p className="text-4xl font-bold" style={{ color: COLORS.onSurface }}>
                    {plan.price}
                    <span className="text-sm font-normal ml-1" style={{ color: COLORS.onSurfaceVariant }}>
                      {plan.sub === 'forever' ? t.subFree : t.subMonthly}
                    </span>
                  </p>
                </div>

                <ul className="space-y-2.5 flex-1">
                  {plan.features.map(({ label, value }) => (
                    <li key={label} className="flex items-center justify-between text-xs">
                      <span style={{ color: COLORS.onSurfaceVariant }}>{t[label as keyof typeof t] as string}</span>
                      <span className="flex items-center gap-1">
                        {typeof value === 'boolean' ? (
                          value ? <CheckIcon /> : <XIcon />
                        ) : (
                          <span style={{ color: COLORS.onSurface }}>{value as string}</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleCTAClick(plan)}
                  disabled={busy}
                  className="text-center text-sm font-bold px-4 py-2.5 rounded transition-colors disabled:opacity-60 disabled:cursor-wait focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  style={
                    plan.highlight
                      ? { backgroundColor: COLORS.primary, color: '#000000' }
                      : {
                          border: `1px solid ${COLORS.outline}`,
                          color: COLORS.onSurfaceVariant,
                          backgroundColor: 'transparent',
                        }
                  }
                >
                  {busy ? 'Applying...' : t[plan.tier === 'pro' ? 'ctaStartPro' : 'ctaGetStarted' as keyof typeof t] as string}
                </button>
              </div>
            );
          })}
        </div>

        {/* FAQ */}
        <div className="max-w-2xl mx-auto">
          <h2 className="text-xl font-bold mb-6 text-center" style={{ color: COLORS.onSurface }}>{t.faqTitle}</h2>
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