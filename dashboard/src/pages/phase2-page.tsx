/**
 * Phase 2 AGI Modules dashboard — live status panels for
 * Zero-Shot Synthesizer, Cross-Chain Flash Loans, and Adversarial MM.
 * Receives data via WebSocket 'phase2:*' message types.
 * Stitch redesign: dark fintech, bilingual VN+EN
 */
import { useState, useEffect, useCallback, useRef } from 'react';

interface Phase2Status {
  zeroShot: { enabled: boolean; activeRules: number; messagesProcessed: number; rulesGenerated: number };
  flashLoans: { enabled: boolean; dexCount: number; bridgeCount: number; routesFound: number };
  adversarialMM: { enabled: boolean; modelLoaded: boolean; signalCount: number };
}

interface SpoofAlert {
  exchange: string;
  symbol: string;
  confidence: number;
  signalType: string;
  timestamp: number;
}

const DEFAULT_STATUS: Phase2Status = {
  zeroShot: { enabled: false, activeRules: 0, messagesProcessed: 0, rulesGenerated: 0 },
  flashLoans: { enabled: false, dexCount: 0, bridgeCount: 0, routesFound: 0 },
  adversarialMM: { enabled: false, modelLoaded: false, signalCount: 0 },
};

type Lang = 'en' | 'vi';

const COPY = {
  en: {
    langToggle: 'Tiếng Việt',
    title: 'Phase 2 — AGI Modules',
    subtitle: 'Zero-Shot Synthesizer / Flash Loans / Adversarial MM',
    zeroShotTitle: 'Zero-Shot Synthesizer',
    flashLoansTitle: 'Flash Loans',
    adversarialMMTitle: 'Adversarial MM',
    active: 'Active',
    disabled: 'Disabled',
    activeRules: 'Active Rules',
    messagesProcessed: 'Messages Processed',
    rulesGenerated: 'Rules Generated',
    dexNodes: 'DEX Nodes',
    bridgeCount: 'Bridge Count',
    routesFound: 'Routes Found',
    bestProfit: 'Best Profit',
    model: 'Model',
    signalsDetected: 'Signals Detected',
    onnx: 'ONNX',
    heuristic: 'Heuristic',
    spoofAlertsTitle: 'Spoof Detection Alerts',
    noAlerts: 'No manipulation signals detected',
    none: 'None',
  },
  vi: {
    langToggle: 'English',
    title: 'Giai đoạn 2 — Module AGI',
    subtitle: 'Zero-Shot Synthesizer / Flash Loans / Adversarial MM',
    zeroShotTitle: 'Zero-Shot Synthesizer',
    flashLoansTitle: 'Flash Loans',
    adversarialMMTitle: 'Adversarial MM',
    active: 'Hoạt động',
    disabled: 'Tắt',
    activeRules: 'Rules Đang Hoạt Động',
    messagesProcessed: 'Tin Nhắn Đã Xử Lý',
    rulesGenerated: 'Rules Đã Tạo',
    dexNodes: 'Node DEX',
    bridgeCount: 'Số Cầu Nối',
    routesFound: 'Tuyến Tìm Thấy',
    bestProfit: 'Lợi Nhuận Tốt Nhất',
    model: 'Mô Hình',
    signalsDetected: 'Tín Hiệu Phát Hiện',
    onnx: 'ONNX',
    heuristic: 'Heuristic',
    spoofAlertsTitle: 'Cảnh Báo Phát Hiện Spoof',
    noAlerts: 'Chưa phát hiện tín hiệu thao túng',
    none: 'Không có',
  },
};

function glassCard(extra = '') {
  return `bg-[#121414]/80 backdrop-blur-xl border border-[#414754] rounded-2xl ${extra}`.trim();
}

