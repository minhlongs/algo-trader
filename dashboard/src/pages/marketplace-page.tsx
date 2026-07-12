/**
 * Strategies page: MM strategy catalogue.
 * Active: Market Making. Coming soon: Listing Arb, Cross-Platform Arb.
 * Stitch redesign: dark fintech, bilingual VN+EN.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { StitchBadge, StitchCard, StitchButton } from '../components/ui/stitch-components';
import { COLORS } from '../lib/stitch-design-tokens';

const COPY = {
en: {
langToggle: 'Tiếng Việt',
title: 'Strategies',
subtitle: 'Automated market making and arbitrage strategies for Polymarket.',
statusLive: 'Live',
statusSoon: 'Coming Soon',
notAvailable: 'Not available yet',
configure: 'Configure',
statSpread: 'Avg spread earned',
statLatency: 'Requote latency',
statHeartbeat: 'Safety heartbeat',
mmName: 'Market Making',
mmDesc: 'Posts bid/ask orders around the fair-value mid-price on Polymarket prediction markets. Earns the spread on every matched fill. Safety limits cap daily loss and inventory exposure.',
arbName: 'Listing Arbitrage',
arbDesc: 'Detects newly listed Polymarket markets before liquidity concentrates. Places early orders at favourable prices before the crowd narrows the spread.',
crossName: 'Cross-Platform Arbitrage',
crossDesc: 'Identifies price discrepancies for the same event across Polymarket and other prediction market venues. Buys low on one side, hedges on the other.',
},
vi: {
langToggle: 'English',
title: 'Chiến Lược',
subtitle: 'Chiến lược tự động tạo thanh khoản và arbitrage cho Polymarket.',
statusLive: 'Trực tiếp',
statusSoon: 'Sắp Ra Mắt',
notAvailable: 'Chưa khả dụng',
configure: 'Cấu Hình',
statSpread: 'Spread trung bình',
statLatency: 'Độ trễ requote',
statHeartbeat: 'Heartbeat an toàn',
mmName: 'Tạo Thanh Khoản',
mmDesc: 'Đặt lệnh bid/ask quanh giá trung bình trên Polymarket. Thu về spread từ mỗi lệnh khớp. Giới hạn an toàn kiểm soát lỗ hàng ngày.',
arbName: 'Arbitrage Liệt Kê',
arbDesc: 'Phát hiện thị trường Polymarket mới trước khi thanh khoản tập trung. Đặt lệnh sớm với giá thuận lợi trước khi đám đông thu hẹp spread.',
crossName: 'Arbitrage Đa Nền Tảng',
crossDesc: 'Xác định chênh lệch giá cùng sự kiện giữa Polymarket và các nền tảng khác. Mua giá thấp bên này, hedge bên kia.',
},
};

type Lang = 'en' | 'vi';

interface Strategy {
id: string;
nameKey: keyof typeof COPY.en;
descKey: keyof typeof COPY.en;
status: 'active' | 'coming-soon';
stats?: { labelKey: keyof typeof COPY.en; value: string }[];
}

const STRATEGIES: Strategy[] = [
{
id: 'mm',
nameKey: 'mmName',
descKey: 'mmDesc',
status: 'active',
stats: [
{ labelKey: 'statSpread', value: '0.08–0.12' },
{ labelKey: 'statLatency', value: '< 2s' },
{ labelKey: 'statHeartbeat', value: '5s' },
],
},
{
id: 'listing-arb',
nameKey: 'arbName',
descKey: 'arbDesc',
status: 'coming-soon',
},
{
id: 'cross-platform-arb',
nameKey: 'crossName',
descKey: 'crossDesc',
status: 'coming-soon',
},
];

function StatusBadge({ status, lang }: { status: Strategy['status']; lang: Lang }) {
if (status === 'active') {
return <StitchBadge label={lang === 'en' ? COPY.en.statusLive : COPY.vi.statusLive} tone="profit" />;
}
return <StitchBadge label={lang === 'en' ? COPY.en.statusSoon : COPY.vi.statusSoon} tone="neutral" />;
}

export function MarketplacePage() {
const [lang, setLang] = useState<Lang>('en');
const t = COPY[lang];

return (
<div className="min-h-screen bg-[${COLORS.bg}] text-[${COLORS.onSurface}] font-sans">
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
<div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-8 space-y-6">
<div>
<h1 className="text-2xl font-bold tracking-tight text-white">{t.title}</h1>
<p className="text-xs mt-1 text-[${COLORS.onSurfaceVariant}]">{t.subtitle}</p>
</div>

<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
{STRATEGIES.map((s) => (
<StitchCard key={s.id} className="p-5 flex flex-col gap-4" onClick={() => {}}>
<div className="flex items-start justify-between gap-3">
<h2 className="text-sm font-semibold leading-snug" style={{ color: COLORS.onSurface }}>{t[s.nameKey]}</h2>
<StatusBadge status={s.status} lang={lang} />
</div>

<p className="text-xs leading-relaxed flex-1" style={{ color: COLORS.onSurfaceVariant }}>{t[s.descKey]}</p>

{s.stats && (
<div className="grid grid-cols-1 gap-1.5 border-t pt-3" style={{ borderColor: COLORS.outline }}>
{s.stats.map(({ labelKey, value }) => (
<div key={labelKey} className="flex items-center justify-between text-xs">
<span style={{ color: COLORS.onSurfaceVariant }}>{t[labelKey]}</span>
<span className="font-mono" style={{ color: COLORS.primary }}>{value}</span>
</div>
))}
</div>
)}

{s.status === 'active' ? (
<Link to="/app/settings">
<StitchButton variant="primary" className="w-full text-center">{t.configure}</StitchButton>
</Link>
) : (
<div className="text-center text-xs font-bold border rounded py-2" style={{ borderColor: COLORS.outline, color: COLORS.onSurfaceVariant }}>
{t.notAvailable}
</div>
)}
</StitchCard>
))}
</div>
</div>
</div>
);
}

export default MarketplacePage;
