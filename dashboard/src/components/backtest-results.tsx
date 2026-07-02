/**
 * BacktestResults — Displays backtest metrics history for a strategy.
 * Fetches from GET /api/v1/marketplace/strategies/:id/backtests on mount.
 */
import { useState, useEffect } from 'react';

const API_BASE = (import.meta.env.VITE_API_URL ?? '');

export interface BacktestRecord {
  id: string;
  sharpeRatio: number | null;
  maxDrawdown: number | null;
  winRate: number | null;
  totalPnlUsd: number;
  profitFactor: number | null;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  volatility: number | null;
  totalReturn: number | null;
  createdAt: string;
}

interface Props {
  strategyId: string;
}

function fmtNum(v: number | null | undefined, decimals = 2): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return Number(v).toFixed(decimals);
}

function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${(Number(v) * 100).toFixed(1)}%`;
}

export function BacktestResults({ strategyId }: Props) {
  const [records, setRecords] = useState<BacktestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchBacktests() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`${API_BASE}/api/v1/marketplace/strategies/${encodeURIComponent(strategyId)}/backtests?limit=5`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) setRecords(json.data ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchBacktests();
    return () => { cancelled = true; };
  }, [strategyId]);

  if (loading) return <div className="text-muted text-[10px] py-4 text-center">Loading backtests…</div>;
  if (error) return <div className="text-red-400 text-[10px] py-4 text-center">Error: {error}</div>;
  if (records.length === 0) {
    return (
      <div className="text-muted text-[10px] py-4 text-center border border-dashed border-bg-border rounded">
        No backtests yet. Run one via the API.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-[11px] font-semibold text-white">Backtest History</h4>
      <div className="space-y-2 max-h-[300px] overflow-y-auto">
        {records.map((r) => (
          <div key={r.id} className="bg-bg-surface border border-bg-border rounded p-3 grid grid-cols-3 gap-1.5 text-[10px]">
            {[
              ['Sharpe', fmtNum(r.sharpeRatio)],
              ['Max DD', fmtPct(r.maxDrawdown)],
              ['Win Rate', fmtPct(r.winRate)],
              ['Total P&L', `$${fmtNum(r.totalPnlUsd, 0)}`],
              ['Profit Factor', fmtNum(r.profitFactor)],
              ['Trades', `${r.totalTrades} (${r.winningTrades}W / ${r.losingTrades}L)`],
              ['Return', fmtPct(r.totalReturn)],
              ['Volatility', fmtPct(r.volatility)],
              ['Date', new Date(r.createdAt).toLocaleDateString()],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between">
                <span className="text-muted">{label}</span>
                <span className="text-white font-medium">{value}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
