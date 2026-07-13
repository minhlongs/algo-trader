/**
 * Trial Status Page
 *
 * Displays trial progress, remaining days, email subscription toggle,
 * and a drip schedule timeline.
 *
 * Endpoints:
 * GET /api/v1/trial-drip/status
 * POST /api/v1/trial-drip/subscribe
 *
 * Stitch redesign: dark fintech, bilingual VN+EN.
 */
import { useState, useEffect, useCallback } from 'react';
import { useApiClient } from '../hooks/use-api-client';
import { StitchButton } from '../components/ui/stitch-components';
import { COLORS } from '../lib/stitch-design-tokens';

const COPY = {
en: {
langToggle: 'Tiếng Việt',
trialProgress: 'Trial Progress',
daysLeft: 'days left',
trialDay: 'day trial',
currentPlan: 'Current Plan:', 'upgradeNow': 'Upgrade Now',
emailPref: 'Email Preferences',
subscribed: 'Subscribed',
unsubscribed: 'Unsubscribed',
subDesc: 'Receive drip emails with tips, strategy highlights, and product updates during your trial.',
subOff: 'You will not receive any drip emails.',
toggleSaving: 'Saving...',
dripSchedule: 'Drip Schedule',
emailsOn: 'Emails on', emailsOff: 'Emails off',
dripDesc: 'Timeline of emails, feature unlocks, and milestones during your trial.',
infoNote: 'Trial status and drip preferences are managed server-side via the trial-drip API.',
loading: 'Loading trial status...',
errorLoad: 'Failed to load trial status.',
errorToggle: 'Failed to update subscription preference.',
typeEmail: 'email',
typeFeature: 'feature',
typeMilestone: 'milestone',
},
vi: {
langToggle: 'English',
trialProgress: 'Tiến Độ Dùng Thử',
daysLeft: 'ngày còn lại',
trialDay: 'ngày dùng thử',
currentPlan: 'Gói Hiện Tại:', 'upgradeNow': 'Nâng Cấp Ngay',
emailPref: 'Tùy Chọn Email',
subscribed: 'Đã đăng ký',
unsubscribed: 'Chưa đăng ký',
subDesc: 'Nhận email drip với mẹo, highlight chiến lược, và cập nhật sản phẩm trong thời gian dùng thử.',
subOff: 'Bạn sẽ không nhận email drip nào.',
toggleSaving: 'Đang lưu...',
dripSchedule: 'Lịch Drip',
emailsOn: 'Email bật', emailsOff: 'Email tắt',
dripDesc: 'Dòng thời gian emails, mở khóa tính năng, và milestones trong thời gian dùng thử.',
infoNote: 'Trạng thái dùng thử và tùy chọn drip được quản lý server-side qua API trial-drip.',
loading: 'Đang tải trạng thái dùng thử...',
errorLoad: 'Không thể tải trạng thái dùng thử.',
errorToggle: 'Không thể cập nhật tùy chọn đăng ký.',
typeEmail: 'email',
typeFeature: 'tính năng',
typeMilestone: 'milestone',
},
};

type Lang = 'en' | 'vi';
type DripType = 'email' | 'feature' | 'milestone';

interface TrialStatus {
daysRemaining: number;
totalDays: number;
startDate: string;
endDate: string;
subscribed: boolean;
tier: string;
email: string;
}

interface DripEvent {
day: number;
titleKey: keyof typeof COPY.en;
descKey: keyof typeof COPY.en;
type: DripType;
}

