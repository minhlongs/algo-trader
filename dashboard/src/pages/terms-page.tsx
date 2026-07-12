/**
 * Terms of Service — Stitch dark fintech bilingual VN+EN pattern.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PublicNavbar } from '../components/public-navbar';
import { Footer } from '../components/footer';
import { COLORS } from '../lib/stitch-design-tokens';

/* ── i18n ── */

type Lang = 'en' | 'vi';

const COPY: Record<Lang, Record<string, string>> = {
  en: {
    langToggle: 'Tiếng Việt',
    title: 'Terms of Service',
    subtitle: 'Terms governing your use of CashClaw',
    p1: 'By using CashClaw you agree to trade responsibly. CashClaw is an automation tool — you remain responsible for all activity in your Polymarket account.',
    p2: 'CashClaw does not provide financial advice. All trading involves risk. Daily loss caps and position limits are safety features, not guarantees against loss.',
    p3: 'Full terms coming soon. For questions contact',
    email: 'support@cashclaw.cc',
    backToHome: '← Back to home',
  },
  vi: {
    langToggle: 'English',
    title: 'Điều khoản dịch vụ',
    subtitle: 'Các điều khoản chi phối việc sử dụng CashClaw của bạn',
    p1: 'Bằng cách sử dụng CashClaw, bạn đồng ý giao dịch có trách nhiệm. CashClaw là công cụ tự động hóa — bạn vẫn chịu trách nhiệm về mọi hoạt động trong tài khoản Polymarket của mình.',
    p2: 'CashClaw không cung cấp lời khuyên tài chính. Mọi giao dịch đều có rủi ro. Giới hạn lỗ hàng ngày và giới hạn vị thế là tính năng an toàn, không phải đảm bảo chống lại lỗ.',
    p3: 'Điều khoản đầy đủ sẽ sớm có. Hãy liên hệ với chúng tôi qua email',
    email: 'support@cashclaw.cc',
    backToHome: '← Về trang chủ',
  },
};

export function TermsPage() {
  const [lang, setLang] = useState<Lang>('en');
  const t = COPY[lang];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e3e2e2] font-sans">
      <PublicNavbar />

      {/* Language toggle — globe SVG pinned to top-right */}
      <button
        onClick={() => setLang(lang === 'en' ? 'vi' : 'en')}
        className="fixed top-4 right-4 z-50 p-2 rounded-full bg-[#121414]/80 backdrop-blur-xl border border-[#414754] hover:border-[#aec6ff] transition-colors"
        aria-label={t.langToggle}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke={COLORS.onSurface}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-5 h-5"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      </button>

      <main className="flex-1 max-w-3xl mx-auto px-4 sm:px-6 py-20">
        <h1 className="text-2xl font-bold text-[#e3e2e2] mb-2">
          {t.title}
        </h1>
        <p className="text-[#8892B0] text-sm leading-relaxed mb-6">
          {t.subtitle}
        </p>

        <div className="glass-card p-6 space-y-4">
          <p className="text-[#c1c6d7] text-sm leading-relaxed">
            {t.p1}
          </p>
          <p className="text-[#c1c6d7] text-sm leading-relaxed">
            {t.p2}
          </p>
          <p className="text-[#c1c6d7] text-sm leading-relaxed">
            {t.p3}{' '}
            <a
              href={`mailto:${t.email}`}
              className="text-[#aec6ff] hover:underline"
            >
              {t.email}
            </a>
            .
          </p>
        </div>

        <Link
          to="/"
          className="inline-block mt-8 text-[#aec6ff] text-sm hover:underline"
        >
          {t.backToHome}
        </Link>
      </main>

      <Footer />
    </div>
  );
}

export default TermsPage;
