/**
 * Strategy Detail Page
 *
 * Shows detailed backtest results, performance chart, and subscribe button
 * for a single marketplace strategy. Route: /app/strategies/:id
 */
import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApiClient } from '../hooks/use-api-client';
import type { MarketplaceStrategy } from '../types/api';
import { BacktestResults } from '../components/backtest-results';
import { PriceChartLightweight } from '../components/price-chart-lightweight';
import type { ChartDataPoint } from '../components/price-chart-lightweight';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function fmtUsd(n: number, decimals = 2): string {
  const abs = Math.abs(n);
  const formatted = abs >= 1000
    ? abs.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : abs.toFixed(decimals);
  return (n < 0 ? '-' : '') + '$' + formatted;
}

function pctStr(v: number | null | undefined, decimals = 1): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${(v * 100).toFixed(decimals)}%`;
}

function metricCard(label: string, value: string, accent: 'profit' | 'loss' | 'default' = 'default') {
  const accents = { profit: 'text-profit', loss: 'text-loss', default: 'text-white' };
  return (
    <div className="bg-bg-surface border border-bg-border rounded-lg p-4 flex flex-col gap-1">
      <p className="text-muted text-[10px] uppercase tracking-widest">{label}</p>
      <p className={`text-2xl font-bold ${accents[accent]}`}>{value}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Detail page                                                       */
/* ------------------------------------------------------------------ */

export function StrategyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { fetchApi } = useApiClient();

  const [strategy, setStrategy] = useState<MarketplaceStrategy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchApi<MarketplaceStrategy>(`/v1/marketplace/strategies/${encodeURIComponent(id!)}`);
        if (!cancelled) {
          if (data) setStrategy(data);
          else setError('Strategy not found');
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load strategy');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [id, fetchApi]);

  /* ── Loading state ── */
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted text-sm">
        Loading strategy details...
      </div>
    );
  }

  /* ── Error state ── */
  if (error || !strategy) {
    return (
      <div className="p-4 bg-loss/10 border border-loss/40 rounded-lg text-loss text-sm space-y-3">
        <p>{error || 'Strategy not found'}</p>
        <button
          onClick={() => navigate('/app/strategies')}
          className="px-3 py-1 bg-loss/20 hover:bg-loss/30 rounded text-xs transition-colors"
        >
          Back to Marketplace
        </button>
      </div>
    );
  }

  const bs = strategy.backtestSummary;

  // Build synthetic chart data from backtest summary (linear equity approximation)
  const chartData = useMemo<ChartDataPoint[]>(() => {
    if (!bs || !bs.periodDays || bs.periodDays <= 0) return [];
    // Generate a simple equity curve: start at 10000, apply daily returns
    const points: ChartDataPoint[] = [];
    const dailyReturn = bs.totalPnlUsd / 10000 / bs.periodDays; // rough daily return %
    let equity = 10000;
    const start = new Date();
    start.setDate(start.getDate() - bs.periodDays);
    for (let i = 0; i <= bs.periodDays; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      equity += equity * dailyReturn;
      points.push({
        time: d.toISOString().slice(0, 10),
        value: Math.round(equity * 100) / 100,
      });
    }
    return points;
  }, [bs]);

  return (
    <div className="space-y-6">
      {/* Back button + header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <button
            onClick={() => navigate('/app/strategies')}
            className="text-muted text-xs hover:text-white transition-colors mb-2 inline-flex items-center gap-1"
          >
            &larr; Back to Marketplace
          </button>
          <h1 className="text-white text-2xl font-bold">{strategy.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] border border-bg-border text-muted px-1.5 py-0.5 rounded">
              {strategy.category}
            </span>
            {strategy.status && (
              <span className="text-[10px] border border-accent/30 text-accent px-1.5 py-0.5 rounded">
                {strategy.status}
              </span>
            )}
          </div>
        </div>

        {/* Subscribe button */}
        {!strategy.listingPriceUsdMonthly || strategy.listingPriceUsdMonthly === 0 ? (
          <span className="text-xs font-bold bg-accent/20 text-accent border border-accent/30 px-4 py-2 rounded">
            Free Strategy
          </span>
        ) : (
          <a
            href={`/app/strategies`}
            className="text-xs font-bold bg-accent text-bg px-5 py-2.5 rounded hover:bg-accent/80 transition-colors inline-block"
          >
            Subscribe &mdash; ${(strategy.listingPriceUsdMonthly / 100).toFixed(2)}/mo
          </a>
        )}
      </div>

      {/* Description */}
      <p className="text-muted text-sm leading-relaxed">
        {strategy.description || 'No description provided.'}
      </p>

      {/* Backtest Summary */}
      {bs ? (
        <>
          <section>
            <h2 className="text-xs font-semibold text-accent mb-3">Backtest Summary</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {metricCard('Sharpe Ratio', bs.sharpe?.toFixed(2) ?? '—', (bs.sharpe ?? 0) >= 1 ? 'profit' : 'loss')}
              {metricCard('Max Drawdown', pctStr(bs.maxDrawdown), ((bs.maxDrawdown ?? 0) < 0.2) ? 'profit' : 'loss')}
              {metricCard('Win Rate', pctStr(bs.winRate), ((bs.winRate ?? 0) >= 0.5) ? 'profit' : 'loss')}
              {metricCard('Total P&L', fmtUsd(bs.totalPnlUsd ?? 0), (bs.totalPnlUsd ?? 0) >= 0 ? 'profit' : 'loss')}
              {metricCard('Profit Factor', bs.profitFactor?.toFixed(2) ?? '—', (bs.profitFactor ?? 0) >= 1 ? 'profit' : 'loss')}
              {metricCard('Period', bs.periodDays ? `${bs.periodDays}d` : '—')}
            </div>
          </section>

          {/* Performance Chart */}
          {chartData.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-accent mb-3">Equity Curve (Estimated)</h2>
              <div className="bg-bg-surface border border-bg-border rounded-lg p-4">
                <PriceChartLightweight
                  data={chartData}
                  height={280}
                  color={(bs.totalPnlUsd ?? 0) >= 0 ? '#00E676' : '#FF4466'}
                  title="Simulated Equity Curve"
                />
              </div>
            </section>
          )}

          {/* Additional metrics */}
          <section>
            <h2 className="text-xs font-semibold text-accent mb-3">Additional Details</h2>
            <div className="bg-bg-surface border border-bg-border rounded-lg p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-muted text-[10px] uppercase tracking-widest mb-1">Total Trades</p>
                <p className="text-white font-bold text-lg">{bs.totalTrades ?? '—'}</p>
              </div>
              <div>
                <p className="text-muted text-[10px] uppercase tracking-widest mb-1">Risk Level</p>
                <p className="text-white font-bold text-lg">{strategy.riskLevel ?? '—'}</p>
              </div>
              <div>
                <p className="text-muted text-[10px] uppercase tracking-widest mb-1">Min Allocation</p>
                <p className="text-white font-bold text-lg">{strategy.minAllocationUsd ? fmtUsd(strategy.minAllocationUsd) : '—'}</p>
              </div>
              <div>
                <p className="text-muted text-[10px] uppercase tracking-widest mb-1">Max Allocation</p>
                <p className="text-white font-bold text-lg">{strategy.maxAllocationUsd ? fmtUsd(strategy.maxAllocationUsd) : '—'}</p>
              </div>
            </div>
          </section>
        </>
      ) : (
        <div className="text-muted text-xs py-8 text-center border border-dashed border-bg-border rounded-lg">
          No backtest data available for this strategy.
        </div>
      )}

      {/* Backtest History */}
      {id && (
        <section>
          <h2 className="text-xs font-semibold text-accent mb-3">Backtest History</h2>
          <div className="bg-bg-surface border border-bg-border rounded-lg p-4">
            <BacktestResults strategyId={id} />
          </div>
        </section>
      )}
    </div>
  );
}

export default StrategyDetailPage;
