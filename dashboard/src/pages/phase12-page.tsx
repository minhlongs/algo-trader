import { useState } from 'react';
import { COLORS } from '../lib/stitch-design-tokens';

type Lang = 'en' | 'vi';

const COPY: Record<Lang, {
  langToggle: string;
  title: string;
  subtitle: string;
  autopoieticEngine: string;
  evolutionRuns: string;
  codebaseComplexity: string;
  prsCreated: string;
  lastRun: string;
  never: string;
  autoEvolveDesc: string;
  energyArbitrage: string;
  computeCost: string;
  energyPrice: string;
  profitMargin: string;
  miningEarnings: string;
  energyDesc: string;
  marketMorphogenesis: string;
  dexVolume: string;
  lpYield: string;
  validatorRewards: string;
  totalRevenue: string;
  morphogenesisDesc: string;
  omegaStatus: string;
  statusBody1: string;
  statusBody2: string;
}> = {
  en: {
    langToggle: 'Vietnamese',
    title: 'Phase 12: The Omega Point',
    subtitle: 'Self-sustaining, self-evolving financial entity',
    autopoieticEngine: 'Autopoietic Engine',
    evolutionRuns: 'Evolution Runs',
    codebaseComplexity: 'Codebase Complexity',
    prsCreated: 'PRs Created',
    lastRun: 'Last Run',
    never: 'Never',
    autoEvolveDesc: 'Self-evolving code generation pipeline',
    energyArbitrage: 'Energy Arbitrage',
    computeCost: 'Compute Cost/hr',
    energyPrice: 'Energy Price/MWh',
    profitMargin: 'Profit Margin',
    miningEarnings: 'Mining Earnings',
    energyDesc: 'Energy-aware compute optimization',
    marketMorphogenesis: 'Market Morphogenesis',
    dexVolume: 'DEX Volume 24h',
    lpYield: 'LP Yield APY',
    validatorRewards: 'Validator Rewards',
    totalRevenue: 'Total Revenue',
    morphogenesisDesc: 'Own DEX + validator + LP infrastructure',
    omegaStatus: 'Omega Point Status',
    statusBody1: 'All Phase 12 modules disabled by default. Enable via config.phase12.json.',
    statusBody2: 'Each module supports dry-run mode for safe testing.',
  },
  vi: {
    langToggle: 'English',
    title: 'Giai đoạn 12: Điểm Omega',
    subtitle: 'Thực thể tài chính tự duy trì và tự tiến hóa',
    autopoieticEngine: 'Cơ chế Tự tạo',
    evolutionRuns: 'Vòng tiến hóa',
    codebaseComplexity: 'Độ phức tạp codebase',
    prsCreated: 'PR đã tạo',
    lastRun: 'Lần chạy cuối',
    never: 'Chưa bao giờ',
    autoEvolveDesc: 'Pipeline tự sinh code tự tiến hóa',
    energyArbitrage: 'Chênh lệch Năng lượng',
    computeCost: 'Chi phí tính toán/giờ',
    energyPrice: 'Giá năng lượng/MWh',
    profitMargin: 'Tỷ suất lợi nhuận',
    miningEarnings: 'Thu nhập khai thác',
    energyDesc: 'Tối ưu hóa tính toán theo năng lượng',
    marketMorphogenesis: 'Morphogenesis Thị trường',
    dexVolume: 'Khối lượng DEX 24h',
    lpYield: 'Lợi suất LP APY',
    validatorRewards: 'Phần thưởng Validator',
    totalRevenue: 'Tổng doanh thu',
    morphogenesisDesc: 'Hạ tầng DEX + validator + LP riêng',
    omegaStatus: 'Trạng thái Điểm Omega',
    statusBody1: 'Tất cả module Giai đoạn 12 bị tắt mặc định. Bật qua config.phase12.json.',
    statusBody2: 'Mỗi module hỗ trợ chế độ dry-run để kiểm tra an toàn.',
  },
};

