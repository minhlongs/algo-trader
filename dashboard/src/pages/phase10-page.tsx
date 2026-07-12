import { useState } from 'react';
import { COLORS } from '../lib/stitch-design-tokens';

type Lang = 'en' | 'vi';

const COPY = {
  en: {
    langToggle: 'Tiếng Việt',
    title: 'Phase 10 — Cosmic Horizon',
    subtitle: 'Temporal Warp + DAO Governance + State Shadowing. All disabled by default.',
    temporalWarp: 'Temporal Warp Execution',
    daoGovernance: 'DAO Governance',
    stateShadowing: 'State Shadowing',
    latency: 'Latency (ns)',
    packetDrop: 'Packet Drop Rate',
    ebpfProgram: 'eBPF Program',
    fpgaDevice: 'FPGA Device',
    tokenSupply: 'Token Supply',
    treasuryBalance: 'Treasury Balance',
    activeProposals: 'Active Proposals',
    darkPool: 'Dark Pool',
    simulations: 'Simulations/s',
    probabilityDist: 'Probability Dist',
    preemptiveTrades: 'Preemptive Trades',
    chains: 'Chains',
    notLoaded: 'Not loaded',
    disabled: 'Disabled',
    inactive: 'INACTIVE',
    active: 'ACTIVE',
    warning: 'WARNING',
  },
  vi: {
    langToggle: 'English',
    title: 'Giai đoạn 10 — Cosmic Horizon',
    subtitle: 'Temporal Warp + DAO Governance + State Shadowing. Tắt theo mặc định.',
    temporalWarp: 'Thực thi Temporal Warp',
    daoGovernance: 'Quản trị DAO',
    stateShadowing: 'State Shadowing',
    latency: 'Độ trễ (ns)',
    packetDrop: 'Tỷ lệ mất gói',
    ebpfProgram: 'Chương trình eBPF',
    fpgaDevice: 'Thiết bị FPGA',
    tokenSupply: 'Cung token',
    treasuryBalance: 'Số dư quỹ',
    activeProposals: 'Đề xuất đang hoạt động',
    darkPool: 'Dark Pool',
    simulations: 'Mô phỏng/giây',
    probabilityDist: 'Phân bố xác suất',
    preemptiveTrades: 'Giao dịch chủ động',
    chains: 'Chuỗi',
    notLoaded: 'Chưa tải',
    disabled: 'Đã tắt',
    inactive: 'KHÔNG HOẠT ĐỘNG',
    active: 'HOẠT ĐỘNG',
    warning: 'CẢNH BÁO',
  },
};

interface MetricCard {
  label: string;
  value: string | number;
  status: 'active' | 'inactive' | 'warning';
  labelKey: keyof typeof COPY.en;
  valueKey?: keyof typeof COPY.en;
}

function StatusBadge({ status }: { status: MetricCard['status'] }) {
  const colors: Record<string, string> = {
    active: `bg-[${COLORS.profit}]/20 text-[${COLORS.profit}]`,
    inactive: `bg-[${COLORS.surfaceHigh}]/20 text-[${COLORS.onSurfaceVariant}]`,
    warning: `bg-[${COLORS.warning}]/20 text-[${COLORS.warning}]`,
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
      <h3 className="text-sm mb-3" style={{ color: COLORS.primary }}>{title}</h3>
      <div className="grid grid-cols-2 gap-3">
        {metrics.map((m) => (
          <div key={m.labelKey} className="flex flex-col gap-1">
            <span className="text-xs" style={{ color: COLORS.onSurfaceVariant }}>{m.label}</span>
            <div className="flex items-center gap-2">
              <span className="text-sm" style={{ color: COLORS.onSurface }}>{m.value}</span>
              <StatusBadge status={m.status} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Phase10Page() {
  const [lang, setLang] = useState<Lang>('en');
  const t = COPY[lang];

  const twMetrics: MetricCard[] = [
    { labelKey: 'latency', value: '—', status: 'inactive', label: '' },
    { labelKey: 'packetDrop', value: '0%', status: 'inactive', label: '' },
    { labelKey: 'ebpfProgram', value: t.notLoaded, status: 'inactive', label: '' },
    { labelKey: 'fpgaDevice', value: '/dev/fpga0', status: 'inactive', label: '' },
  ];

  const daoMetrics: MetricCard[] = [
    { labelKey: 'tokenSupply', value: 0, status: 'inactive', label: '' },
    { labelKey: 'treasuryBalance', value: '$0', status: 'inactive', label: '' },
    { labelKey: 'activeProposals', value: 0, status: 'inactive', label: '' },
    { labelKey: 'darkPool', value: t.disabled, status: 'inactive', label: '' },
  ];

  const ssMetrics: MetricCard[] = [
    { labelKey: 'simulations', value: 0, status: 'inactive', label: '' },
    { labelKey: 'probabilityDist', value: '—', status: 'inactive', label: '' },
    { labelKey: 'preemptiveTrades', value: 0, status: 'inactive', label: '' },
    { labelKey: 'chains', value: 'ETH, SOL', status: 'inactive', label: '' },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e3e2e2] font-sans">
      <div className="relative">
        <div className="flex justify-end p-4">
          <button
            onClick={() => setLang(lang === 'en' ? 'vi' : 'en')}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
            aria-label="Toggle language"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke={COLORS.onSurface}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </button>
        </div>
      </div>

      <div className="space-y-6 px-4 pb-8">
        <div>
          <h2 className="text-lg" style={{ color: COLORS.onSurface }}>{t.title}</h2>
          <p className="text-xs mt-1" style={{ color: COLORS.onSurfaceVariant }}>
            {t.subtitle}
          </p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ModulePanel title={t.temporalWarp} metrics={twMetrics} />
          <ModulePanel title={t.daoGovernance} metrics={daoMetrics} />
          <ModulePanel title={t.stateShadowing} metrics={ssMetrics} />
        </div>
      </div>
    </div>
  );
}
