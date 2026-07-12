/**
 * Backtests page: submit backtest jobs and view result history.
 * POST /backtest/submit, GET /backtest/results
 * Stitch redesign: dark fintech, bilingual VN+EN.
 */
import { useState, useEffect, FormEvent } from 'react';
import { useApiClient } from '../hooks/use-api-client';
import { StitchPageShell } from '../components/ui/stitch-page-shell';
import { StitchCard, StitchCardHeader, StitchCardBody } from '../components/ui/stitch-card';
import { StitchBadge } from '../components/ui/stitch-badge';
import { StitchButton } from '../components/ui/stitch-button';
import { StitchSectionTitle } from '../components/ui/stitch-section-title';
import { StitchInput } from '../components/ui/stitch-input';
import { StitchTable } from '../components/ui/stitch-table';
import { COLORS } from '../lib/stitch-design-tokens';

const COPY = {
  en: {
    langToggle: 'Tiếng Việt',
    title: 'Backtests',
    subtitle: 'Submit strategy backtest jobs and review historical results.',
    eyebrow: 'STRATEGY TESTING',
    submitHeader: 'Submit Backtest',
    pair: 'Pair',
    timeframe: 'Timeframe',
    strategy: 'Strategy',
    days: 'Days',
    runBacktest: 'Run Backtest',
    submitting: 'Submitting…',
    results: 'Results',
    resultsCount: 'RUNS',
    noResults: 'No backtest results yet.',
    submittingLabel: 'Submitting…',
    colStrategy: 'Strategy',
    colSharpe: 'Sharpe',
    colSortino: 'Sortino',
    colMaxDD: 'Max DD',
    colReturn: 'Return',
  },
  vi: {
    langToggle: 'English',
    title: 'Kiểm Tra Lùi',
    subtitle: 'Gửi job kiểm tra lùi chiến lược và xem kết quả lịch sử.',
    eyebrow: 'KIỂM TRA CHIẾN LƯỢC',
    submitHeader: 'Gửi Kiểm Tra Lùi',
    pair: 'Cặp',
    timeframe: 'Khung TG',
    strategy: 'Chiến lược',
    days: 'Ngày',
    runBacktest: 'Chạy Backtest',
    submitting: 'Đang gửi…',
    results: 'Kết Quả',
    resultsCount: 'LẦN CHẠY',
    noResults: 'Chưa có kết quả kiểm tra lùi.',
    submittingLabel: 'Đang gửi…',
    colStrategy: 'Chiến lược',
    colSharpe: 'Sharpe',
    colSortino: 'Sortino',
    colMaxDD: 'Max DD',
    colReturn: 'Lợi nhuận',
  },
};

type Lang = 'en' | 'vi';

interface BacktestResult {
  id: string;
  strategyName: string;
  pair: string;
  timeframe: string;
  days: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdownPct: number;
  totalReturnPct: number;
  createdAt: string;
}

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'] as const;
const STRATEGIES = ['arb-spread-v1', 'mean-reversion', 'trend-follow', 'stat-arb', 'momentum'] as const;

function SharpeBadge({ value }: { value: number }) {
  const tone = value > 1 ? 'profit' : value < 0 ? 'loss' : 'neutral';
  return <StitchBadge label={value.toFixed(2)} tone={tone} />;
}

function MetricCell({ label, value, colored }: { label: string; value: string; colored?: 'profit' | 'loss' | 'neutral' }) {
  const color = colored === 'profit' ? COLORS.profit : colored === 'loss' ? COLORS.loss : COLORS.onSurface;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs" style={{ color: COLORS.onSurfaceVariant }}>{label}</span>
      <span className="font-mono text-sm" style={{ color }}>{value}</span>
    </div>
  );
}

