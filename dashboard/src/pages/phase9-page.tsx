import { useState } from 'react';
import { COLORS } from '../lib/stitch-design-tokens';

type Lang = 'en' | 'vi';

const COPY: Record<Lang, Record<string, string>> = {
  en: {
    langToggle: 'Tiếng Việt',
    title: 'Phase 9 — Singularity Engine',
    subtitle: 'QSV + NS3 + OMSO modules. All disabled by default.',
    moduleQsv: 'Quantum-Safe Vault (QSV)',
    moduleNs3: 'Neural-Symbolic Synthesizer (NS3)',
    moduleOmso: 'Omni-Macro Oracle (OMSO)',
    keysManaged: 'Keys Managed',
    messagesEncrypted: 'Messages Encrypted',
    pqcAlgorithm: 'PQC Algorithm',
    hsmStatus: 'HSM Status',
    populationSize: 'Population Size',
    bestFitness: 'Best Fitness',
    strategiesGenerated: 'Strategies Generated',
    evolutionCycle: 'Evolution Cycle',
    newsIngested: 'News Ingested',
    sentimentScore: 'Sentiment Score',
    macroSignals: 'Macro Signals',
    llmModel: 'LLM Model',
    configuration: 'Configuration',
  },
  vi: {
    langToggle: 'English',
    title: 'Giai đoạn 9 — Singularity Engine',
    subtitle: 'Các module QSV + NS3 + OMSO. Tất cả tắt theo mặc định.',
    moduleQsv: 'Kho bảo mật lượng tử (QSV)',
    moduleNs3: 'Bộ tổng hợp tâm lý-tượng trưng (NS3)',
    moduleOmso: 'Oracle vĩ mô toàn diện (OMSO)',
    keysManaged: 'Khóa quản lý',
    messagesEncrypted: 'Tin nhắn mã hóa',
    pqcAlgorithm: 'Thuật toán PQC',
    hsmStatus: 'Trạng thái HSM',
    populationSize: 'Quy mô quần thể',
    bestFitness: 'Chỉ số phù hợp',
    strategiesGenerated: 'Chiến lược tạo ra',
    evolutionCycle: 'Chu kỳ tiến hóa',
    newsIngested: 'Tin tức đã xử lý',
    sentimentScore: 'Điểm cảm xúc',
    macroSignals: 'Tín hiệu vĩ mô',
    llmModel: 'Mô hình LLM',
    configuration: 'Cấu hình',
  },
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  active: { bg: COLORS.profit, text: COLORS.profit },
  inactive: { bg: COLORS.onSurfaceVariant, text: COLORS.onSurfaceVariant },
  warning: { bg: COLORS.warning, text: COLORS.warning },
};

function StatusBadge({ status }: { status: 'active' | 'inactive' | 'warning' }) {
  const s = STATUS_COLORS[status];
  return (
    <span
      className="px-2 py-0.5 rounded text-xs"
      style={{
        backgroundColor: `${s.bg}20`,
        color: s.text,
      }}
    >
      {status.toUpperCase()}
    </span>
  );
}

function ModulePanel({
  title,
  metrics,
}: {
  title: string;
  metrics: { label: string; value: string | number; status: 'active' | 'inactive' | 'warning' }[];
}) {
  return (
    <div
      className="p-4 rounded-2xl"
      style={{
        backgroundColor: `${COLORS.surface}cc`,
        backdropFilter: 'blur-xl',
        border: `1px solid ${COLORS.outline}`,
      }}
    >
      <h3 className="text-sm mb-3" style={{ color: COLORS.primary }}>
        {title}
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {metrics.map((m) => (
          <div key={m.label} className="flex flex-col gap-1">
            <span className="text-xs" style={{ color: COLORS.onSurfaceVariant }}>
              {m.label}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-sm" style={{ color: COLORS.onSurface }}>
                {String(m.value)}
              </span>
              <StatusBadge status={m.status} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Phase9Page() {
  const [lang, setLang] = useState<Lang>('en');
  const t = COPY[lang];
  const langLabel = lang === 'en' ? COPY.vi.langToggle : COPY.en.langToggle;

  const qsvMetrics = [
    { label: t.keysManaged, value: 0, status: 'inactive' as const },
    { label: t.messagesEncrypted, value: 0, status: 'inactive' as const },
    { label: t.pqcAlgorithm, value: 'Dilithium5', status: 'inactive' as const },
    { label: t.hsmStatus, value: 'Disabled', status: 'inactive' as const },
  ];

  const ns3Metrics = [
    { label: t.populationSize, value: 0, status: 'inactive' as const },
    { label: t.bestFitness, value: '—', status: 'inactive' as const },
    { label: t.strategiesGenerated, value: 0, status: 'inactive' as const },
    { label: t.evolutionCycle, value: 0, status: 'inactive' as const },
  ];

  const omsoMetrics = [
    { label: t.newsIngested, value: 0, status: 'inactive' as const },
    { label: t.sentimentScore, value: '—', status: 'inactive' as const },
    { label: t.macroSignals, value: 0, status: 'inactive' as const },
    { label: t.llmModel, value: 'llama3-8b', status: 'inactive' as const },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e3e2e2] font-sans">
      <div className="space-y-6 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: COLORS.onSurface }}>
              {t.title}
            </h1>
            <p className="text-sm mt-1" style={{ color: COLORS.onSurfaceVariant }}>
              {t.subtitle}
            </p>
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
          <ModulePanel title={t.moduleQsv} metrics={qsvMetrics} />
          <ModulePanel title={t.moduleNs3} metrics={ns3Metrics} />
          <ModulePanel title={t.moduleOmso} metrics={omsoMetrics} />
        </div>

        <div
          className="p-4 rounded-2xl"
          style={{
            backgroundColor: `${COLORS.surface}cc`,
            backdropFilter: 'blur-xl',
            border: `1px solid ${COLORS.outline}`,
          }}
        >
          <h3 className="text-sm mb-2" style={{ color: COLORS.primary }}>
            {t.configuration}
          </h3>
          <pre
            className="text-xs overflow-auto max-h-48"
            style={{ color: COLORS.onSurfaceVariant }}
          >
            {`{
  "quantumSafeVault": { "enabled": false, "pqcAlgorithm": "Dilithium5" },
  "neuralSymbolicSynthesizer": { "enabled": false, "populationSize": 1000 },
  "omniMacroOracle": { "enabled": false, "llmModel": "llama3-8b-instruct" }
}`}
          </pre>
        </div>
      </div>
    </div>
  );
}