function StatusBadge({ enabled, t }: { enabled: boolean; t: Record<string, string> }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${
        enabled ? 'bg-[#3b82f6]/15 text-[#3b82f6] border border-[#3b82f6]/30' : 'bg-[#c1c6d7]/15 text-[#c1c6d7] border border-[#c1c6d7]/30'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${enabled ? 'bg-[#3b82f6]' : 'bg-[#c1c6d7]'}`} />
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

export function Phase2Page() {
  const [lang, setLang] = useState<Lang>('en');
  const [status, setStatus] = useState<Phase2Status>(DEFAULT_STATUS);
  const [alerts, setAlerts] = useState<SpoofAlert[]>([]);
  const [routesBestProfit, setRoutesBestProfit] = useState(0);
  const t = COPY[lang];
  const wsRef = useRef<WebSocket | null>(null);

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      switch (data.type) {
        case 'phase2:status':
          setStatus(data.payload);
          break;
        case 'phase2:spoof_signal':
          setAlerts(prev => [{ ...data.payload, timestamp: Date.now() }, ...prev].slice(0, 50));
          break;
        case 'phase2:routes_found':
          setRoutesBestProfit(data.payload.bestProfitUsd);
          break;
      }
    } catch {
      /* ignore malformed */
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
      /* ignore */
    }
  }, [handleMessage]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e3e2e2] font-sans">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-8 pt-8 pb-16">
        {/* Header with language toggle */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">{t.title}</h1>
            <p className="text-[#c1c6d7] text-sm mt-1">{t.subtitle}</p>
          </div>
          <button
            onClick={() => setLang(lang === 'en' ? 'vi' : 'en')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#414754] bg-[#121414]/80 text-[#c1c6d7] text-xs hover:border-[#aec6ff] hover:text-[#aec6ff] transition-colors"
            aria-label="Toggle language"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10" />
            </svg>
            {lang === 'en' ? 'VN' : 'EN'}
          </button>
        </div>

        {/* 3-column grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Zero-Shot Synthesizer */}
          <div className={glassCard('p-4')}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white text-sm font-bold">{t.zeroShotTitle}</h3>
              <StatusBadge enabled={status.zeroShot.enabled} t={t} />
            </div>
            <div className="space-y-0">
              <StatRow label={t.activeRules} value={status.zeroShot.activeRules} />
              <StatRow label={t.messagesProcessed} value={status.zeroShot.messagesProcessed} />
              <StatRow label={t.rulesGenerated} value={status.zeroShot.rulesGenerated} />
            </div>
          </div>

          {/* Cross-Chain Flash Loans */}
          <div className={glassCard('p-4')}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white text-sm font-bold">{t.flashLoansTitle}</h3>
              <StatusBadge enabled={status.flashLoans.enabled} t={t} />
            </div>
            <div className="space-y-0">
              <StatRow label={t.dexNodes} value={status.flashLoans.dexCount} />
              <StatRow label={t.bridgeCount} value={status.flashLoans.bridgeCount} />
              <StatRow label={t.routesFound} value={status.flashLoans.routesFound} />
              <StatRow label={t.bestProfit} value={`$${routesBestProfit.toFixed(2)}`} />
            </div>
          </div>

          {/* Adversarial MM */}
          <div className={glassCard('p-4')}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white text-sm font-bold">{t.adversarialMMTitle}</h3>
              <StatusBadge enabled={status.adversarialMM.enabled} t={t} />
            </div>
            <div className="space-y-0">
              <StatRow label={t.model} value={status.adversarialMM.modelLoaded ? t.onnx : t.heuristic} />
              <StatRow label={t.signalsDetected} value={status.adversarialMM.signalCount} />
            </div>
          </div>
        </div>

        {/* Spoof Alerts */}
        <div className={glassCard('p-4')}>
          <h3 className="text-white text-sm font-bold mb-3">{t.spoofAlertsTitle}</h3>
          {alerts.length === 0 ? (
            <p className="text-[#c1c6d7] text-xs">{t.noAlerts}</p>
          ) : (
            <div className="max-h-64 overflow-y-auto space-y-1">
              {alerts.map((a, i) => (
                <div key={i} className="flex items-center gap-3 text-xs py-1.5 border-b border-[#414754]/50">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      a.confidence > 0.9 ? 'bg-[#ffb4ab]/20 text-[#ffb4ab]' : 'bg-[#ffb596]/20 text-[#ffb596]'
                    }`}
                  >
                    {(a.confidence * 100).toFixed(0)}%
                  </span>
                  <span className="text-white">{a.exchange}</span>
                  <span className="text-[#c1c6d7]">{a.symbol}</span>
                  <span className="text-[#aec6ff]">{a.signalType}</span>
                  <span className="text-[#c1c6d7] ml-auto">{new Date(a.timestamp).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