export function BacktestsPage() {
  const { fetchApi, loading } = useApiClient();
  const [results, setResults] = useState<BacktestResult[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [lang, setLang] = useState<Lang>('en');

  const [pair, setPair] = useState('BTC/USDT');
  const [timeframe, setTimeframe] = useState<string>('1h');
  const [strategy, setStrategy] = useState<string>(STRATEGIES[0]);
  const [days, setDays] = useState(30);

  const t = COPY[lang];

  useEffect(() => {
    fetchApi<BacktestResult[]>('/backtest/results').then((data) => {
      if (data && data.length > 0) setResults(data);
    });
  }, [fetchApi]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSuccessMsg('');
    const res = await fetchApi<{ jobId: string }>('/backtest/submit', {
      method: 'POST',
      body: JSON.stringify({ pair, timeframe, strategyName: strategy, days }),
    });
    setSubmitting(false);
    if (res) {
      setSuccessMsg( lang === 'en' ? `Job submitted: ${res.jobId ?? 'queued'}` : `Job đã gửi: ${res.jobId ?? 'đang chờ'}`);
    } else {
      setSuccessMsg(lang === 'en' ? 'Could not connect to backend. Please try again.' : 'Không thể kết nối backend. Vui lòng thử lại.');
    }
  }

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

      <StitchPageShell>
        <div className="space-y-6 p-6">
          <StitchSectionTitle title={t.title} eyebrow={t.eyebrow} />

          <StitchCard className="bg-[${COLORS.surface}]/80 backdrop-blur-xl border border-[${COLORS.outline}] rounded-2xl">
            <StitchCardHeader>
              <span style={{ color: COLORS.onSurface, fontWeight: 600 }}>{t.submitHeader}</span>
            </StitchCardHeader>
            <StitchCardBody>
              <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StitchInput label={t.pair} value={pair} onChange={setPair} placeholder="BTC/USDT" required />
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-mono" style={{ color: COLORS.onSurfaceVariant }}>{t.timeframe}</label>
                  <select
                    value={timeframe}
                    onChange={(e) => setTimeframe(e.target.value)}
                    className="rounded-lg border px-3 py-2 text-sm font-mono"
                    style={{ backgroundColor: `${COLORS.bg}55`, borderColor: COLORS.outline, color: COLORS.onSurface }}
                  >
                    {TIMEFRAMES.map((tf) => <option key={tf} value={tf}>{tf}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-mono" style={{ color: COLORS.onSurfaceVariant }}>{t.strategy}</label>
                  <select
                    value={strategy}
                    onChange={(e) => setStrategy(e.target.value)}
                    className="rounded-lg border px-3 py-2 text-sm font-mono"
                    style={{ backgroundColor: `${COLORS.bg}55`, borderColor: COLORS.outline, color: COLORS.onSurface }}
                  >
                    {STRATEGIES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <StitchInput label={t.days} type="number" value={days} onChange={(v) => setDays(Number(v))} min={1} max={365} required />
                <div className="sm:col-span-2 lg:col-span-4 flex items-center gap-4">
                  <StitchButton type="submit" disabled={submitting || loading}>
                    {submitting ? t.submitting : t.runBacktest}
                  </StitchButton>
                  {successMsg && <span className="text-sm font-mono" style={{ color: COLORS.profit }}>{successMsg}</span>}
                </div>
              </form>
            </StitchCardBody>
          </StitchCard>

          <StitchSectionTitle title={t.results} eyebrow={`${results.length} ${t.resultsCount}`} />
          {results.length === 0 ? (
            <p className="text-sm" style={{ color: COLORS.onSurfaceVariant }}>{t.noResults}</p>
          ) : (
            <StitchTable headers={[t.colStrategy, t.colSharpe, t.colSortino, t.colMaxDD, t.colReturn]}>
              {results.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-mono text-sm" style={{ color: COLORS.onSurface }}>{r.strategyName}</p>
                      <p className="text-xs" style={{ color: COLORS.onSurfaceVariant }}>
                        {r.pair} &middot; {r.timeframe} &middot; {r.days}d
                      </p>
                      <p className="text-xs" style={{ color: COLORS.onSurfaceVariant }}>{new Date(r.createdAt).toLocaleDateString()}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3"><SharpeBadge value={r.sharpeRatio} /></td>
                  <td className="px-4 py-3">
                    <MetricCell label="" value={r.sortinoRatio.toFixed(2)} colored={r.sortinoRatio > 1 ? 'profit' : r.sortinoRatio < 0 ? 'loss' : 'neutral'} />
                  </td>
                  <td className="px-4 py-3">
                    <MetricCell label="" value={`-${r.maxDrawdownPct.toFixed(1)}%`} colored="loss" />
                  </td>
                  <td className="px-4 py-3">
                    <MetricCell
                      label=""
                      value={`${r.totalReturnPct >= 0 ? '+' : ''}${r.totalReturnPct.toFixed(1)}%`}
                      colored={r.totalReturnPct >= 0 ? 'profit' : 'loss'}
                    />
                  </td>
                </tr>
              ))}
            </StitchTable>
          )}
        </div>
      </StitchPageShell>
    </div>
  );
}

export default BacktestsPage;
