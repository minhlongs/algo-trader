/**
 * Subscriber Overview Page
 * KPI cards: total P&L, win rate, fills, blocked-DLP count, active signals.
 * Entry point for the multi-tenant subscriber lens.
 */

import { useAuthStore } from '../stores/auth-store';
import { useSubscriberPnl } from '../hooks/use-subscriber-pnl';
import { SubscriberKpiCard } from '../components/subscriber-kpi-card';

function fmt(n: number, dec = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function pctFmt(n: number): string {
  return `${fmt(n * 100, 1)}%`;
}

interface ErrorBannerProps { message: string; onRetry: () => void }
function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div className="p-4 bg-loss/10 border border-loss/40 rounded-lg text-loss text-sm font-mono flex items-center justify-between">
      <span>{message}</span>
      <button
        onClick={onRetry}
        className="ml-4 px-3 py-1 bg-loss/20 hover:bg-loss/30 rounded text-xs transition-colors"
      >
        Retry
      </button>
    </div>
  );
}

export function SubscriberOverviewPage() {
  const tenantId = useAuthStore((s) => s.tenantId);
  const { summary, activity, loading, error, refresh } = useSubscriberPnl(tenantId);

  if (!tenantId) {
    return (
      <div className="p-6 text-muted text-sm font-mono">
        No subscriber identity found. Please log in with a valid license key.
      </div>
    );
  }

  if (loading && !summary) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted font-mono text-sm">
        Loading subscriber metrics...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white font-mono">Subscriber Overview</h1>
          <p className="text-muted text-xs font-mono mt-0.5">
            Tenant: <span className="text-accent">{tenantId}</span>
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="px-3 py-1.5 bg-surface border border-border rounded text-xs font-mono text-muted hover:text-white hover:border-accent transition-colors disabled:opacity-40"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && <ErrorBanner message={error} onRetry={refresh} />}

      {/* P&L KPI row */}
      <section>
        <h2 className="text-[10px] uppercase tracking-widest text-muted font-mono mb-3">
          P&amp;L Summary
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          <SubscriberKpiCard
            label="Total Realized P&L"
            value={summary ? (summary.totalRealizedPnl >= 0 ? '+' : '') + fmt(summary.totalRealizedPnl, 4) : '—'}
            accent={summary && summary.totalRealizedPnl >= 0 ? 'profit' : 'loss'}
            subLabel="USDT"
          />
          <SubscriberKpiCard
            label="Win Rate"
            value={summary ? pctFmt(summary.winRate) : '—'}
            accent={summary && summary.winRate >= 0.5 ? 'profit' : 'loss'}
            subLabel={summary ? `${summary.winCount}W / ${summary.lossCount}L` : undefined}
          />
          <SubscriberKpiCard
            label="Total Trades"
            value={summary?.tradeCount ?? '—'}
            subLabel="lifetime fills"
          />
          <SubscriberKpiCard
            label="Profit Factor"
            value={summary
              ? summary.profitFactor === Infinity ? '∞' : fmt(summary.profitFactor)
              : '—'}
            accent={summary && summary.profitFactor >= 1 ? 'profit' : 'loss'}
          />
        </div>
      </section>

      {/* Activity KPI row */}
      <section>
        <h2 className="text-[10px] uppercase tracking-widest text-muted font-mono mb-3">
          Activity
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          <SubscriberKpiCard
            label="Active Signals"
            value={activity?.activeSignalsCount ?? '—'}
            accent="default"
          />
          <SubscriberKpiCard
            label="Total Fills"
            value={activity?.totalFillsCount ?? '—'}
            accent="profit"
          />
          <SubscriberKpiCard
            label="Pending Orders"
            value={activity?.pendingOrdersCount ?? '—'}
            accent="warning"
          />
          <SubscriberKpiCard
            label="Blocked by DLP"
            value={activity?.blockedDlpCount ?? '—'}
            accent={activity && activity.blockedDlpCount > 0 ? 'loss' : 'muted'}
            subLabel="IronClaw Phase 03"
          />
        </div>
      </section>

      {/* Best / Worst */}
      {summary && (
        <section>
          <h2 className="text-[10px] uppercase tracking-widest text-muted font-mono mb-3">
            Trade Extremes
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <SubscriberKpiCard
              label="Best Trade"
              value={`+${fmt(summary.bestTrade, 4)}`}
              accent="profit"
              subLabel="USDT"
            />
            <SubscriberKpiCard
              label="Worst Trade"
              value={fmt(summary.worstTrade, 4)}
              accent="loss"
              subLabel="USDT"
            />
          </div>
        </section>
      )}
    </div>
  );
}