function formatDate(iso: string): string {
try { return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
catch { return iso; }
}

const DRIP_SCHEDULE: DripEvent[] = [
{ day: 1, titleKey: 'loading', descKey: 'subDesc', type: 'email' },
{ day: 2, titleKey: 'loading', descKey: 'subDesc', type: 'feature' },
{ day: 5, titleKey: 'loading', descKey: 'subDesc', type: 'milestone' },
{ day: 7, titleKey: 'loading', descKey: 'subDesc', type: 'feature' },
{ day: 10, titleKey: 'loading', descKey: 'subDesc', type: 'email' },
{ day: 14, titleKey: 'loading', descKey: 'subDesc', type: 'milestone' },
{ day: 18, titleKey: 'loading', descKey: 'subDesc', type: 'feature' },
{ day: 21, titleKey: 'loading', descKey: 'subDesc', type: 'email' },
{ day: 25, titleKey: 'loading', descKey: 'subDesc', type: 'feature' },
{ day: 28, titleKey: 'loading', descKey: 'subDesc', type: 'email' },
{ day: 30, titleKey: 'loading', descKey: 'subDesc', type: 'milestone' },
];

const DRIP_TITLES: Record<number, { en: string; vi: string }> = {
1: { en: 'Welcome', vi: 'Chào mừng' },
2: { en: 'First Strategy', vi: 'Chiến Lược Đầu Tiên' },
5: { en: 'Performance Metrics', vi: 'Chỉ Số Hiệu Suất' },
7: { en: 'Polymarket Integration', vi: 'Kết Nối Polymarket' },
10: { en: 'Risk Management', vi: 'Quản Lý Rủi Ro' },
14: { en: 'Backtesting Deep Dive', vi: 'Sâu Về Backtesting' },
18: { en: 'Advanced Settings', vi: 'Cài Đặt Nâng Cao' },
21: { en: 'Halfway Check-in', vi: 'Kiểm Tra Giữa Chừng' },
25: { en: 'API Access', vi: 'Truy Cập API' },
28: { en: 'Final Week Prep', vi: 'Chuẩn Bị Tuần Cuối' },
30: { en: 'Trial Ends', vi: 'Dùng Thử Kết Thúc' },
};

const DRIP_DESCS: Record<number, { en: string; vi: string }> = {
1: { en: 'Getting started guide and platform overview', vi: 'Hướng dẫn bắt đầu và tổng quan nền tảng' },
2: { en: 'How to browse and subscribe to a strategy', vi: 'Cách duyệt và đăng ký chiến lược' },
5: { en: 'Understanding your dashboard metrics', vi: 'Hiểu chỉ số dashboard của bạn' },
7: { en: 'Connecting your Polymarket account', vi: 'Kết nối tài khoản Polymarket' },
10: { en: 'Setting up risk limits and alerts', vi: 'Thiết lập giới hạn rủi ro và cảnh báo' },
14: { en: 'Using the backtesting engine effectively', vi: 'Sử dụng engine backtesting hiệu quả' },
18: { en: 'MM parameters, exchange keys, alert rules', vi: 'Tham số MM, key sàn, quy tắc cảnh báo' },
21: { en: 'Tips to optimise your strategy performance', vi: 'Mẹo tối ưu hiệu suất chiến lược' },
25: { en: 'Using the API for programmatic access', vi: 'Sử dụng API để truy cập programmatic' },
28: { en: 'Preparing for post-trial decisions', vi: 'Chuẩn bị cho quyết định sau dùng thử' },
30: { en: 'Choose a plan to continue uninterrupted trading', vi: 'Chọn gói để tiếp tục giao dịch không gián đoạn' },
};

const DEFAULT_STATUS: TrialStatus = {
daysRemaining: 14, totalDays: 30,
startDate: new Date(Date.now() - 16 * 86400000).toISOString(),
endDate: new Date(Date.now() + 14 * 86400000).toISOString(),
subscribed: true, tier: 'free', email: '',
};

export function TrialStatusPage() {
const [lang, setLang] = useState<Lang>('en');
const t = COPY[lang];
const { fetchApi } = useApiClient();

const [status, setStatus] = useState<TrialStatus>(DEFAULT_STATUS);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);
const [saving, setSaving] = useState(false);

const currentDay = status.totalDays - status.daysRemaining;

const loadStatus = useCallback(async () => {
setLoading(true); setError(null);
try {
const data = await fetchApi<TrialStatus>('/v1/trial-drip/status');
if (data) setStatus(data); else setStatus(DEFAULT_STATUS);
} catch { setStatus(DEFAULT_STATUS); }
finally { setLoading(false); }
}, [fetchApi]);

useEffect(() => { loadStatus(); }, [loadStatus]);

async function handleToggleSubscribe() {
setSaving(true); setError(null);
try {
const newState = !status.subscribed;
const result = await fetchApi<TrialStatus>('/v1/trial-drip/subscribe', { method: 'POST', body: JSON.stringify({ subscribed: newState }) });
if (result) setStatus(result); else setStatus((prev) => ({ ...prev, subscribed: newState }));
} catch { setError(t.errorToggle); }
finally { setSaving(false); }
}

if (loading) {
return (
<div className="min-h-screen bg-[${COLORS.bg}] text-[${COLORS.onSurface}] font-sans flex items-center justify-center">
<div className="flex flex-col items-center gap-3">
<svg className="animate-spin h-8 w-8 text-[${COLORS.primary}]" fill="none" viewBox="0 0 24 24">
<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
</svg>
<p className="text-[${COLORS.onSurfaceVariant}] text-xs">{t.loading}</p>
</div>
</div>
);
}

const pct = Math.max(0, Math.min(100, ((status.totalDays - status.daysRemaining) / status.totalDays) * 100));

return (
<div className="min-h-screen bg-[${COLORS.bg}] text-[${COLORS.onSurface}] font-sans">
<a href="#main-content" className={`sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:rounded-lg focus:bg-[${COLORS.primary}] focus:text-[${COLORS.onPrimary}]`}>Skip to main content</a>
{/* Lang toggle */}
<div className="flex justify-end px-4 sm:px-8 pt-6">
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

<div id="main-content" className="max-w-2xl mx-auto px-4 sm:px-8 py-8 space-y-6" role="main">
<h1 className="text-white text-2xl font-bold">{lang === 'en' ? 'Trial Status' : 'Trạng Thái Dùng Thử'}</h1>

{error && (
<div className="bg-[${COLORS.loss}]/10 border border-[${COLORS.loss}]/30 rounded-xl p-3 flex items-center justify-between">
<span className="text-[${COLORS.loss}] text-xs">{error}</span>
<button onClick={() => setError(null)} className="text-[${COLORS.loss}]/60 text-xs hover:text-[${COLORS.loss}] ml-3" aria-label="Dismiss error">×</button>
</div>
)}

{/* Progress card */}
<section className="bg-[${COLORS.surface}]/80 backdrop-blur-xl border border-[${COLORS.outline}] rounded-2xl p-6 space-y-4">
<div className="flex items-center justify-between">
<h2 className="text-white text-sm font-bold">{t.trialProgress}</h2>
<span className="text-xs font-bold px-2 py-0.5 rounded-lg" style={{ backgroundColor: status.daysRemaining > 20 ? `${COLORS.profit}1a` : status.daysRemaining > 10 ? `${COLORS.warning}1a` : `${COLORS.loss}1a`, color: status.daysRemaining > 20 ? COLORS.profit : status.daysRemaining > 10 ? COLORS.warning : COLORS.loss }}>
{status.daysRemaining} {t.daysLeft}
</span>
</div>

<div className="space-y-2">
<div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label="Trial progress" className="w-full bg-[${COLORS.surface}] rounded-full h-2.5 overflow-hidden">
<div className="h-full rounded-full transition-all duration-700 ease-out" style={{
width: `${pct}%`, background: 'linear-gradient(90deg, ${COLORS.primary}, ${COLORS.primary})'
}} />
</div>
<div className="flex justify-between text-[10px]" style={{ color: COLORS.onSurfaceVariant }}>
<span>{lang === 'en' ? 'Started' : 'Bắt đầu'} {formatDate(status.startDate)}</span>
<span>{status.totalDays} {t.trialDay}</span>
<span>{lang === 'en' ? 'Ends' : 'Kết thúc'} {formatDate(status.endDate)}</span>
</div>
</div>

<div className="bg-[${COLORS.bg}] border border-[${COLORS.outline}] rounded-xl px-4 py-3 flex items-center justify-between">
<div>
<p className="text-white text-xs font-semibold">{t.currentPlan} {status.tier.toUpperCase()}</p>
<p className="text-[10px] mt-0.5" style={{ color: COLORS.onSurfaceVariant }}>
{lang === 'en' ? 'Day' : 'Ngày'} {currentDay} {lang === 'en' ? 'of' : '/ {status.totalDays}'}
</p>
</div>
{status.daysRemaining <= 7 && (
<StitchButton variant="primary" className="text-xs">{t.upgradeNow}</StitchButton>
)}
</div>
</section>

{/* Email preferences */}
<section className="bg-[${COLORS.surface}]/80 backdrop-blur-xl border border-[${COLORS.outline}] rounded-2xl p-6 space-y-4">
<h2 className="text-white text-sm font-bold">{t.emailPref}</h2>
<p className="text-xs" style={{ color: COLORS.onSurfaceVariant }}>{t.subDesc}</p>
<div className="flex items-center justify-between bg-[${COLORS.bg}] border border-[${COLORS.outline}] rounded-xl px-4 py-3">
<div>
<p className="text-white text-xs font-semibold">{status.subscribed ? t.subscribed : t.unsubscribed}</p>
<p className="text-[10px] mt-0.5" style={{ color: COLORS.onSurfaceVariant }}>{status.subscribed ? t.subDesc : t.subOff}</p>
</div>
<button onClick={handleToggleSubscribe} disabled={saving}
className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0"
style={{ backgroundColor: status.subscribed ? COLORS.primaryContainer : COLORS.outline }}
role="switch" aria-checked={status.subscribed}
>
<span className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform" style={{ transform: status.subscribed ? 'translateX(1.25rem)' : 'translateX(0.25rem)' }} />
</button>
</div>
{saving && <p className="text-[10px] flex items-center gap-1" style={{ color: COLORS.onSurfaceVariant }}>{t.toggleSaving}</p>}
</section>

{/* Drip schedule */}
<section className="bg-[${COLORS.surface}]/80 backdrop-blur-xl border border-[${COLORS.outline}] rounded-2xl p-6 space-y-4">
<div className="flex items-center justify-between">
<h2 className="text-white text-sm font-bold">{t.dripSchedule}</h2>
<span className="text-[10px]" style={{ color: COLORS.onSurfaceVariant }}>{status.subscribed ? t.emailsOn : t.emailsOff}</span>
</div>
<p className="text-xs" style={{ color: COLORS.onSurfaceVariant }}>{t.dripDesc}</p>
<div className="space-y-0">
{DRIP_SCHEDULE.map((event, idx) => {
const isPast = event.day < currentDay;
const isToday = event.day === currentDay;
const title = DRIP_TITLES[event.day]?.[lang] || `Day ${event.day}`;
const desc = DRIP_DESCS[event.day]?.[lang] || '';
const typeLabel = t[event.type === 'email' ? 'typeEmail' : event.type === 'feature' ? 'typeFeature' : 'typeMilestone'];
return (
<div key={event.day} className="relative flex gap-4 pb-5 last:pb-0">
{idx < DRIP_SCHEDULE.length - 1 && (
<div className="absolute left-[11px] top-5 w-0.5 h-full" style={{ backgroundColor: isPast ? `${COLORS.primary}4d` : COLORS.outline }} />
)}
<div className="flex-shrink-0 relative z-10 mt-0.5">
{isToday ? (
<span className="flex h-[22px] w-[22px] items-center justify-center rounded-full" style={{ backgroundColor: `${COLORS.primary}20`, border: `2px solid ${COLORS.primary}` }}>
<span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS.primary }} />
</span>
) : isPast ? (
<span className="flex h-[22px] w-[22px] items-center justify-center rounded-full" style={{ backgroundColor: `${COLORS.profit}20`, border: `1px solid ${COLORS.profit}40` }}>
<svg width="10" height="10" fill="none" stroke={COLORS.profit} strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" /></svg>
</span>
) : (
<span className="flex h-[22px] w-[22px] items-center justify-center rounded-full" style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.outline}` }}>
<span className="h-2 w-2 rounded-full" style={{ backgroundColor: `${COLORS.onSurfaceVariant}66` }} />
</span>
)}
</div>
<div className={`flex-1 min-w-0 ${event.day > currentDay ? 'opacity-50' : ''}`}>
<div className="flex items-center gap-2 mb-0.5">
<span className="text-xs font-semibold" style={{ color: isToday ? COLORS.primary : isPast ? '${COLORS.onSurface}' : COLORS.onSurfaceVariant }}>
Day {event.day}
</span>
<span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{
backgroundColor: event.type === 'email' ? `${COLORS.primary}15` : event.type === 'feature' ? `${COLORS.profit}15` : `${COLORS.warning}15`,
color: event.type === 'email' ? COLORS.primary : event.type === 'feature' ? COLORS.profit : COLORS.warning,
border: `1px solid ${event.type === 'email' ? `${COLORS.primary}30` : event.type === 'feature' ? `${COLORS.profit}30` : `${COLORS.warning}30`}`,
}}>
{typeLabel}
</span>
{isToday && <span className="text-[10px] font-bold" style={{ color: COLORS.primary }}>NOW</span>}
</div>
<p className="text-white text-xs">{title}</p>
<p className="text-[10px] mt-0.5 leading-relaxed" style={{ color: COLORS.onSurfaceVariant }}>{desc}</p>
</div>
</div>
);
})}
</div>
</section>

<p className="text-[10px] text-center" style={{ color: COLORS.onSurfaceVariant }}>{t.infoNote}</p>
</div>
</div>
);
}

export default TrialStatusPage;
