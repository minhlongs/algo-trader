/**
 * LeaderboardPage
 *
 * Strategy performance leaderboard page.
 * Fetches GET /api/v1/leaderboard on mount.
 * Displays sortable table with search filter, loading/error/empty states.
 */
import { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { useApiClient } from '../hooks/use-api-client';
import type { LeaderboardEntry, LeaderboardResponse } from '../types/api';
import { LeaderboardTable } from '../components/leaderboard/leaderboard-table';

export function LeaderboardPage() {
  const { fetchApi } = useApiClient();

  const [data, setData] = useState<LeaderboardEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchApi<LeaderboardResponse>('/v1/leaderboard');
        if (!cancelled) {
          if (result) {
            setData(result.data ?? []);
            setTotal(result.total ?? 0);
          } else {
            setData([]);
            setTotal(0);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError('Failed to load leaderboard data.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [fetchApi]);

  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter((e) => e.strategy.toLowerCase().includes(q));
  }, [data, search]);

  /* ── Loading state ── */
  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-accent text-2xl font-bold">Strategy Leaderboard</h1>
        <div className="bg-bg-surface border border-bg-border rounded-lg p-8">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-bg-border rounded w-1/3" />
            <div className="h-8 bg-bg-border rounded" />
            <div className="h-8 bg-bg-border rounded" />
            <div className="h-8 bg-bg-border rounded" />
            <div className="h-8 bg-bg-border rounded" />
          </div>
        </div>
      </div>
    );
  }

  /* ── Error state ── */
  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-accent text-2xl font-bold">Strategy Leaderboard</h1>
        <div className="bg-bg-surface border border-loss/30 rounded-lg p-8 text-center">
          <p className="text-loss text-sm">Failed to load data.</p>
          <p className="text-muted text-xs mt-1">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 text-xs bg-accent text-bg font-bold px-4 py-2 rounded hover:opacity-90 transition-opacity min-h-touch"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-white text-xl sm:text-2xl font-bold tracking-tight">
            Strategy Leaderboard
          </h1>
          <p className="text-muted text-xs mt-0.5">
            Performance rankings across all strategies
            {total > 0 && ` · ${total} strategies`}
          </p>
        </div>
      </div>

      {/* Search filter */}
      <div className="relative max-w-xs">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search strategies..."
          className="w-full pl-9 pr-3 py-2 text-xs rounded border border-bg-border bg-bg-surface text-white placeholder:text-muted/50 focus:border-accent focus:outline-none transition-colors"
          aria-label="Search strategies"
        />
      </div>

      {/* Summary cards */}
      {data.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-bg-surface border border-bg-border rounded-lg p-4">
            <p className="text-muted text-[10px] uppercase tracking-widest mb-1">Total Strategies</p>
            <p className="text-white font-mono text-lg font-bold">{total || data.length}</p>
          </div>
          <div className="bg-bg-surface border border-bg-border rounded-lg p-4">
            <p className="text-muted text-[10px] uppercase tracking-widest mb-1">Avg Win Rate</p>
            <p className="text-profit font-mono text-lg font-bold">
              {data.length > 0
                ? `${(data.reduce((s, e) => s + e.winRate, 0) / data.length).toFixed(1)}%`
                : '—'}
            </p>
          </div>
          <div className="bg-bg-surface border border-bg-border rounded-lg p-4">
            <p className="text-muted text-[10px] uppercase tracking-widest mb-1">Avg Sharpe</p>
            <p className="text-accent font-mono text-lg font-bold">
              {data.length > 0
                ? (data.reduce((s, e) => s + e.sharpe, 0) / data.length).toFixed(2)
                : '—'}
            </p>
          </div>
          <div className="bg-bg-surface border border-bg-border rounded-lg p-4">
            <p className="text-muted text-[10px] uppercase tracking-widest mb-1">Total P&L</p>
            <p className={`font-mono text-lg font-bold ${
              data.reduce((s, e) => s + e.pnl, 0) >= 0 ? 'text-profit' : 'text-loss'
            }`}>
              {(() => {
                const totalPnl = data.reduce((s, e) => s + e.pnl, 0);
                const abs = Math.abs(totalPnl);
                const formatted = abs >= 1000
                  ? abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  : abs.toFixed(2);
                return (totalPnl < 0 ? '-' : '') + '$' + formatted;
              })()}
            </p>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-bg-surface/80 backdrop-blur-sm border border-bg-border rounded-lg overflow-hidden">
        {filtered.length > 0 ? (
          <LeaderboardTable entries={filtered} />
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-muted">
            <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1" viewBox="0 0 24 24" className="mb-3 opacity-30">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="3" y1="15" x2="21" y2="15" />
              <line x1="9" y1="9" x2="9" y2="21" />
            </svg>
            <p className="text-sm">
              {search ? 'No strategies match your search' : 'No leaderboard data available'}
            </p>
            {search && (
              <button
                onClick={() => setSearch('')}
                className="mt-2 text-xs text-accent hover:underline"
              >
                Clear filter
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
