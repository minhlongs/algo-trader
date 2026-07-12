/**
 * Referral Dashboard Page
 * Displays referral program stats, code, commissions, and payouts
 * Stitch redesign: dark fintech, bilingual VN+EN.
 */
import { useState, useEffect, useMemo } from 'react';
import { useReferralStore } from '../stores/referral-store';
import { StitchCard, StitchCardBody, StitchCardHeader } from '../components/ui/stitch-card';
import { StitchSectionTitle } from '../components/ui/stitch-section-title';
import { StitchButton, StitchBadge } from '../components/ui/stitch-components';
import { COLORS } from '../lib/stitch-design-tokens';

const COPY = {
en: {
langToggle: 'Tiếng Việt',
title: 'Referral Program',
eyebrow: 'Growth Program',
labelYourLink: 'Your Referral Link',
btnCopyCode: 'Copy Code',
btnRegenerate: 'Regenerate',
btnGenerate: 'Generate Referral Code',
btnCopyLink: 'Copy Link',
shareThisLink: 'Share this link:',
timesUsed: 'Times Used',
status: 'Status',
active: 'Active',
inactive: 'Inactive',
statTotalClicks: 'Total Clicks',
statConversions: 'Conversions',
statRevenue: 'Total Revenue',
statCommissions: 'Commissions Earned',
unique: 'unique',
rate: 'rate',
pending: 'pending',
secRecentComm: 'Recent Commissions',
noComm: 'No commissions yet. When someone uses your referral link and becomes a paying customer, you\'ll earn 10% of their fees.',
secPayouts: 'Payout History',
noPayouts: 'No payouts yet. Payouts are processed monthly for commissions over $10.',
commissions: 'commissions',
secTopReferrers: 'Top Referrers',
secHowItWorks: 'How It Works',
step1Title: 'Share Your Link',
step1Desc: 'Use your unique referral code or link to share AlgoTrader with your network.',
step2Title: 'They Sign Up & Pay',
step2Desc: 'When someone uses your link and becomes a paying customer, we track it.',
step3Title: 'Earn 10% Commission',
step3Desc: 'You earn 10% of all fees paid by your referred tenants for 12 months. Payouts are monthly.',
},
vi: {
langToggle: 'English',
title: 'Chương Trình Giới Thiệu',
eyebrow: 'Tăng Trưởng',
labelYourLink: 'Link Giới Thiệu Của Bạn',
btnCopyCode: 'Sao Chép',
btnRegenerate: 'Tạo Mã Mới',
btnGenerate: 'Tạo Mã Giới Thiệu',
btnCopyLink: 'Sao Chép Link',
shareThisLink: 'Chia sẻ link này:',
timesUsed: 'Đã Dùng',
status: 'Trạng Thái',
active: 'Hoạt Động',
inactive: 'Không Hoạt Động',
statTotalClicks: 'Tổng Clicks',
statConversions: 'Chuyển Đổi',
statRevenue: 'Tổng Doanh Thu',
statCommissions: 'Hoa Hồng Kiếm Được',
unique: 'duy nhất',
rate: 'tỷ lệ',
pending: 'chờ xử lý',
secRecentComm: 'Hoa Hồng Gần đây',
noComm: 'Chưa có hoa hồng. Khi ai đó dùng link giới thiệu và trở thành khách hàng trả phí, bạn sẽ nhận 10% phí của họ.',
secPayouts: 'Lịch Sử Thanh Toán',
noPayouts: 'Chưa có thanh toán. Thanh toán được xử lý hàng tháng cho hoa hồng trên $10.',
commissions: 'phiên',
secTopReferrers: 'Top Giới Thiệu',
secHowItWorks: 'Cách Hoạt Động',
step1Title: 'Chia Sẻ Link',
step1Desc: 'Dùng mã giới thiệu hoặc link duy nhất của bạn để chia sẻ AlgoTrader.',
step2Title: 'Họ Đăng Ký & Trả Phí',
step2Desc: 'Khi ai đó dùng link của bạn và trở thành khách hàng trả phí, chúng tôi theo dõi.',
step3Title: 'Nhận 10% Hoa Hồng',
step3Desc: 'Bạn nhận 10% tất cả phí từ người giới thiệu trong 12 tháng. Thanh toán hàng tháng.',
},
};

type Lang = 'en' | 'vi';