export default function Phase12Page() {
  const [lang, setLang] = useState<Lang>('en');
  const t = COPY[lang];

  return (
    <div className="min-h-screen bg-[${COLORS.bg}] text-[${COLORS.onSurface}] font-sans">
      {/* Language Toggle */}
      <div className="fixed top-4 right-4 z-50">
        <button
          onClick={() => setLang((l) => (l === 'en' ? 'vi' : 'en'))}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[${COLORS.surface}]/80 backdrop-blur-xl border border-[${COLORS.outline}] text-[${COLORS.onSurface}] hover:text-[${COLORS.primary}] transition-colors"
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

      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t.title}</h1>
          <p className="text-[${COLORS.onSurfaceVariant}]">{t.subtitle}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Autopoietic Engine */}
          <div className={`bg-[${COLORS.surface}]/80 backdrop-blur-xl border border-[${COLORS.outline}] rounded-2xl p-4`}>
            <h2 className="text-lg font-semibold" style={{ color: COLORS.primary }}>{t.autopoieticEngine}</h2>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><span>{t.evolutionRuns}</span><span style={{ color: COLORS.primary }}>0</span></div>
              <div className="flex justify-between"><span>{t.codebaseComplexity}</span><span style={{ color: COLORS.primary }}>&mdash;</span></div>
              <div className="flex justify-between"><span>{t.prsCreated}</span><span style={{ color: COLORS.primary }}>0</span></div>
              <div className="flex justify-between"><span>{t.lastRun}</span><span style={{ color: COLORS.primary }}>{t.never}</span></div>
            </div>
            <div className="mt-3 text-xs text-[${COLORS.onSurfaceVariant}]">{t.autoEvolveDesc}</div>
          </div>

          {/* Energy Arbitrage */}
          <div className={`bg-[${COLORS.surface}]/80 backdrop-blur-xl border border-[${COLORS.outline}] rounded-2xl p-4`}>
            <h2 className="text-lg font-semibold" style={{ color: COLORS.profit }}>{t.energyArbitrage}</h2>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><span>{t.computeCost}</span><span style={{ color: COLORS.profit }}>$0.00</span></div>
              <div className="flex justify-between"><span>{t.energyPrice}</span><span style={{ color: COLORS.profit }}>$0.00</span></div>
              <div className="flex justify-between"><span>{t.profitMargin}</span><span style={{ color: COLORS.profit }}>0%</span></div>
              <div className="flex justify-between"><span>{t.miningEarnings}</span><span style={{ color: COLORS.profit }}>$0.00</span></div>
            </div>
            <div className="mt-3 text-xs text-[${COLORS.onSurfaceVariant}]">{t.energyDesc}</div>
          </div>

          {/* Market Morphogenesis */}
          <div className={`bg-[${COLORS.surface}]/80 backdrop-blur-xl border border-[${COLORS.outline}] rounded-2xl p-4`}>
            <h2 className="text-lg font-semibold" style={{ color: COLORS.warning }}>{t.marketMorphogenesis}</h2>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><span>{t.dexVolume}</span><span style={{ color: COLORS.warning }}>$0.00</span></div>
              <div className="flex justify-between"><span>{t.lpYield}</span><span style={{ color: COLORS.warning }}>0%</span></div>
              <div className="flex justify-between"><span>{t.validatorRewards}</span><span style={{ color: COLORS.warning }}>$0.00</span></div>
              <div className="flex justify-between"><span>{t.totalRevenue}</span><span style={{ color: COLORS.warning }}>$0.00</span></div>
            </div>
            <div className="mt-3 text-xs text-[${COLORS.onSurfaceVariant}]">{t.morphogenesisDesc}</div>
          </div>
        </div>

        <div className={`bg-[${COLORS.surface}]/80 backdrop-blur-xl border border-[${COLORS.outline}] rounded-2xl p-4`}>
          <h3 className="font-semibold" style={{ color: COLORS.warning }}>{t.omegaStatus}</h3>
          <p className="text-sm text-[${COLORS.onSurfaceVariant}] mt-2">
            {t.statusBody1} {t.statusBody2}
          </p>
        </div>
      </div>
    </div>
  );
}
