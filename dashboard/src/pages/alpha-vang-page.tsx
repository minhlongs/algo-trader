/**
 * Alpha Vang Page — "Alpha Vang Energy 9 Solution" product page.
 * Bilingual VN+EN. Tier-gated: FREE sees upsell, BASIC+ sees full content.
 *
 * Route: /alpha-vang
 * Pattern: matches enterprise-page.tsx (PublicNavbar + Footer + FadeIn motion)
 */

import { useState, useRef } from 'react';
import { motion, useInView } from 'motion/react';
import { Link } from 'react-router-dom';
import { PublicNavbar } from '../components/public-navbar';
import { Footer } from '../components/footer';

// ---- i18n (inline until proper next-intl integration) ----
const COPY = {
  en: {
    badge: 'Alpha Vang',
    headline: 'Energy 9 Solution',
    subline: 'The only arbitrage system that turns Polymarket inefficiencies into consistent monthly income.',
    cta: 'Get Started — $1 Trial',
    ctaLocked: 'Upgrade to Access',
    tierRequired: 'BASIC',
    overviewTitle: 'What you get',
    feat1: 'Triangular arbitrage across 100+ prediction markets',
    feat2: 'Auto-execution with Kelly Criterion sizing',
    feat3: 'Real-time signal feed via SSE (PRO+)',
    feat4: 'Backtesting engine with Sharpe / max-drawdown metrics',
    feat5: '24/7 scanning — no manual monitoring needed',
    feat6: 'Paper-trading mode — test risk-free first',
    howTitle: 'How it works',
    step1: 'Sign up + activate BASIC tier ($1 trial)',
    step2: 'Connect your Polymarket API key (BYOK)',
    step3: 'Set profit threshold & max position size',
    step4: 'Bot scans 24/7, executes profitable trades automatically',
    step5: 'Track P&L in real-time dashboard',
    upgradeTitle: 'Upgrade to unlock',
    upgradeSub: 'BASIC tier ($1) gives full access to Energy 9 Solution.',
    faqTitle: 'FAQ',
    faq1q: 'What is the $1 trial?',
    faq1a: 'One-time $1 payment activates BASIC tier for 30 days. No auto-renewal. Cancels anytime.',
    faq2q: 'Do I need to deposit funds?',
    faq2a: 'No. The bot trades on your behalf using your connected Polymarket account. You maintain full control of capital.',
    faq3q: 'What if the bot loses money?',
    faq3a: 'Built-in daily loss cap + Kelly Criterion sizing limits downside. Paper-trading mode lets you validate before going live.',
    disclaimer: 'Past performance does not guarantee future results. Trading involves risk.',
    upgradeLabel: 'Upgrade now',
  },
  vi: {
    badge: 'Alpha Vang',
    headline: 'Giải pháp Năng lượng 9',
    subline: 'Hệ thống arbitrage duy nhất biến sai lệch thị trường Polymarket thành thu nhập tháng ổn định.',
    cta: 'Bắt đầu — Dùng thử $1',
    ctaLocked: 'Nâng cấp để truy cập',
    tierRequired: 'BASIC',
    overviewTitle: 'Bạn nhận được gì',
    feat1: 'Arbitrage tam giác trên 100+ prediction market',
    feat2: 'Tự động thực thi với Kelly Criterion sizing',
    feat3: 'Signal feed real-time qua SSE (PRO+)',
    feat4: 'Backtesting engine — Sharpe, max-drawdown',
    feat5: 'Quét 24/7 — không cần giám sát thủ công',
    feat6: 'Chế độ paper-trading — thử nghiệm không rủi ro',
    howTitle: 'Cách hoạt động',
    step1: 'Đăng ký + kích hoạt tier BASIC (dùng thử $1)',
    step2: 'Kết nối API key Polymarket (BYOK)',
    step3: 'Đặt profit threshold & max position size',
    step4: 'Bot quét 24/7, tự động thực thi giao dịch có lãi',
    step5: 'Theo dõi P&L real-time trên dashboard',
    upgradeTitle: 'Nâng cấp để mở khóa',
    upgradeSub: 'Tier BASIC ($1) cho quyền truy cập đầy đủ Giải pháp Năng lượng 9.',
    faqTitle: 'Câu hỏi thường gặp',
    faq1q: 'Dùng thử $1 là gì?',
    faq1a: 'Thanh toán $1 một lần kích hoạt tier BASIC trong 30 ngày. Không tự gia hạn. Hủy bất cứ lúc nào.',
    faq2q: 'Tôi có cần nạp vốn không?',
    faq2a: 'Không. Bot giao dịch thay bạn trên tài khoản Polymarket đã kết nối. Bạn giữ toàn quyền kiểm soát vốn.',
    faq3q: 'Bot lỗ thì sao?',
    faq3a: 'Daily loss cap + Kelly Criterion sizing giới hạn downside. Chế độ paper-trading giúp kiểm tra trước khi live.',
    disclaimer: 'Kết quả quá khứ không đảm bảo kết quả tương lai. Giao dịch có rủi ro.',
    upgradeLabel: 'Nâng cấp ngay',
  },
};

