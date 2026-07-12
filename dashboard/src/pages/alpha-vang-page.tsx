/**
 * Alpha Vang Page — "Alpha Vang Energy 9 Solution" product page.
 * Bilingual VN+EN. Tier-gated: FREE sees upsell, BASIC+ sees full content.
 * Stitch dark fintech pattern.
 *
 * Route: /alpha-vang
 */

import { useState, useEffect, useRef } from 'react';
import { motion, useInView } from 'motion/react';
import { Link } from 'react-router-dom';
import { PublicNavbar } from '../components/public-navbar';
import { Footer } from '../components/footer';
import { COLORS } from '../lib/stitch-design-tokens';
import { useAuthStore } from '../stores/auth-store';

type Lang = 'en' | 'vi';

const COPY: Record<Lang, Record<string, string>> = {
 en: {
   langToggle: 'Tiếng Việt',
   title: 'Alpha Vang',
   subtitle: 'The only arbitrage system that turns Polymarket inefficiencies into consistent monthly income.',
   badge: 'Alpha Vang',
   headline: 'Energy 9 Solution',
   cta: 'Get Started',
   ctaLocked: 'Upgrade to Access',
   tierRequired: 'BASIC',
   overviewTitle: 'What you get',
   feat1: 'Triangular arbitrage across 100+ prediction markets',
   feat2: 'Auto-execution with Kelly Criterion sizing',
   feat3: 'Real-time signal feed via SSE (PRO+)',
   feat4: 'Backtesting engine with Sharpe / max-drawdown metrics',
   feat5: "24/7 scanning — no manual monitoring needed",
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
   langToggle: 'English',
   title: 'Alpha Vang',
   subtitle: 'Hệ thống arbitrage duy nhất biến sai lệch thị trường Polymarket thành thu nhập tháng ổn định.',
   badge: 'Alpha Vang',
   headline: 'Giải pháp Năng lượng 9',
   cta: 'Bắt đầu',
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
   <svg width="13" height="13" fill="none" stroke={COLORS.profit} strokeWidth="2.5" viewBox="0 0 24 24">
     <polyline points="20 6 9 17 4 12" />
   </svg>
 );
}

const glassCard = (extra = '') =>
 `bg-[${COLORS.surface}]/80 backdrop-blur-xl border border-[${COLORS.outline}] rounded-2xl ${extra}`.trim();

// ---- Tier gate simulation (replace with real auth check later) ----
// For Phase 01 A3 compliance: FREE users see locked state.
// In production, this reads from Better Auth session + D1 tier.
type AppTier = 'free' | 'pro' | 'enterprise';

function userHasAccess(tier: AppTier): boolean {
  return tier !== 'free';
}

