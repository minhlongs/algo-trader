import { useState, useRef, useCallback } from 'react';
import { motion, useInView } from 'motion/react';
import { PublicNavbar } from '../components/public-navbar';
import { Footer } from '../components/footer';
import { ENTERPRISE_PLANS, type EnterprisePlanKey } from '../lib/enterprise-plans';
import { COLORS } from '../lib/stitch-design-tokens';

type Tab = 'pricing' | 'contact' | 'success';
type Lang = 'en' | 'vi';
type FormState = 'idle' | 'submitting' | 'success' | 'error';

interface FormFields {
  email: string;
  companyName: string;
  contactName: string;
  tier: EnterprisePlanKey;
  useCase: string;
  teamSize: string;
}

const COPY: Record<Lang, Record<string, string>> = {
  en: {
    langToggle: 'Tiếng Việt',
    tabPricing: 'Pricing',
    tabContact: 'Contact',
    tabSuccess: 'Success',
    badge: 'Enterprise',
    titlePricing: 'Built for traders ready to scale',
    subtitlePricing:
      'Monthly contracts, dedicated support, and custom integrations. Pricing is invoice-based — our team works with you on terms.',
    selfServeQ: 'Looking for self-serve?',
    selfServeSub: 'Individual and small-team plans start free. Upgrade to Pro for $99/month via our standard checkout.',
    viewStandardPricing: 'View standard pricing',
    faqTitle: 'Enterprise FAQ',
    faq1q: 'How does billing work?',
    faq1a:
      'Enterprise plans are billed monthly via invoice. No credit card or self-serve checkout — our team sends a custom proposal after the discovery call.',
    faq2q: 'Can I try before committing?',
    faq2a: 'Yes. A 30-day paper-trading demo is provisioned automatically when you submit a contact form. No payment required.',
    faq3q: 'What SLA is included?',
    faq3a: 'PRO: next-business-day response. ENTERPRISE: 4-hour response. MASTER: 1-hour response with 99.9% uptime commitment.',
    faq4q: 'Is a custom contract available?',
    faq4a: 'Yes. All enterprise plans include a custom MSA. BAA and DPA available on MASTER tier.',
    contactTitle: 'Talk to our team',
    contactSub:
      'Enterprise plans are invoice-based with dedicated onboarding. Fill in the form and we will reach out within 24 hours.',
    planInterest: 'Plan interest',
    emailLabel: 'Work email *',
    contactNameLabel: 'Contact name *',
    companyNameLabel: 'Company name *',
    teamSizeLabel: 'Team size',
    useCaseLabel: 'How will you use the platform? *',
    useCasePlaceholder: 'Describe your workflow, volume expectations, and key requirements...',
    selectTeamSize: 'Select...',
    emailPlaceholder: 'you@company.com',
    namePlaceholder: 'Your full name',
    companyPlaceholder: 'Acme Capital',
    submitting: 'Sending...',
    requestAccess: '{cta}',
    noPaymentNote: 'No payment required. Invoice-based close only.',
    successHeadline: 'Inquiry received',
    successSub: 'Our team will reach out within 24 hours to schedule a walkthrough and discuss contract terms.',
    whatNext: 'What happens next',
    nextStep1Title: 'Account team assignment (today)',
    nextStep1Desc: 'An Account Manager is notified and will claim your inquiry.',
    nextStep2Title: 'Intro call (within 24 h)',
    nextStep2Desc: 'Your Account Manager schedules a 30-minute discovery call to understand your requirements.',
    nextStep3Title: 'Custom proposal',
    nextStep3Desc: 'We send a tailored contract and invoice — no card required.',
    nextStep4Title: 'Onboarding',
    nextStep4Desc: 'Dedicated onboarding session, API setup, and strategy configuration.',
    demoTabTitle: 'Paper-trading demo',
    demoTabSub: 'A 30-day paper-trading demo environment has been provisioned for your team. Check your inbox for credentials — no payment or setup required.',
    readDocs: 'Read the docs',
    backToHome: 'Back to home',
    mostPopular: 'MOST POPULAR',
  },
  vi: {
    langToggle: 'English',
    tabPricing: 'Bảng giá',
    tabContact: 'Liên hệ',
    tabSuccess: 'Hoàn tất',
    badge: 'Doanh nghiệp',
    titlePricing: 'Dành cho trader muốn mở rộng quy mô',
    subtitlePricing: 'Hợp đồng hàng tháng, hỗ trợ riêng và tích hợp tùy chỉnh. Giá theo hóa đơn — đội ngũ sẽ thỏa thuận điều khoản với bạn.',
    selfServeQ: 'Tự phục vụ?',
    selfServeSub: 'Gói cá nhân và nhóm nhỏ bắt đầu miễn phí. Nâng cấp lên Pro $99/tháng qua thanh toán tiêu chuẩn.',
    viewStandardPricing: 'Xem bảng giá tiêu chuẩn',
    faqTitle: 'Câu hỏi thường gặp',
    faq1q: 'Thanh toán như thế nào?',
    faq1a: 'Gói doanh nghiệp thanh toán hàng tháng qua hóa đơn. Không cần thẻ hay thanh toán tự phục vụ — đội ngũ gửi đề xuất riêng sau cuộc gọi.',
    faq2q: 'Có thể dùng thử trước?',
    faq2a: 'Có. Demo paper-trading 30 ngày tự động kích hoạt khi gửi form. Không cần thanh toán.',
    faq3q: 'SLA được bao gồm?',
    faq3a: 'PRO: phản hồi trong ngày làm việc. ENTERPRISE: 4 giờ. MASTER: 1 giờ với cam kết uptime 99.9%.',
    faq4q: 'Có hợp đồng tùy chỉnh?',
    faq4a: 'Có. Mọi gói doanh nghiệp đều có MSA tùy chỉnh. BAA và DPA có ở tier MASTER.',
    contactTitle: 'Liên hệ đội ngũ',
    contactSub: 'Gói doanh nghiệp theo hóa đơn với onboarding riêng. Điền form và chúng tôi sẽ liên hệ trong 24 giờ.',
    planInterest: 'Gói quan tâm',
    emailLabel: 'Email công việc *',
    contactNameLabel: 'Tên người liên hệ *',
    companyNameLabel: 'Tên công ty *',
    teamSizeLabel: 'Quy mô nhóm',
    useCaseLabel: 'Bạn sẽ sử dụng nền tảng như thế nào? *',
    useCasePlaceholder: 'Mô tả quy trình, khối lượng giao dịch và yêu cầu chính...',
    selectTeamSize: 'Chọn...',
    emailPlaceholder: 'ban@congty.com',
    namePlaceholder: 'Họ và tên',
    companyPlaceholder: 'Công ty ABC',
    submitting: 'Đang gửi...',
    requestAccess: 'Yêu cầu truy cập doanh nghiệp',
    noPaymentNote: 'Không cần thanh toán. Chỉ kết thúc theo hóa đơn.',
    successHeadline: 'Đã nhận yêu cầu',
    successSub: 'Đội ngũ sẽ liên hệ trong 24 giờ để lên lịch giới thiệu và thảo luận điều khoản hợp đồng.',
    whatNext: 'Tiếp theo',
    nextStep1Title: 'Phân công đội ngũ (hôm nay)',
    nextStep1Desc: 'Account Manager được thông báo và sẽ nhận xử lý yêu cầu của bạn.',
    nextStep2Title: 'Cuộc gọi giới thiệu (trong 24 h)',
    nextStep2Desc: 'Account Manager lên lịch cuộc gọi 30 phút để hiểu yêu cầu của bạn.',
    nextStep3Title: 'Đề xuất tùy chỉnh',
    nextStep3Desc: 'Chúng tôi gửi hợp đồng và hóa đơn riêng — không cần thẻ.',
    nextStep4Title: 'Triển khai',
    nextStep4Desc: 'Session onboarding riêng, cài đặt API và cấu hình chiến lược.',
    demoTabTitle: 'Demo paper-trading',
    demoTabSub: 'Môi trường demo paper-trading 30 ngày đã được cấp phát cho đội của bạn. Kiểm tra hộp thư để lấy thông tin đăng nhập.',
    readDocs: 'Đọc tài liệu',
    backToHome: 'Về trang chủ',
    mostPopular: 'PHỔ BIẾN NHẤT',
  },
};