function StatCard({ label, value, subtext }: { label: string; value: string | number; subtext?: string }) {
return (
<StitchCard>
<StitchCardBody>
<div className="space-y-2">
<div className="text-[10px] uppercase tracking-wider" style={{ color: COLORS.onSurfaceVariant }}>{label}</div>
<div className="text-2xl font-bold" style={{ color: COLORS.onSurface }}>{value}</div>
{subtext && <div className="text-xs" style={{ color: COLORS.profit }}>{subtext}</div>}
</div>
</StitchCardBody>
</StitchCard>
);
}

function formatCurrency(value: number): string {
return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(value);
}
function formatDate(dateString: string): string {
return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function ReferralPage() {
const [lang, setLang] = useState<Lang>('en');
const t = COPY[lang];
const { stats, referralCode, commissions, payouts, loading, error, fetchStats, fetchReferralCode, generateReferralCode, fetchCommissions, fetchPayouts } = useReferralStore();

const shareLink = useMemo(() => `${window.location.origin}/signup?ref=${referralCode?.code || ''}`, [referralCode?.code]);

useEffect(() => { loadData(); }, []);

const loadData = async () => {
await Promise.all([fetchStats(), fetchReferralCode(), fetchCommissions(undefined, 1, 20), fetchPayouts(1, 20)]);
};

const handleCopyCode = () => { if (referralCode?.code) navigator.clipboard.writeText(referralCode.code); };
const handleRegenerateCode = async () => { if (confirm('Are you sure? This will invalidate your previous code.')) await generateReferralCode(); };

return (
<div className="min-h-screen bg-[#0a0a0a] text-[#e3e2e2] font-sans">
{/* Lang toggle */}
<div className="flex justify-end px-4 sm:px-8 pt-6">
<button
onClick={() => setLang((l: Lang) => (l === 'en' ? 'vi' : 'en'))}
className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#414754] bg-[#121414]/80 text-[#c1c6d7] text-xs hover:border-[#aec6ff] hover:text-[#aec6ff] transition-colors"
aria-label="Toggle language"
>
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
<circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10" />
</svg>
{t.langToggle}
</button>
</div>

<div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-8 space-y-6">
<StitchSectionTitle title={t.title} eyebrow={t.eyebrow} />

{error && <div className="p-4 rounded-xl" style={{ backgroundColor: `${COLORS.loss}1a`, color: COLORS.loss }}>{error}</div>}

{/* Referral Code Section */}
<StitchCard>
<StitchCardHeader>
<span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: COLORS.onSurfaceVariant }}>{t.labelYourLink}</span>
</StitchCardHeader>
<StitchCardBody>
<div className="space-y-4">
<div className="flex items-center gap-4">
<div className="flex-1">
{referralCode ? (
<div className="flex items-center gap-3 flex-wrap">
<code className="px-4 py-3 rounded-xl text-sm font-mono" style={{ backgroundColor: COLORS.surface, color: COLORS.primary, border: `1px solid ${COLORS.outline}` }}>
{referralCode.code}
</code>
<StitchButton variant="secondary" onClick={handleCopyCode}>{t.btnCopyCode}</StitchButton>
<StitchButton variant="secondary" onClick={handleRegenerateCode} disabled={loading}>{t.btnRegenerate}</StitchButton>
</div>
) : <StitchButton onClick={generateReferralCode} disabled={loading}>{t.btnGenerate}</StitchButton>}
</div>
</div>

{referralCode && (
<div className="space-y-2">
<div className="text-xs" style={{ color: COLORS.onSurfaceVariant }}>{t.shareThisLink}</div>
<div className="flex items-center gap-2">
<input type="text" readOnly value={shareLink} className="flex-1 px-3 py-2 rounded-xl text-sm" style={{ backgroundColor: COLORS.surface, color: COLORS.onSurface, border: `1px solid ${COLORS.outline}` }} />
<StitchButton onClick={() => navigator.clipboard.writeText(shareLink)}>{t.btnCopyLink}</StitchButton>
</div>
</div>
)}

<div className="grid grid-cols-2 gap-4 pt-4" style={{ borderTop: `1px solid ${COLORS.outline}` }}>
<div>
<div className="text-xs" style={{ color: COLORS.onSurfaceVariant }}>{t.timesUsed}</div>
<div className="text-lg" style={{ color: COLORS.onSurface }}>{referralCode?.usedCount ?? 0}</div>
</div>
<div>
<div className="text-xs" style={{ color: COLORS.onSurfaceVariant }}>{t.status}</div>
<div className="text-lg">
{referralCode?.isActive
? <StitchBadge label={t.active} tone="profit" />
: <StitchBadge label={t.inactive} tone="loss" />}
</div>
</div>
</div>
</div>
</StitchCardBody>
</StitchCard>

{/* Stats Grid */}
{stats && (
<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
<StatCard label={t.statTotalClicks} value={stats.totalClicks.toLocaleString()} subtext={`${stats.uniqueClicks} ${t.unique}`} />
<StatCard label={t.statConversions} value={stats.conversions.toLocaleString()} subtext={`${stats.conversionRate.toFixed(1)}% ${t.rate}`} />
<StatCard label={t.statRevenue} value={formatCurrency(stats.totalRevenue)} />
<StatCard label={t.statCommissions} value={formatCurrency(stats.totalCommissions)} subtext={`${formatCurrency(stats.pendingCommissions)} ${t.pending}`} />
</div>
)}

{/* Two Column Layout */}
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
{/* Commissions */}
<StitchCard>
<StitchCardHeader>
<span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: COLORS.onSurfaceVariant }}>{t.secRecentComm}</span>
</StitchCardHeader>
<StitchCardBody>
{commissions.length === 0 ? (
<div className="text-center py-8 text-xs" style={{ color: COLORS.onSurfaceVariant }}>{t.noComm}</div>
) : (
<div className="space-y-3">
{commissions.map((c) => (
<div key={c.id} className="flex items-center justify-between p-3 rounded-xl" style={{ backgroundColor: COLORS.surface }}>
<div>
<div className="text-sm" style={{ color: COLORS.onSurface }}>{formatCurrency(c.commissionAmount)}</div>
<div className="text-xs" style={{ color: COLORS.onSurfaceVariant }}>{formatDate(c.periodStart)} – {formatDate(c.periodEnd)}</div>
</div>
<StitchBadge label={c.status} tone={c.status === 'paid' ? 'profit' : c.status === 'approved' ? 'primary' : c.status === 'void' ? 'loss' : 'warning'} />
</div>
))}
</div>
)}
</StitchCardBody>
</StitchCard>