type Lang = 'en' | 'vi';

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

function CheckIcon() {
  return (
    <svg width="13" height="13" fill="none" stroke="#F59E0B" strokeWidth="2.5" viewBox="0 0 24 24">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// ---- Tier gate simulation (replace with real auth check later) ----
// For Phase 01 A3 compliance: FREE users see locked state.
// In production, this reads from Better Auth session + D1 tier.
const MOCK_TIER: 'FREE' | 'BASIC' | 'PRO' = 'FREE'; // TODO: wire real tier

export function AlphaVangPage() {
  const [lang, setLang] = useState<Lang>('vi');
  const t = COPY[lang];
  const hasAccess = MOCK_TIER !== 'FREE';

  return (
    <div className="min-h-screen bg-bg text-white flex flex-col">
      <PublicNavbar />

      <main className="flex-1 pt-24 pb-16 px-4 sm:px-6 max-w-6xl mx-auto w-full">
        {/* Language toggle */}
        <FadeIn>
          <div className="flex justify-end mb-6">
            <div className="inline-flex rounded border border-bg-border bg-bg-surface/60 text-xs">
              <button
                onClick={() => setLang('en')}
                className={`px-3 py-1 rounded-l transition-colors ${lang === 'en' ? 'bg-[#F59E0B] text-black' : 'text-muted hover:text-white'}`}
              >
                EN
              </button>
              <button
                onClick={() => setLang('vi')}
                className={`px-3 py-1 rounded-r transition-colors ${lang === 'vi' ? 'bg-[#F59E0B] text-black' : 'text-muted hover:text-white'}`}
              >
                VI
              </button>
            </div>
          </div>
        </FadeIn>

        {/* Hero */}
        <FadeIn>
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 mb-4">
              <span className="w-1 h-4 bg-[#F59E0B] rounded-full" />
              <p className="text-[#F59E0B] text-xs uppercase tracking-widest font-mono font-bold">{t.badge}</p>
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4">{t.headline}</h1>
            <p className="text-muted text-sm sm:text-base max-w-2xl mx-auto mb-8">{t.subline}</p>

            {hasAccess ? (
              <Link
                to="/app"
                className="inline-block bg-[#F59E0B] text-black font-bold px-8 py-3 rounded hover:bg-[#F59E0B]/80 transition-colors text-sm"
              >
                {t.cta}
              </Link>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted">
                  {t.ctaLocked} — requires <span className="text-[#F59E0B] font-bold">{t.tierRequired}</span> tier
                </p>
                <Link
                  to="/pricing"
                  className="inline-block bg-[#F59E0B] text-black font-bold px-8 py-3 rounded hover:bg-[#F59E0B]/80 transition-colors text-sm"
                >
                  {t.upgradeLabel}
                </Link>
              </div>
            )}
          </div>
        </FadeIn>

        {/* Features */}
        <FadeIn delay={0.1}>
          <div className="mb-16">
            <div className="flex items-center justify-center gap-2 mb-8">
              <span className="w-1 h-5 bg-[#F59E0B] rounded-full" />
              <h2 className="text-xl font-bold text-white">{t.overviewTitle}</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
              {[t.feat1, t.feat2, t.feat3, t.feat4, t.feat5, t.feat6].map((feat) => (
                <div
                  key={feat}
                  className={`flex items-start gap-3 p-4 rounded-lg border ${hasAccess ? 'border-bg-border bg-bg-surface/60' : 'border-bg-border/50 bg-bg-surface/30 opacity-60'}`}
                >
                  <span className="flex-shrink-0 mt-0.5"><CheckIcon /></span>
                  <span className="text-sm text-muted">{feat}</span>
                </div>
              ))}
            </div>
          </div>
        </FadeIn>

        {/* How it works */}
        <FadeIn delay={0.2}>
          <div className="mb-16 max-w-2xl mx-auto">
            <div className="flex items-center justify-center gap-2 mb-8">
              <span className="w-1 h-5 bg-[#F59E0B] rounded-full" />
              <h2 className="text-xl font-bold text-white">{t.howTitle}</h2>
            </div>
            <ol className="space-y-4">
              {[t.step1, t.step2, t.step3, t.step4, t.step5].map((step, i) => (
                <li key={i} className="flex gap-4">
                  <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${hasAccess ? 'bg-[#F59E0B]/15 border border-[#F59E0B]/40 text-[#F59E0B]' : 'bg-bg-surface border border-bg-border text-muted'}`}>
                    {i + 1}
                  </span>
                  <p className={`text-sm pt-0.5 ${hasAccess ? 'text-muted' : 'text-muted/60'}`}>{step}</p>
                </li>
              ))}
            </ol>
          </div>
        </FadeIn>

        {/* Upgrade CTA (shown when locked) */}
        {!hasAccess && (
          <FadeIn delay={0.3}>
            <div className="border border-[#F59E0B]/20 bg-[#F59E0B]/5 rounded-lg p-6 max-w-xl mx-auto text-center">
              <p className="text-sm font-bold text-white mb-2">{t.upgradeTitle}</p>
              <p className="text-xs text-muted mb-4">{t.upgradeSub}</p>
              <Link to="/pricing" className="inline-block bg-[#F59E0B] text-black font-bold px-6 py-2.5 rounded hover:bg-[#F59E0B]/80 transition-colors text-sm">
                {t.upgradeLabel}
              </Link>
            </div>
          </FadeIn>
        )}

        {/* FAQ */}
        <FadeIn delay={0.4}>
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-center gap-2 mb-6">
              <span className="w-1 h-5 bg-[#F59E0B] rounded-full" />
              <h2 className="text-xl font-bold text-white">{t.faqTitle}</h2>
            </div>
            <div className="space-y-4">
              {[
                { q: t.faq1q, a: t.faq1a },
                { q: t.faq2q, a: t.faq2a },
                { q: t.faq3q, a: t.faq3a },
              ].map(({ q, a }) => (
                <div key={q} className="border border-bg-border bg-bg-surface/60 rounded-lg p-5">
                  <p className="text-sm font-semibold text-white mb-2">{q}</p>
                  <p className="text-xs text-muted leading-relaxed">{a}</p>
                </div>
              ))}
            </div>
          </div>
        </FadeIn>

        {/* Disclaimer */}
        <FadeIn delay={0.5}>
          <p className="text-center text-[10px] text-muted/40 mt-12">{t.disclaimer}</p>
        </FadeIn>
      </main>

      <Footer />
    </div>
  );
}