const TEAM_SIZE_OPTIONS = ['1-10', '11-50', '51-200', '201-500', '500+'];

function glassCard(extra = ''): string {
  return `bg-[#121414]/80 backdrop-blur-xl border border-[#414754] rounded-2xl ${extra}`.trim();
}

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

function PlanCard({
  planKey,
  plan,
  highlight,
  onSelect,
  mostPopular,
  cta,
}: {
  planKey: EnterprisePlanKey;
  plan: (typeof ENTERPRISE_PLANS)[EnterprisePlanKey];
  highlight: boolean;
  onSelect: (key: EnterprisePlanKey) => void;
  mostPopular: string;
  cta: string;
}) {
  return (
    <div
      className={`relative rounded-2xl p-6 flex flex-col gap-5 ${
        highlight ? 'border-2 border-[#F59E0B]' : 'border border-[#414754]'
      } ${glassCard()}`}
    >
      {highlight && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#F59E0B] text-black text-xs font-bold px-3 py-0.5 rounded-full">
          {mostPopular}
        </span>
      )}

      <div>
        <p className="text-xs uppercase tracking-widest mb-2" style={{ color: COLORS.onSurfaceVariant }}>
          {plan.name}
        </p>
        <p className="text-white text-3xl font-bold mb-1">{plan.price}</p>
        <p className="text-xs" style={{ color: COLORS.onSurfaceVariant }}>
          {plan.tagline}
        </p>
      </div>

      <ul className="space-y-2.5 flex-1">
        {plan.features.map((feat) => (
          <li key={feat} className="flex items-start gap-2 text-xs" style={{ color: COLORS.onSurfaceVariant }}>
            <span className="flex-shrink-0 mt-0.5">
              <CheckIcon />
            </span>
            <span>{feat}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={() => onSelect(planKey)}
        className={`text-center text-sm font-bold px-4 py-2.5 rounded transition-colors ${
          highlight ? 'bg-[#F59E0B] text-black hover:bg-[#F59E0B]/80' : 'border border-[#414754] hover:border-[#F59E0B]/50'
        }`}
        style={!highlight ? { color: COLORS.onSurfaceVariant } : undefined}
      >
        {cta}
      </button>
    </div>
  );
}

function PricingTab({ t, onSelectTier }: { t: Record<string, string>; onSelectTier: (key: EnterprisePlanKey) => void }) {
const faqs = [
    { q: 'faq1q', a: 'faq1a' },
    { q: 'faq2q', a: 'faq2a' },
    { q: 'faq3q', a: 'faq3a' },
    { q: 'faq4q', a: 'faq4a' },
  ];
  return (
    <>
      <FadeIn>
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-2 mb-3">
            <span className="w-1 h-4 rounded-full" style={{ backgroundColor: COLORS.profit }} />
            <p className="text-xs uppercase tracking-widest font-mono font-bold" style={{ color: COLORS.profit }}>
              Enterprise
            </p>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">{t.titlePricing}</h1>
          <p className="text-sm max-w-lg mx-auto" style={{ color: COLORS.onSurfaceVariant }}>
            {t.subtitlePricing}
          </p>
        </div>
      </FadeIn>

      <FadeIn delay={0.1}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {(Object.entries(ENTERPRISE_PLANS) as [EnterprisePlanKey, (typeof ENTERPRISE_PLANS)[EnterprisePlanKey]][]).map(
            ([key, plan]) => (
              <PlanCard key={key} planKey={key} plan={plan} highlight={key === 'enterprise'} onSelect={onSelectTier} mostPopular={t.mostPopular} cta={t.requestAccess} />
            )
          )}
        </div>
      </FadeIn>

      <FadeIn delay={0.2}>
        <div className={glassCard('p-6 mb-16 max-w-2xl mx-auto text-center')}>
          <p className="text-xs uppercase tracking-widest mb-3" style={{ color: COLORS.onSurfaceVariant }}>
            {t.selfServeQ}
          </p>
          <p className="text-sm mb-4" style={{ color: COLORS.onSurfaceVariant }}>
            {t.selfServeSub}
          </p>
          <a
            href="/pricing"
            className="inline-block text-sm border border-[#414754] px-5 py-2 rounded transition-colors"
            style={{ color: COLORS.onSurfaceVariant }}
          >
            {t.viewStandardPricing}
          </a>
        </div>
      </FadeIn>

      <FadeIn delay={0.3}>
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-center gap-2 mb-6">
            <span className="w-1 h-5 rounded-full" style={{ backgroundColor: COLORS.profit }} />
            <h2 className="text-xl font-bold text-white">{t.faqTitle}</h2>
          </div>
          <div className="space-y-4">
            {faqs.map(({ q, a }) => (
              <div key={q} className={glassCard('p-5')}>
                <p className="text-sm font-semibold text-white mb-2">{t[q]}</p>
                <p className="text-xs leading-relaxed" style={{ color: COLORS.onSurfaceVariant }}>
                  {t[a]}
                </p>
              </div>
            ))}
          </div>
        </div>
      </FadeIn>
    </>
  );
}

const inputCls =
  'w-full bg-[#121414]/80 backdrop-blur-xl border border-[#414754] text-white text-sm rounded px-3 py-2.5 outline-none focus:border-[#F59E0B]/60 transition-colors placeholder-[#c1c6d7]/50';

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-xs mb-1.5" style={{ color: COLORS.onSurfaceVariant }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function ContactTab({ t, defaultTier, onSuccess }: { t: Record<string, string>; defaultTier: EnterprisePlanKey; onSuccess: () => void }) {
  const [fields, setFields] = useState<FormFields>({
    email: '',
    companyName: '',
    contactName: '',
    tier: defaultTier,
    useCase: '',
    teamSize: '',
  });
  const [formState, setFormState] = useState<FormState>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  function set(key: keyof FormFields, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setFormState('submitting');
    setErrorMsg('');

    try {
      const res = await fetch('/api/v1/enterprise/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: fields.email.trim(),
          companyName: fields.companyName.trim(),
          contactName: fields.contactName.trim(),
          tier: fields.tier,
          useCase: fields.useCase.trim(),
          teamSize: fields.teamSize || undefined,
        }),
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }

      setFormState('success');
      onSuccess();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setFormState('error');
    }
  }, [fields, onSuccess]);

  return (
    <div className="max-w-xl mx-auto">
      <FadeIn>
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-1 h-4 rounded-full" style={{ backgroundColor: COLORS.profit }} />
            <p className="text-xs uppercase tracking-widest font-mono font-bold" style={{ color: COLORS.profit }}>
              {t.badge}
            </p>
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">{t.contactTitle}</h1>
          <p className="text-sm" style={{ color: COLORS.onSurfaceVariant }}>
            {t.contactSub}
          </p>
        </div>
      </FadeIn>

      <FadeIn delay={0.1}>
        <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-5">
          <div>
            <label className="block text-xs mb-1.5" style={{ color: COLORS.onSurfaceVariant }}>
              {t.planInterest}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(ENTERPRISE_PLANS) as [EnterprisePlanKey, (typeof ENTERPRISE_PLANS)[EnterprisePlanKey]][]).map(
                ([key, plan]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => set('tier', key)}
                    className={`p-3 rounded border text-xs text-left transition-colors min-h-touch ${
                      fields.tier === key
                        ? 'border-[#F59E0B] bg-[#F59E0B]/10 text-white'
                        : 'border-[#414754] hover:border-[#F59E0B]/40'
                    }`}
                    style={fields.tier !== key ? { color: COLORS.onSurfaceVariant } : undefined}
                  >
                    <p className="font-bold text-sm mb-0.5">{plan.price}</p>
                    <p className="text-[10px] opacity-70">{plan.name}</p>
                  </button>
                )
              )}
            </div>
          </div>

          <Field label={t.emailLabel} htmlFor="email">
            <input
              id="email"
              type="email"
              required
              value={fields.email}
              onChange={(e) => set('email', e.target.value)}
              className={inputCls}
              placeholder={t.emailPlaceholder}
            />
          </Field>

          <Field label={t.contactNameLabel} htmlFor="contactName">
            <input
              id="contactName"
              type="text"
              required
              value={fields.contactName}
              onChange={(e) => set('contactName', e.target.value)}
              className={inputCls}
              placeholder={t.namePlaceholder}
            />
          </Field>

          <Field label={t.companyNameLabel} htmlFor="companyName">
            <input
              id="companyName"
              type="text"
              required
              value={fields.companyName}
              onChange={(e) => set('companyName', e.target.value)}
              className={inputCls}
              placeholder={t.companyPlaceholder}
            />
          </Field>

          <Field label={t.teamSizeLabel} htmlFor="teamSize">
            <select
              id="teamSize"
              value={fields.teamSize}
              onChange={(e) => set('teamSize', e.target.value)}
              className={inputCls}
            >
              <option value="">{t.selectTeamSize}</option>
              {TEAM_SIZE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>

          <Field label={t.useCaseLabel} htmlFor="useCase">
            <textarea
              id="useCase"
              required
              minLength={20}
              value={fields.useCase}
              onChange={(e) => set('useCase', e.target.value)}
              rows={4}
              className={`${inputCls} resize-none`}
              placeholder={t.useCasePlaceholder}
            />
          </Field>

          {formState === 'error' && (
            <p
              className="text-xs border rounded px-3 py-2"
              style={{ color: COLORS.loss, borderColor: `${COLORS.loss}4d`, backgroundColor: `${COLORS.loss}1a` }}
            >
              {errorMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={formState === 'submitting'}
            className="w-full bg-[#F59E0B] text-black font-bold py-3 rounded hover:bg-[#F59E0B]/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-touch"
          >
            {formState === 'submitting' ? t.submitting : t.requestAccess}
          </button>

          <p className="text-xs text-center" style={{ color: `${COLORS.onSurfaceVariant}80` }}>
            {t.noPaymentNote}
          </p>
        </form>
      </FadeIn>
    </div>
  );
}

function SuccessTab({ t }: { t: Record<string, string> }) {
  const steps = [
    { n: '1', title: 'nextStep1Title', desc: 'nextStep1Desc' },
    { n: '2', title: 'nextStep2Title', desc: 'nextStep2Desc' },
    { n: '3', title: 'nextStep3Title', desc: 'nextStep3Desc' },
    { n: '4', title: 'nextStep4Title', desc: 'nextStep4Desc' },
  ];
  return (
    <div className="max-w-xl mx-auto">
      <FadeIn>
        <div className="text-center mb-10">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-full border mb-6"
            style={{ backgroundColor: `${COLORS.profit}1a`, borderColor: `${COLORS.profit}4d` }}
          >
            <svg width="28" height="28" fill="none" stroke="#34D399" strokeWidth="2" viewBox="0 0 24 24">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">{t.successHeadline}</h1>
          <p className="text-sm max-w-sm mx-auto" style={{ color: COLORS.onSurfaceVariant }}>
            {t.successSub}
          </p>
        </div>

        <div className={glassCard('p-6 mb-6')}>
          <div className="flex items-center gap-2 mb-4">
            <span className="w-1 h-4 rounded-full" style={{ backgroundColor: COLORS.profit }} />
            <h2 className="text-xs font-mono font-bold uppercase tracking-widest" style={{ color: COLORS.profit }}>
              {t.whatNext}
            </h2>
          </div>
          <ol className="space-y-4">
            {steps.map((step) => (
              <li key={step.n} className="flex gap-3">
                <span
                  className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center font-bold text-xs"
                  style={{ backgroundColor: `${COLORS.profit}26`, border: `1px solid ${COLORS.profit}66`, color: COLORS.profit }}
                >
                  {step.n}
                </span>
                <div>
                  <p className="text-sm text-white font-semibold mb-0.5">{t[step.title]}</p>
                  <p className="text-xs" style={{ color: COLORS.onSurfaceVariant }}>{t[step.desc]}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div
          className="rounded-2xl p-5 mb-8"
          style={{ backgroundColor: `${COLORS.warning}0d`, border: `1px solid ${COLORS.warning}33` }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="w-1 h-4 rounded-full" style={{ backgroundColor: COLORS.warning }} />
            <p className="text-xs uppercase tracking-widest font-mono font-bold" style={{ color: COLORS.warning }}>
              {t.demoTabTitle}
            </p>
          </div>
          <p className="text-sm" style={{ color: COLORS.onSurfaceVariant }}>
            {t.demoTabSub}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href="/docs"
            className="text-center text-sm border border-[#414754] px-5 py-2.5 rounded transition-colors"
            style={{ color: COLORS.onSurfaceVariant }}
          >
            {t.readDocs}
          </a>
          <a
            href="/"
            className="text-center text-sm bg-[#F59E0B] text-black font-bold px-5 py-2.5 rounded hover:bg-[#F59E0B]/80 transition-colors"
          >
            {t.backToHome}
          </a>
        </div>
      </FadeIn>
    </div>
  );
}

export function EnterprisePage() {
  const [activeTab, setActiveTab] = useState<Tab>('pricing');
  const [selectedTier, setSelectedTier] = useState<EnterprisePlanKey>('pro');
  const [lang, setLang] = useState<Lang>('en');
  const t = COPY[lang];
  const langLabel = lang === 'en' ? COPY.vi.langToggle : COPY.en.langToggle;

  const handleSelectTier = useCallback((key: EnterprisePlanKey) => {
    setSelectedTier(key);
    setActiveTab('contact');
  }, []);

  const handleSuccess = useCallback(() => {
    setActiveTab('success');
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e3e2e2] font-sans">
      <PublicNavbar />

      <main className="flex-1 pt-24 pb-16 px-4 sm:px-6 max-w-6xl mx-auto w-full">
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

        {/* Tab navigation */}
        <div className="flex justify-center mb-10">
          <div
            className="inline-flex rounded-lg p-1"
            style={{ backgroundColor: COLORS.surfaceContainer, border: `1px solid ${COLORS.outline}` }}
          >
            {(['pricing', 'contact', 'success'] as Tab[]).map((key) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className="px-6 py-2 text-sm font-semibold rounded-md transition-colors"
                style={
                  activeTab === key
                    ? { backgroundColor: COLORS.warning, color: '#000' }
                    : { color: COLORS.onSurfaceVariant }
                }
              >
                {key === 'pricing' ? t.tabPricing : key === 'contact' ? t.tabContact : t.tabSuccess}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        {activeTab === 'pricing' ? (
          <PricingTab t={t} onSelectTier={handleSelectTier} />
        ) : activeTab === 'contact' ? (
          <ContactTab t={t} defaultTier={selectedTier} onSuccess={handleSuccess} />
        ) : (
          <SuccessTab t={t} />
        )}
      </main>

      <Footer />
    </div>
  );
}
