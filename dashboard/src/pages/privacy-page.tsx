import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PublicNavbar } from '../components/public-navbar';
import { Footer } from '../components/footer';
import { COLORS } from '../lib/stitch-design-tokens';

type Lang = 'en' | 'vi';

const COPY: Record<Lang, Record<string, string>> = {
  en: {
    langToggle: 'Tiếng Việt',
    title: 'Privacy Policy',
    description: 'CashClaw collects your email address and authentication credentials to provide the service. We do not sell your data to third parties.',
    credentialsNote: 'Your Polymarket wallet credentials are stored encrypted and used solely to execute market making operations on your behalf.',
    supportNote: 'Full privacy policy coming soon. For questions contact',
    backToHome: 'Back to home',
  },
  vi: {
    langToggle: 'English',
    title: 'Chính Sách Quyền Riêng Tư',
    description: 'CashClaw thu thập địa chỉ email và thông tin xác thực của bạn để cung cấp dịch vụ. Chúng tôi không bán dữ liệu của bạn cho bên thứ ba.',
    credentialsNote: 'Thông tin xác thực ví Polymarket của bạn được lưu trữ mã hóa và chỉ được sử dụng để thực hiện giao dịch tạo lãi thị trường thay mặt bạn.',
    supportNote: 'Chính sách quyền riêng tư đầy đủ sắp ra mắt. Với câu hỏi vui lòng liên hệ',
    backToHome: 'Về trang chủ',
  },
};

export function PrivacyPage() {
  const [lang, setLang] = useState<Lang>('en');
  const t = COPY[lang];
  const langLabel = lang === 'en' ? 'VI' : 'EN';

  return (
    <div className="min-h-screen bg-[${COLORS.bg}] text-[${COLORS.onSurface}] font-sans">
      <PublicNavbar />

      <div className="flex justify-end px-4 sm:px-6 pt-4">
        <button
          onClick={() => setLang((l: Lang) => (l === 'en' ? 'vi' : 'en'))}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors self-start"
          style={{
            backgroundColor: COLORS.surface,
            border: `1px solid ${COLORS.outline}`,
            color: COLORS.onSurfaceVariant,
          }}
          aria-label="Toggle language"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10A15.3 15.3 0 0 1 12 2z" />
          </svg>
          {langLabel}
        </button>
      </div>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <h1 className="text-2xl font-bold text-white mb-6">
          {t.title}
        </h1>

        <div className="bg-[${COLORS.surface}]/80 backdrop-blur-xl border border-[${COLORS.outline}] rounded-2xl p-6 sm:p-8 space-y-4">
          <p className="text-[${COLORS.onSurfaceVariant}] text-sm leading-relaxed">
            {t.description}
          </p>
          <p className="text-[${COLORS.onSurfaceVariant}] text-sm leading-relaxed">
            {t.credentialsNote}
          </p>
          <p className="text-[${COLORS.onSurfaceVariant}] text-sm leading-relaxed">
            {t.supportNote}{' '}
            <a
              href="mailto:support@cashclaw.cc"
              className="text-[${COLORS.primary}] hover:underline"
            >
              support@cashclaw.cc
            </a>
            .
          </p>
        </div>

        <div className="mt-6">
          <Link
            to="/"
            className="text-[${COLORS.primary}] text-sm hover:underline"
          >
            &larr; {t.backToHome}
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default PrivacyPage;
