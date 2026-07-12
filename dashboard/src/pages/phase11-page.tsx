import { useState } from 'react';
import { COLORS } from '../lib/stitch-design-tokens';

type Lang = 'en' | 'vi';

const COPY: Record<Lang, Record<string, string>> = {
  en: {
    langToggle: 'Tiếng Việt',
    title: 'Phase 11 — Hyperdimensional Nexus',
    subtitle: 'RWA Arbitrage + BCI Interface + Quantum Comm. All disabled by default.',
    moduleRwa: 'RWA Oracle & Arbitrage',
    moduleBci: 'Brain-Computer Interface',
    moduleQc: 'Quantum Communication',
  },
  vi: {
    langToggle: 'English',
    title: 'Giai đoạn 11 — Siêu Chiều Hạntâm',
    subtitle: 'Arbitrage RWA + Giao diện BCI + Truyền thông Lượng tử. Tất cả tắt theo mặc định.',
    moduleRwa: 'Oracle & Arbitrage RWA',
    moduleBci: 'Giao diện Não-Máy tính',
    moduleQc: 'Truyền thông Lượng tử',
  },
};

interface MetricCard {
  label: string;
  value: string | number;
  status: 'active' | 'inactive' | 'warning';
}

function StatusBadge({ status }: { status: MetricCard['status'] }) {
  const colors = {
    active: 'bg-profit/20 text-profit',
    inactive: 'bg-muted/20 text-muted',
    warning: 'bg-yellow-500/20 text-yellow-400',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs ${colors[status]}`}>
      {status.toUpperCase()}
    </span>
  );
}

function ModulePanel({ title, metrics }: { title: string; metrics: MetricCard[] }) {
  return (
    <div className="glass-card p-4">
      <h3 className="text-sm text-accent mb-3" style={{ color: COLORS.primary }}>{title}</h3>
      <div className="grid grid-cols-2 gap-3">
        {metrics.map((m) => (
          <div key={m.label} className="flex flex-col gap-1">
            <span className="text-xs text-muted">{m.label}</span>
            <div className="flex items-center gap-2">
              <span className="text-sm text-white">{m.value}</span>
              <StatusBadge status={m.status} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Phase11Page() {
  const [lang, setLang] = useState<Lang>('en');
  const t = COPY[lang];
  const langLabel = lang === 'en' ? COPY.vi.langToggle : COPY.en.langToggle;

  const rwaMetrics: MetricCard[] = [
    { label: 'Active Spreads', value: 0, status: 'inactive' },
    { label: 'Min Spread (bps)', value: 10, status: 'inactive' },
    { label: 'Arb Trades', value: 0, status: 'inactive' },
    { label: 'Oracle Status', value: 'Disconnected', status: 'inactive' },
  ];

  const bciMetrics: MetricCard[] = [
    { label: 'Current Intention', value: '—', status: 'inactive' },
    { label: 'Last Signal', value: 'Never', status: 'inactive' },
    { label: 'Dead-Man Timer', value: '60s', status: 'inactive' },
    { label: 'EEG Mode', value: 'Simulation', status: 'inactive' },
  ];

  const qcMetrics: MetricCard[] = [
    { label: 'Key Gen Rate', value: '0/s', status: 'inactive' },
    { label: 'Encrypted Msgs', value: 0, status: 'inactive' },
    { label: 'Key Length', value: '256-bit', status: 'inactive' },
    { label: 'QKD Status', value: 'Offline', status: 'inactive' },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e3e2e2] font-sans">
      <div className="space-y-6 p-6">
        {/* Header + language toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: COLORS.onSurface }}>{t.title}</h1>
            <p className="text-sm mt-1" style={{ color: COLORS.onSurfaceVariant }}>{t.subtitle}</p>
          </div>
          <button
            onClick={() => setLang(lang === 'en' ? 'vi' : 'en')}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors self-start"
            style={{
              backgroundColor: COLORS.surface,
              border: `1px solid ${COLORS.outline}`,
              color: COLORS.onSurfaceVariant,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
            </svg>
            {langLabel}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ModulePanel title={t.moduleRwa} metrics={rwaMetrics} />
          <ModulePanel title={t.moduleBci} metrics={bciMetrics} />
          <ModulePanel title={t.moduleQc} metrics={qcMetrics} />
        </div>
      </div>
    </div>
  );
}

export default Phase11Page;