{/* Payouts */}
<StitchCard>
<StitchCardHeader>
<span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: COLORS.onSurfaceVariant }}>{t.secPayouts}</span>
</StitchCardHeader>
<StitchCardBody>
{payouts.length === 0 ? (
<div className="text-center py-8 text-xs" style={{ color: COLORS.onSurfaceVariant }}>{t.noPayouts}</div>
) : (
<div className="space-y-3">
{payouts.map((p) => (
<div key={p.id} className="flex items-center justify-between p-3 rounded-xl" style={{ backgroundColor: COLORS.surface }}>
<div>
<div className="text-sm" style={{ color: COLORS.onSurface }}>{formatCurrency(p.amount)}</div>
<div className="text-xs" style={{ color: COLORS.onSurfaceVariant }}>{p.commissionCount} {t.commissions}</div>
</div>
<div className="text-right">
<div className="text-sm" style={{ color: COLORS.onSurface }}>{formatDate(p.paidAt || p.periodStart)}</div>
<StitchBadge label={p.status} tone={p.status === 'completed' ? 'profit' : 'neutral'} />
</div>
</div>
))}
</div>
)}
</StitchCardBody>
</StitchCard>
</div>

{/* How It Works */}
<StitchCard>
<StitchCardHeader>
<span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: COLORS.onSurfaceVariant }}>{t.secHowItWorks}</span>
</StitchCardHeader>
<StitchCardBody>
<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
{[{ title: t.step1Title, desc: t.step1Desc }, { title: t.step2Title, desc: t.step2Desc }, { title: t.step3Title, desc: t.step3Desc }].map((step, i) => (
<div key={i} className="space-y-2">
<div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm" style={{ backgroundColor: COLORS.primary, color: COLORS.onPrimary }}>{i + 1}</div>
<div className="text-sm font-bold" style={{ color: COLORS.onSurface }}>{step.title}</div>
<div className="text-xs" style={{ color: COLORS.onSurfaceVariant }}>{step.desc}</div>
</div>
))}
</div>
</StitchCardBody>
</StitchCard>
</div>
</div>
);
}

export default ReferralPage;
