/**
 * Subscriber Equity Page
 * Renders the per-subscriber equity curve (NAV over time) + summary stats.
 */

import { useAuthStore } from '../stores/auth-store';
import { useSubscriberPnl } from '../hooks/use-subscriber-pnl';
import { SubscriberEquityChart } from '../components/subscriber-equity-chart';
import { SubscriberKpiCard } from '../components/subscriber-kpi-card';

function fmtUsd(n: number, dec = 2): string {
  const abs = Math.abs(n);
  const formatted = abs >= 1000
    ? abs.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
    : abs.toFixed(dec);
  return (n < 0 ? '-' : '') + '$' + formatted;
}

function fmtNum(n: number, dec = 4): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

export function SubscriberEquityPage() {
  const tenantId = useAuthStore((s) => s.tenantId);
  const { equity, loading, error, refresh } = useSubscriberPnl(tenantId);

  if (!tenantId) {
    return (
      <div className="p-6 text-muted text-sm">
        No subscriber identity found. Please log in with a valid license key.
      </div>
    );
  }

  if (loading && !equity) {
    return (
      <div className="flex items-center justify-center py-20 text-muted text-sm">
        Loading equity curve...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-loss/10 border border-loss/40 rounded-lg text-loss text-sm flex items-center justify-between">
        <span>{error}</span>
        <button
          onClick={refresh}
          className="ml-4 px-3 py-1 bg-loss/20 hover:bg-loss/30 rounded text-xs transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const totalReturn = equity?.totalReturn ?? 0;
  const currentNav = equity?.currentNav ?? equity?.startingCapital ?? 0;
  const startingCapital = equity?.startingCapital ?? 10000;
  const maxDrawdown = equity?.maxDrawdown ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Equity Curve</h1>
          <p className="text-muted text-xs mt-0.5">
            Tenant: <span className="text-accent">{tenantId}</span>
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="px-3 py-1.5 bg-surface border border-border rounded text-xs text-muted hover:text-white hover:border-accent transition-colors disabled:opacity-40 min-h-touch"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SubscriberKpiCard
          label="Starting Capital"
          value={fmtUsd(startingCapital)}
          subLabel="USDT"
        />
        <SubscriberKpiCard
          label="Current NAV"
          value={fmtUsd(currentNav)}
          accent={currentNav >= startingCapital ? 'profit' : 'loss'}
          subLabel="USDT"
        />
        <SubscriberKpiCard
          label="Total Return"
          value={`${totalReturn >= 0 ? '+' : ''}${fmtNum(totalReturn * 100, 2)}%`}
          accent={totalReturn >= 0 ? 'profit' : 'loss'}
        />
        <SubscriberKpiCard
          label="Max Drawdown"
          value={`${fmtNum(maxDrawdown * 100, 2)}%`}
          accent={maxDrawdown > 0.1 ? 'loss' : 'warning'}
        />
      </div>

      {/* Chart */}
      <div className="bg-surface border border-border rounded-lg p-4">
        <SubscriberEquityChart
          curve={equity?.curve ?? []}
          totalReturn={totalReturn}
          height={280}
        />
      </div>

      {/* Data points count */}
      {equity && equity.curve.length > 0 && (
        <p className="text-muted text-[10px] text-right">
          {equity.curve.length} daily snapshots · last: {equity.curve[equity.curve.length - 1].date}
        </p>
      )}
    </div>
  );
}
