/**
 * Subscriber Trade History Page
 * Shows daily P&L breakdown table for the logged-in subscriber.
 * Scoped strictly to tenantId from auth store. Supports sorting, pagination.
 */

import { useState } from 'react';
import { useAuthStore } from '../stores/auth-store';
import { useSubscriberPnl } from '../hooks/use-subscriber-pnl';
import { SubscriberTradeTable } from '../components/subscriber-trade-table';

const PAGE_SIZE = 14;

export function SubscriberTradeHistoryPage() {
  const tenantId = useAuthStore((s) => s.tenantId);
  const { dailyBreakdown, summary, loading, error, refresh } = useSubscriberPnl(tenantId);
  const [page, setPage] = useState(0);

  if (!tenantId) {
    return (
      <div className="p-6 text-muted text-sm">
        No subscriber identity found. Please log in with a valid license key.
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(dailyBreakdown.length / PAGE_SIZE));
  const pageSlice = dailyBreakdown.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Trade History</h1>
          <p className="text-muted text-xs mt-0.5">
            Tenant: <span className="text-accent">{tenantId}</span>
            {summary && (
              <span className="ml-3 text-muted">
                &middot; {summary.tradeCount} lifetime fills
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => { refresh(); setPage(0); }}
          disabled={loading}
          className="px-3 py-1.5 bg-surface border border-border rounded text-xs text-muted hover:text-white hover:border-accent transition-colors disabled:opacity-40 min-h-touch"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="p-4 bg-loss/10 border border-loss/40 rounded-lg text-loss text-sm flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => { refresh(); setPage(0); }}
            className="ml-4 px-3 py-1 bg-loss/20 hover:bg-loss/30 rounded text-xs transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Trade breakdown table */}
      <SubscriberTradeTable rows={pageSlice} loading={loading && dailyBreakdown.length === 0} />

      {/* Pagination controls */}
      {!loading && dailyBreakdown.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-muted text-xs">
            {page * PAGE_SIZE + 1}&ndash;{Math.min((page + 1) * PAGE_SIZE, dailyBreakdown.length)} of{' '}
            {dailyBreakdown.length} daily rows
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              aria-label="Previous page"
              className="px-3 py-1 text-xs border border-bg-border rounded text-muted hover:border-accent hover:text-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              &larr; Prev
            </button>
            <span className="px-3 py-1 text-xs text-muted">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              aria-label="Next page"
              className="px-3 py-1 text-xs border border-bg-border rounded text-muted hover:border-accent hover:text-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Next &rarr;
            </button>
          </div>
        </div>
      )}

      {/* Period note */}
      {!loading && dailyBreakdown.length > 0 && (
        <p className="text-muted text-[10px] text-right">
          Showing last 30 days &middot; {dailyBreakdown.length} daily rows total
        </p>
      )}
    </div>
  );
}