export function AlphaVangPage() {
  const { tier: rawTier, fetchMe } = useAuthStore();
  const [lang, setLang] = useState<Lang>('en');
  const [tierReady, setTierReady] = useState(false);
  const t = COPY[lang];

  const tier: AppTier = (rawTier ?? 'free').toLowerCase() as AppTier;
  const hasAccess = tierReady && userHasAccess(tier);
  const langLabel = lang === 'en' ? COPY.vi.langToggle : COPY.en.langToggle;

  useEffect(() => {
    fetchMe().finally(() => setTierReady(true));
  }, [fetchMe]);

 return (
   <div className="min-h-screen bg-[${COLORS.bg}] text-[${COLORS.onSurface}] font-sans">
     <PublicNavbar />

     <main className="flex-1 pt-24 pb-16 px-4 sm:px-6 max-w-6xl mx-auto w-full">
       {/* Language toggle */}
       <FadeIn>
         <div className="flex justify-end mb-6">
           <button
             onClick={() => setLang(lang === 'en' ? 'vi' : 'en')}
             className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors rounded-lg"
             style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.outline}`, color: COLORS.onSurfaceVariant }}
             aria-label="Toggle language"
           >
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
               <circle cx="12" cy="12" r="10" />
               <line x1="2" y1="12" x2="22" y2="12" />
               <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
             </svg>
             {langLabel}
           </button>
         </div>
       </FadeIn>

       {/* Hero */}
       <FadeIn>
         <div className="text-center mb-16">
           <div className="inline-flex items-center gap-2 mb-4">
             <span className="w-1 h-4 rounded-full" style={{ backgroundColor: COLORS.profit }} />
             <p className="text-xs uppercase tracking-widest font-mono font-bold" style={{ color: COLORS.profit }}>{t.badge}</p>
           </div>
           <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4">{t.headline}</h1>
           <p className="text-sm sm:text-base max-w-2xl mx-auto mb-8" style={{ color: COLORS.onSurfaceVariant }}>{t.subtitle}</p>

           {hasAccess ? (
             <Link
               to="/app"
               className="inline-block font-bold px-8 py-3 rounded hover:opacity-80 transition-colors text-sm text-white"
               style={{ backgroundColor: COLORS.profit }}
             >
               {t.cta}
             </Link>
           ) : (
             <div className="space-y-3">
               <p className="text-xs" style={{ color: COLORS.onSurfaceVariant }}>
                 {t.ctaLocked} — requires <span className="font-bold" style={{ color: COLORS.profit }}>{t.tierRequired}</span> tier
               </p>
               <Link
                 to="/pricing"
                 className="inline-block font-bold px-8 py-3 rounded hover:opacity-80 transition-colors text-sm text-white"
                 style={{ backgroundColor: COLORS.profit }}
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
             <span className="w-1 h-5 rounded-full" style={{ backgroundColor: COLORS.profit }} />
             <h2 className="text-xl font-bold text-white">{t.overviewTitle}</h2>
           </div>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
             {[t.feat1, t.feat2, t.feat3, t.feat4, t.feat5, t.feat6].map((feat) => (
               <div
                 key={feat}
                 className={`flex items-start gap-3 p-4 ${glassCard()} ${hasAccess ? '' : 'opacity-60'}`}
               >
                 <span className="flex-shrink-0 mt-0.5"><CheckIcon /></span>
                 <span className="text-sm" style={{ color: COLORS.onSurfaceVariant }}>{feat}</span>
               </div>
             ))}
           </div>
         </div>
       </FadeIn>

       {/* How it works */}
       <FadeIn delay={0.2}>
         <div className="mb-16 max-w-2xl mx-auto">
           <div className="flex items-center justify-center gap-2 mb-8">
             <span className="w-1 h-5 rounded-full" style={{ backgroundColor: COLORS.profit }} />
             <h2 className="text-xl font-bold text-white">{t.howTitle}</h2>
           </div>
           <ol className="space-y-4">
             {[t.step1, t.step2, t.step3, t.step4, t.step5].map((step, i) => (
               <li key={i} className="flex gap-4">
                 <span
                   className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${hasAccess ? '' : ''}`}
                   style={hasAccess ? { backgroundColor: `${COLORS.profit}26`, border: `1px solid ${COLORS.profit}66`, color: COLORS.profit } : { backgroundColor: COLORS.surface, border: `1px solid ${COLORS.outline}`, color: COLORS.onSurfaceVariant }}
                 >
                   {i + 1}
                 </span>
                 <p className="text-sm pt-0.5" style={{ color: hasAccess ? COLORS.onSurfaceVariant : `${COLORS.onSurfaceVariant}99` }}>{step}</p>
               </li>
             ))}
           </ol>
         </div>
       </FadeIn>

       {/* Upgrade CTA (shown when locked) */}
       {!hasAccess && (
         <FadeIn delay={0.3}>
           <div className={glassCard('p-6 max-w-xl mx-auto text-center')}>
             <p className="text-sm font-bold text-white mb-2">{t.upgradeTitle}</p>
             <p className="text-xs mb-4" style={{ color: COLORS.onSurfaceVariant }}>{t.upgradeSub}</p>
             <Link
               to="/pricing"
               className="inline-block font-bold px-6 py-2.5 rounded hover:opacity-80 transition-colors text-sm text-white"
               style={{ backgroundColor: COLORS.profit }}
             >
               {t.upgradeLabel}
             </Link>
           </div>
         </FadeIn>
       )}

       {/* FAQ */}
       <FadeIn delay={0.4}>
         <div className="max-w-2xl mx-auto">
           <div className="flex items-center justify-center gap-2 mb-6">
             <span className="w-1 h-5 rounded-full" style={{ backgroundColor: COLORS.profit }} />
             <h2 className="text-xl font-bold text-white">{t.faqTitle}</h2>
           </div>
           <div className="space-y-4">
             {[
               { q: t.faq1q, a: t.faq1a },
               { q: t.faq2q, a: t.faq2a },
               { q: t.faq3q, a: t.faq3a },
             ].map(({ q, a }) => (
               <div key={q} className={glassCard('p-5')}>
                 <p className="text-sm font-semibold text-white mb-2">{q}</p>
                 <p className="text-xs leading-relaxed" style={{ color: COLORS.onSurfaceVariant }}>{a}</p>
               </div>
             ))}
           </div>
         </div>
       </FadeIn>

       {/* Disclaimer */}
       <FadeIn delay={0.5}>
         <p className="text-center text-[10px] mt-12" style={{ color: `${COLORS.onSurfaceVariant}66` }}>{t.disclaimer}</p>
       </FadeIn>
     </main>

     <Footer />
   </div>
 );
}
