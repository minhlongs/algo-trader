/**
 * Phase 3 AGI Modules dashboard — live status panels for
 * MEV Sandwich, Portfolio Rebalancer, and Predatory Liquidity.
 * Receives data via WebSocket 'phase3:*' message types.
 * Dark fintech bilingual VN+EN pattern.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { COLORS } from '../lib/stitch-design-tokens';

type Lang = 'en' | 'vi';

const COPY: Record<Lang, Record<string, string>> = {
  en: {
    langToggle: 'Tieng Viet',
    title: 'Phase 3 — AGI Modules',
    subtitle: 'MEV Sandwich / Portfolio Rebalancer / Predatory Liquidity',
    mevSandwich: 'MEV Sandwich',
    opportunities: 'Opportunities',
    bundlesSubmitted: 'Bundles Submitted',
    successRate: 'Success Rate',
    portfolioRebalancer: 'Portfolio Rebalancer',
    portfolioValue: 'Portfolio Value',
    tradesExecuted: 'Trades Executed',
    lastRebalance: 'Last Rebalance',
    predatoryLiquidity: 'Predatory Liquidity',
    activePumps: 'Active Pumps',
    makerOrders: 'Maker Orders',
    dumpsExecuted: 'Dumps Executed',
    mevBundleActivity: 'MEV Bundle Activity',
    noBundles: 'No MEV bundles submitted yet',
    active: 'Active',
    disabled: 'Disabled',
    dash: '—',
  },
  vi: {
    langToggle: 'English',
    title: 'Giai doan 3 — Modules AGI',
    subtitle: 'MEV Sandwich / Can Bang Danh Muc / Thanh Khoan Dot Bien',
    mevSandwich: 'MEV Sandwich',
    opportunities: 'Co hoi',
    bundlesSubmitted: 'Bundle Da Gui',
    successRate: 'Ty le Thanh cong',
    portfolioRebalancer: 'Can Bang Danh Muc',
    portfolioValue: 'Gia Tri Danh Muc',
    tradesExecuted: 'Giao Dich Thuc Thi',
    lastRebalance: 'Can Bang Gan Nhat',
    predatoryLiquidity: 'Thanh Khoan Dot Bien',
    activePumps: 'Pump Dang Hoat Dong',
    makerOrders: 'Lenh Tao Khop',
    dumpsExecuted: 'Dump Da Thuc Thi',
    mevBundleActivity: 'Hoat Dong Bundle MEV',
    noBundles: 'Chua co bundle MEV duoc gui',
    active: 'Hoat dong',
    disabled: 'Dung',
    dash: '—',
  },
};

interface MevStatus {
  enabled: boolean;
  opportunities: number;
  bundlesSubmitted: number;
  successRate: number;
}

interface RebalancerStatus {
  enabled: boolean;
  totalValueUsd: number;
  lastRebalanceTime: number;
  tradesExecuted: number;
}

interface PredatoryStatus {
  enabled: boolean;
  activePumps: number;
  makerOrders: number;
  dumpsExecuted: number;
}

interface Phase3Status {
  mevSandwich: MevStatus;
  portfolioRebalancer: RebalancerStatus;
  predatoryLiquidity: PredatoryStatus;
}

interface MevAlert {
  bundleHash?: string;
  chain?: string;
  timestamp: number;
  [key: string]: unknown;
}

const DEFAULT_STATUS: Phase3Status = {
  mevSandwich: { enabled: false, opportunities: 0, bundlesSubmitted: 0, successRate: 0 },
  portfolioRebalancer: { enabled: false, totalValueUsd: 0, lastRebalanceTime: 0, tradesExecuted: 0 },
  predatoryLiquidity: { enabled: false, activePumps: 0, makerOrders: 0, dumpsExecuted: 0 },
};

function StatusBadgeBilingual({ enabled, t }: { enabled: boolean; t: Record<string, string> }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${
        enabled
          ? 'bg-profit/15 text-profit border border-profit/30'
          : 'bg-muted/15 text-muted border border-muted/30'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${enabled ? 'bg-profit' : 'bg-muted'}`} />
      {enabled ? t.active : t.disabled}
    </span>
  );
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-[#414754]/50 last:border-0">
      <span className="text-[#c1c6d7] text-xs">{label}</span>
      <span className="text-white text-sm font-semibold">{value}</span>
    </div>
  );
}

export function Phase3Page() {
  const [lang, setLang] = useState<Lang>('en');
  const [status, setStatus] = useState<Phase3Status>(DEFAULT_STATUS);
  const [mevAlerts, setMevAlerts] = useState<MevAlert[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  const t = COPY[lang];
  const langLabel = lang === 'en' ? COPY.vi.langToggle : COPY.en.langToggle;

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data as string);
      switch (data.type) {
        case 'phase3:status':
          setStatus(data.payload as Phase3Status);
          break;
        case 'phase3:mev_opportunity':
          setMevAlerts((prev) => [...prev, { ...data.payload, timestamp: Date.now() }].slice(0, 50));
          break;
        case 'phase3:rebalance_action':
        case 'phase3:pump_signal':
          // absorbed for future panels
          break;
      }
    } catch {
      // ignore malformed
    }
  }, []);

  useEffect(() => {
    const url = import.meta.env.VITE_WS_URL ?? `ws://${window.location.host}/ws`;
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onmessage = handleMessage;
      ws.onerror = () => ws.close();
      return () => ws.close();
    } catch {
      // ignore
    }
  }, [handleMessage]);

  const { mevSandwich, portfolioRebalancer, predatoryLiquidity } = status;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e3e2e2] font-sans">
      <div className="space-y-6 p-6">
        {/* Header + language toggle */}
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
              <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10A15.3 15.3 0 0112 2z" />
            </svg>
            {langLabel}
          </button>
        </div>

        {/* 3-column grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* MEV Sandwich */}
          <div
            className="bg-[#121414]/80 backdrop-blur-xl border border-[#414754] rounded-2xl p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white text-sm font-bold">{t.mevSandwich}</h3>
              <StatusBadgeBilingual enabled={mevSandwich.enabled} t={t} />
            </div>
            <div className="space-y-0">
              <StatRow label={t.opportunities} value={mevSandwich.opportunities} />
              <StatRow label={t.bundlesSubmitted} value={mevSandwich.bundlesSubmitted} />
              <StatRow label={t.successRate} value={`${(mevSandwich.successRate * 100).toFixed(1)}%`} />
            </div>
          </div>

          {/* Portfolio Rebalancer */}
          <div
            className="bg-[#121414]/80 backdrop-blur-xl border border-[#414754] rounded-2xl p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white text-sm font-bold">{t.portfolioRebalancer}</h3>
              <StatusBadgeBilingual enabled={portfolioRebalancer.enabled} t={t} />
            </div>
            <div className="space-y-0">
              <StatRow label={t.portfolioValue} value={`$${portfolioRebalancer.totalValueUsd.toFixed(2)}`} />
              <StatRow label={t.tradesExecuted} value={portfolioRebalancer.tradesExecuted} />
              <StatRow
                label={t.lastRebalance}
                value={
                  portfolioRebalancer.lastRebalanceTime
                    ? new Date(portfolioRebalancer.lastRebalanceTime).toLocaleTimeString()
                    : t.dash
                }
              />
            </div>
          </div>

          {/* Predatory Liquidity */}
          <div
            className="bg-[#121414]/80 backdrop-blur-xl border border-[#414754] rounded-2xl p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white text-sm font-bold">{t.predatoryLiquidity}</h3>
              <StatusBadgeBilingual enabled={predatoryLiquidity.enabled} t={t} />
            </div>
            <div className="space-y-0">
              <StatRow label={t.activePumps} value={predatoryLiquidity.activePumps} />
              <StatRow label={t.makerOrders} value={predatoryLiquidity.makerOrders} />
              <StatRow label={t.dumpsExecuted} value={predatoryLiquidity.dumpsExecuted} />
            </div>
          </div>
        </div>

        {/* MEV Bundle Alerts */}
        <div
          className="bg-[#121414]/80 backdrop-blur-xl border border-[#414754] rounded-2xl p-4"
        >
          <h3 className="text-white text-sm font-bold mb-3">{t.mevBundleActivity}</h3>
          {mevAlerts.length === 0 ? (
            <p className="text-[#c1c6d7] text-xs">{t.noBundles}</p>
          ) : (
            <div className="max-h-64 overflow-y-auto space-y-1">
              {mevAlerts.map((a, i) => (
                <div key={i} className="flex items-center gap-3 text-xs py-1.5 border-b border-[#414754]/50">
                  <span
                    className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                    style={{ backgroundColor: `${COLORS.primary}20`, color: COLORS.primary }}
                  >
                    {String(a.chain ?? 'eth').toUpperCase()}
                  </span>
                  <span className="text-white truncate max-w-[180px]">
                    {String(a.bundleHash ?? 'pending')}
                  </span>
                  <span className="text-[#c1c6d7] ml-auto">
                    {new Date(a.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
