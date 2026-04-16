/**
 * Subscriber Trade History Page
 * Shows daily P&L breakdown table for the logged-in subscriber.
 * Scoped strictly to tenantId from auth store.
 */

import { useAuthStore } from '../stores/auth-store';
import { useSubscriberPnl } from '../hooks/use-subscriber-pnl';
import { SubscriberTradeTable } from '../components/subscriber-trade-table';

export function SubscriberTradeHistoryPage() {
  const tenantId = useAuthStore((s) => s.tenantId);
  const { dailyBreakdown, summary, loading, error, refresh } = useSubscriberPnl(tenantId);

  if (!tenantId) {
    return (
      <div className="p-6 text-muted text-sm font-mono">
        No subscriber identity found. Please log in with a valid license key.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white font-mono">Trade History</h1>
          <p className="text-muted text-xs font-mono mt-0.5">
            Tenant: <span className="text-accent">{tenantId}</span>
            {summary && (
              <span className="ml-3 text-muted">
                · {summary.tradeCount} lifetime fills
              </span>
            )}
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="px-3 py-1.5 bg-surface border border-border rounded text-xs font-mono text-muted hover:text-white hover:border-accent transition-colors disabled:opacity-40"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="p-4 bg-loss/10 border border-loss/40 rounded-lg text-loss text-sm font-mono flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={refresh}
            className="ml-4 px-3 py-1 bg-loss/20 hover:bg-loss/30 rounded text-xs transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Trade breakdown table */}
      <SubscriberTradeTable rows={dailyBreakdown} loading={loading && dailyBreakdown.length === 0} />

      {/* Period note */}
      {!loading && dailyBreakdown.length > 0 && (
        <p className="text-muted text-[10px] font-mono text-right">
          Showing last 30 days · {dailyBreakdown.length} daily rows
        </p>
      )}
    </div>
  );
}
