/**
 * Dashboard widgets grid - maps widget config to rendered components.
 * Stitch dark fintech bilingual VN+EN pattern.
 */
import { useState } from 'react';
import { useTradingStore } from '../stores/trading-store';
import { useDashboardStore } from '../stores/dashboard-store';
import { useAdminControls } from '../hooks/use-admin-controls';

import { CandlestickWidget } from './dashboard-widgets/candlestick-widget';
import { StrategyControlsWidget } from './dashboard-widgets/strategy-controls-widget';
import { PnLAnalyticsWidget } from './dashboard-widgets/pnl-analytics-widget';
import { PositionsWidget } from './dashboard-widgets/positions-widget';
import { AIInsightsWidget } from './dashboard-widgets/ai-insights-widget';

type Lang = 'en' | 'vi';

const COPY: Record<Lang, { langToggle: string; title: string; subtitle: string }> = {
en: {
langToggle: 'Tiếng Việt',
title: 'Dashboard',
subtitle: 'Trading overview and positions',
},
vi: {
langToggle: 'English',
title: 'Bảng điều khiển',
subtitle: 'Tổng quan giao dịch và vị thế',
},
};

interface DashboardWidgetsGridProps {
widgets: any[];
trackEvent: (event: string, props?: any) => void;
}

export function DashboardWidgetsGrid({ widgets, trackEvent }: DashboardWidgetsGridProps) {
const [lang, setLang] = useState<Lang>('en');
const t = COPY[lang];

const strategies = useTradingStore((s: any) => s.strategies);
const botStatus = useTradingStore((s: any) => s.botStatus);
const positions = useTradingStore((s: any) => s.positions);
const metrics = useDashboardStore((s) => s.metrics);
const lastMetricsUpdate = useDashboardStore((s) => s.lastMetricsUpdate);
const pnlLoading = lastMetricsUpdate === null;
const { status: adminStatus, halt, resume, loading: adminLoading, error: adminError, refresh: refreshAdmin } = useAdminControls();

const hasWidgets = widgets.length > 0;

return (
<div className="min-h-screen bg-[#0a0a0a] text-[#e3e2e2] font-sans">
{/* Language Toggle — globe icon, top right */}
<div className="fixed top-4 right-4 z-50">
<button
onClick={() => setLang(lang === 'en' ? 'vi' : 'en')}
className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#121414]/80 backdrop-blur-xl border border-[#414754] text-[#e3e2e2] hover:text-[#aec6ff] transition-colors"
aria-label={`Switch to ${t.langToggle}`}
>
<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
<circle cx="12" cy="12" r="10" />
<line x1="2" y1="12" x2="22" y2="12" />
<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
</svg>
<span className="text-sm font-medium">{lang === 'en' ? 'VN' : 'EN'}</span>
</button>
</div>

<div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-6">
{hasWidgets ? (
widgets
.filter((w) => w.visible)
.map((w) => {
if (w.id === 'candlestick') {
return <CandlestickWidget key={w.id} colSpan={w.colSpan} onClickCapture={() => trackEvent('widget_click', { widget: w.id })} />;
}
if (w.id === 'strategy-controls') {
return (
<StrategyControlsWidget
key={w.id}
colSpan={w.colSpan}
strategies={strategies}
botStatus={botStatus}
adminStatus={adminStatus}
adminLoading={adminLoading}
adminError={adminError}
refreshAdmin={refreshAdmin}
halt={halt}
resume={resume}
onClickCapture={() => trackEvent('widget_click', { widget: w.id })}
trackEvent={trackEvent}
/>
);
}
if (w.id === 'pnl-analytics') {
return (
<PnLAnalyticsWidget
key={w.id}
colSpan={w.colSpan}
metrics={metrics}
positions={positions}
loading={pnlLoading}
error={null}
onClickCapture={() => trackEvent('widget_click', { widget: w.id })}
/>
);
}
if (w.id === 'active-positions') {
return (
<PositionsWidget
key={w.id}
colSpan={w.colSpan}
positions={positions}
loading={pnlLoading}
onClickCapture={() => trackEvent('widget_click', { widget: w.id })}
/>
);
}
if (w.id === 'ai-insights-panel') {
return <AIInsightsWidget key={w.id} colSpan={w.colSpan} onClickCapture={() => trackEvent('widget_click', { widget: w.id })} />;
}
return null;
})
) : (
<>
<CandlestickWidget colSpan={8} onClickCapture={() => trackEvent('widget_click', { widget: 'candlestick' })} />
<StrategyControlsWidget colSpan={4} strategies={strategies} botStatus={botStatus} adminStatus={adminStatus} adminLoading={adminLoading} adminError={adminError} refreshAdmin={refreshAdmin} halt={halt} resume={resume} onClickCapture={() => trackEvent('widget_click', { widget: 'strategy-controls' })} trackEvent={trackEvent} />
<PnLAnalyticsWidget colSpan={12} metrics={metrics} positions={positions} loading={pnlLoading} error={null} onClickCapture={() => trackEvent('widget_click', { widget: 'pnl-analytics' })} />
<PositionsWidget colSpan={6} positions={positions} loading={pnlLoading} onClickCapture={() => trackEvent('widget_click', { widget: 'active-positions' })} />
</>
)}
</div>
</div>
);
}
