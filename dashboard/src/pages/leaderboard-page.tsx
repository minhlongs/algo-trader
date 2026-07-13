/**
 * Leaderboard Page — Strategy performance rankings
 * Stitch redesign: dark fintech, bilingual VN+EN
 */
import { useState, useEffect, useMemo } from 'react';
import { COLORS } from '../lib/stitch-design-tokens';
import { motion } from 'motion/react';
import { useApiClient } from '../hooks/use-api-client';
import type { LeaderboardEntry, LeaderboardResponse } from '../types/api';
import { LeaderboardTable } from '../components/leaderboard/leaderboard-table';

const COPY = {
en: {
langToggle: 'Tiếng Việt',
title: 'Strategy Leaderboard',
subtitle: 'Performance rankings across all active strategies',
loading: 'Loading leaderboard data...',
error: 'Failed to load data',
retry: 'Retry',
noData: 'No strategies match your search',
noStrategies: 'No leaderboard data available',
clearFilter: 'Clear filter',
total: 'Total Strategies',
avgWin: 'Avg Win Rate',
avgSharpe: 'Avg Sharpe',
totalPnl: 'Total P&L',
},
vi: {
langToggle: 'English',
title: 'Bảng Xếp Hạng Chiến Lược',
subtitle: 'Xếp hạng hiệu suất các chiến lược đang khai thác',
loading: 'Đang tải bảng xếp hạng...',
error: 'Không thể tải dữ liệu',
retry: 'Thử lại',
noData: 'Không có chiến lược phù hợp bộ lọc',
noStrategies: 'Chưa có dữ liệu bảng xếp hạng',
clearFilter: 'Xóa bộ lọc',
total: 'Tổng Chiến Lược',
avgWin: 'Tỷ Lệ Thắng TB',
avgSharpe: 'Sharpe TB',
totalPnl: 'Tổng Lãi/Lỗ',
},
};

type Lang = 'en' | 'vi';

function glassCard(extra = '') {
return `bg-[${COLORS.surface}]/80 backdrop-blur-xl border border-[${COLORS.outline}] rounded-2xl ${extra}`.trim();
}

export function LeaderboardPage() {
const [lang, setLang] = useState<Lang>('en');
const { fetchApi } = useApiClient();
const [data, setData] = useState<LeaderboardEntry[]>([]);
const [total, setTotal] = useState(0);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);
const [search, setSearch] = useState('');

useEffect(() => {
let cancelled = false;
async function load() {
setLoading(true);
setError(null);
try {
const result = await fetchApi<LeaderboardResponse>('/v1/leaderboard');
if (!cancelled) {
if (result) { setData(result.data ?? []); setTotal(result.total ?? 0); }
else { setData([]); setTotal(0); }
}
} catch {
if (!cancelled) setError(COPY[lang].error);
} finally { if (!cancelled) setLoading(false); }
}
load();
return () => { cancelled = true; };
}, [fetchApi, lang]);

const filtered = useMemo(() => {
if (!search.trim()) return data;
const q = search.toLowerCase();
return data.filter((e) => e.strategyName.toLowerCase().includes(q));
}, [data, search]);

const t = COPY[lang];

if (loading) {
return (
<div className="min-h-screen bg-[${COLORS.bg}] text-[${COLORS.onSurface}] font-sans flex items-center justify-center">
<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
<p className="text-[${COLORS.primary}] text-2xl font-bold mb-2">{t.title}</p>
<div className="w-8 h-8 border-2 border-[${COLORS.primary}] border-t-transparent rounded-full animate-spin mx-auto" />
</motion.div>
</div>
);
}

if (error) {
return (
<div className="min-h-screen bg-[${COLORS.bg}] text-[${COLORS.onSurface}] font-sans flex items-center justify-center">
<div className="text-center">
<p className="text-[${COLORS.loss}] text-xl font-bold mb-4">{t.title}</p>
<p className="text-[${COLORS.onSurfaceVariant}] text-sm">{error}</p>
<button
onClick={() => window.location.reload()}
className="mt-4 px-5 py-2 rounded-lg bg-[${COLORS.primary}] text-white text-sm font-semibold hover:bg-[#0060d3] transition-colors"
>
{t.retry}
</button>
</div>
</div>
);
}

return (
<div className="min-h-screen bg-[${COLORS.bg}] text-[${COLORS.onSurface}] font-sans">
<div className="max-w-[1280px] mx-auto px-4 sm:px-8 pt-8 pb-16">
{/* Header */}
<div className="flex items-center justify-between mb-8">
<div>
<h1 className="text-2xl font-bold text-white tracking-tight">{t.title}</h1>
<p className="text-[${COLORS.onSurfaceVariant}] text-sm mt-1">{t.subtitle}</p>
</div>
<button
onClick={() => setLang((l: Lang) => l === 'en' ? 'vi' : 'en')}
className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[${COLORS.outline}] bg-[${COLORS.surface}]/80 text-[${COLORS.onSurfaceVariant}] text-xs hover:border-[${COLORS.primary}] hover:text-[${COLORS.primary}] transition-colors"
aria-label="Toggle language"
>
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
<circle cx="12" cy="12" r="10"/>
<path d="M2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10"/>
</svg>
{t.langToggle}
</button>
</div>

{/* Search */}
<div className="relative max-w-xs mb-6" role="search">
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2 text-[${COLORS.onSurfaceVariant}]/50">
<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
</svg>
<input
type="text"
value={search}
onChange={(e) => setSearch(e.target.value)}
placeholder="Search strategies..."
className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-[${COLORS.outline}] bg-[${COLORS.surface}] text-white placeholder:text-[${COLORS.onSurfaceVariant}]/50 focus:border-[${COLORS.primary}] focus:outline-none transition-colors"
aria-label="Search strategies"
/>
</div>

{/* Stats (decorative summary) */}
{data.length > 0 && (
<div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
{[
{ label: t.total, value: total || data.length },
{ label: t.avgWin, value: `${(data.reduce((s, e) => s + e.winRate, 0) / data.length).toFixed(1)}%` },
{ label: t.avgSharpe, value: (data.reduce((s, e) => s + e.sharpeRatio, 0) / data.length).toFixed(2) },
{ label: t.totalPnl, value: `${data.reduce((s, e) => s + (e.pnl || 0), 0) >= 0 ? '+' : ''}$${Math.abs(data.reduce((s, e) => s + (e.pnl || 0), 0)).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
tone: data.reduce((s, e) => s + (e.pnl || 0), 0) >= 0 ? 'text-[${COLORS.profit}]' : 'text-[${COLORS.loss}]',
},
].map(({ label, value, tone }) => (
<div className={`${glassCard('p-4')}`}>
<p className="text-[${COLORS.onSurfaceVariant}] text-[10px] uppercase tracking-widest mb-1">{label}</p>
<p className={`font-mono text-lg font-bold ${tone ?? 'text-white'}`}>{value}</p>
</div>
))}
</div>
)}

{/* Table */}
<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
<div className={glassCard('overflow-hidden')}>
<LeaderboardTable entries={filtered} aria-label="Strategy performance rankings table" />
</div>
</motion.div>
</div>
</div>
);
}
