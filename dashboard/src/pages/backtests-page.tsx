/**
 * Backtests page: submit backtest jobs and view result history.
 * POST /backtest/submit, GET /backtest/results
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

  const [pair, setPair] = useState('BTC/USDT');
  const [timeframe, setTimeframe] = useState<string>('1h');
  const [strategy, setStrategy] = useState<string>(STRATEGIES[0]);
  const [days, setDays] = useState(30);

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
      setSuccessMsg(`Job submitted: ${res.jobId ?? 'queued'}`);
    } else {
      setSuccessMsg('Không thể kết nối backend. Vui lòng thử lại.');
    }
  }

  return (
    <StitchPageShell>
      <div className="space-y-6 p-6">
        <StitchSectionTitle title="Backtests" eyebrow="STRATEGY TESTING" />

        <StitchCard>
          <StitchCardHeader>
            <span style={{ color: COLORS.onSurface, fontWeight: 600 }}>Submit Backtest</span>
          </StitchCardHeader>
          <StitchCardBody>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StitchInput label="Pair" value={pair} onChange={setPair} placeholder="BTC/USDT" required />
              <div className="flex flex-col gap-1">
                <label className="text-xs font-mono" style={{ color: COLORS.onSurfaceVariant }}>Timeframe</label>
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
                <label className="text-xs font-mono" style={{ color: COLORS.onSurfaceVariant }}>Strategy</label>
                <select
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value)}
                  className="rounded-lg border px-3 py-2 text-sm font-mono"
                  style={{ backgroundColor: `${COLORS.bg}55`, borderColor: COLORS.outline, color: COLORS.onSurface }}
                >
                  {STRATEGIES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <StitchInput label="Days" type="number" value={days} onChange={(v) => setDays(Number(v))} min={1} max={365} required />
              <div className="sm:col-span-2 lg:col-span-4 flex items-center gap-4">
                <StitchButton type="submit" disabled={submitting || loading}>
                  {submitting ? 'Submitting…' : 'Run Backtest'}
                </StitchButton>
                {successMsg && <span className="text-sm font-mono" style={{ color: COLORS.profit }}>{successMsg}</span>}
              </div>
            </form>
          </StitchCardBody>
        </StitchCard>

        <StitchSectionTitle title="Results" eyebrow={`${results.length} RUNS`} />
        {results.length === 0 ? (
          <p className="text-sm" style={{ color: COLORS.onSurfaceVariant }}>No backtest results yet.</p>
        ) : (
          <StitchTable headers={['Strategy', 'Sharpe', 'Sortino', 'Max DD', 'Return']}>
            {results.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3">
                  <div>
                    <p className="font-mono text-sm" style={{ color: COLORS.onSurface }}>{r.strategyName}</p>
                    <p className="text-xs" style={{ color: COLORS.onSurfaceVariant }}>
                      {r.pair} · {r.timeframe} · {r.days}d
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
                  <MetricCell label="" value={`${r.totalReturnPct >= 0 ? '+' : ''}${r.totalReturnPct.toFixed(1)}%`} colored={r.totalReturnPct >= 0 ? 'profit' : 'loss'} />
                </td>
              </tr>
            ))}
          </StitchTable>
        )}
      </div>
    </StitchPageShell>
  );
}

export default BacktestsPage;
