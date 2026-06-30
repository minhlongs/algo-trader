/**
 * Marketplace Page — strategy catalogue with browse, subscribe, and manage.
 *
 * Tabs:
 *  - Browse — discover published strategies, filter, sort, subscribe
 *  - My Subscriptions — manage active/paused subscriptions, view P&L
 */
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useMarketplace } from '../hooks/use-marketplace';
import type { MarketplaceSubscription, StrategyFilters } from '../hooks/use-marketplace';

const CATEGORIES = ['arbitrage', 'momentum', 'mean-reversion', 'statistical', 'portfolio', 'risk', 'hedging', 'other'];
const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'sharpe', label: 'Sharpe Ratio' },
  { value: 'subscriber_count', label: 'Popular' },
  { value: 'total_pnl', label: 'Total P&L' },
  { value: 'win_rate', label: 'Win Rate' },
  { value: 'created_at', label: 'Newest' },
];

type TabId = 'browse' | 'subscriptions';

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

function statusColor(status: string): string {
  switch (status) {
    case 'active': return 'text-profit border-profit/30 bg-profit/10';
    case 'paused': return 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10';
    case 'cancelled': return 'text-loss border-loss/30 bg-loss/10';
    case 'pending_payment': return 'text-muted border-muted/30 bg-muted/10';
    default: return 'text-muted border-bg-border bg-bg-border/30';
  }
}

export function MarketplacePage() {
  const {
    strategies, subscriptions, loading, error, total, totalPages,
    loadStrategies, loadSubscriptions,
    subscribe, updateSubscription, executeSubscription,
  } = useMarketplace();

  const [activeTab, setActiveTab] = useState<TabId>('browse');
  const [filters, setFilters] = useState<StrategyFilters>({ sortBy: 'sharpe', sortOrder: 'desc', limit: 12 });
  const [subscribeModal, setSubscribeModal] = useState<{ listingId: string; strategyName: string; priceUsd: number } | null>(null);
  const [allocPercent, setAllocPercent] = useState(25);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [executing, setExecuting] = useState<string | null>(null);

  useEffect(() => {
    loadSubscriptions();
  }, [loadSubscriptions]);

  const subByStrategy = useMemo(() => {
    const m = new Map<string, MarketplaceSubscription>();
    for (const s of subscriptions) m.set(s.strategyId, s);
    return m;
  }, [subscriptions]);

  const handleFilter = useCallback((key: string, value: string | number | undefined) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value || undefined, page: 1 };
      loadStrategies(next);
      return next;
    });
  }, [loadStrategies]);

  const handleSubscribe = useCallback(async () => {
    if (!subscribeModal) return;
    const result = await subscribe(subscribeModal.listingId, allocPercent);
    if (result?.checkoutUrl) {
      setCheckoutUrl(result.checkoutUrl);
    } else {
      setSubscribeModal(null);
      loadSubscriptions();
    }
  }, [subscribeModal, allocPercent, subscribe, loadSubscriptions]);

  const handlePauseResume = useCallback(async (sub: MarketplaceSubscription) => {
    const action = sub.status === 'active' ? 'pause' : 'resume';
    await updateSubscription(sub.id, action);
    loadSubscriptions();
  }, [updateSubscription, loadSubscriptions]);

  const handleCancel = useCallback(async (sub: MarketplaceSubscription) => {
    if (!confirm('Cancel this subscription?')) return;
    await updateSubscription(sub.id, 'cancel');
    loadSubscriptions();
  }, [updateSubscription, loadSubscriptions]);

  const handleExecute = useCallback(async (sub: MarketplaceSubscription) => {
    setExecuting(sub.id);
    await executeSubscription(sub.id);
    setExecuting(null);
    loadSubscriptions();
  }, [executeSubscription, loadSubscriptions]);

  return (
    <div className="space-y-6 font-mono">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-white text-2xl font-bold tracking-tight">Marketplace</h1>
          <p className="text-muted text-xs mt-1">
            Discover and subscribe to algorithmic trading strategies.
            {total > 0 && ` ${total} strategies available.`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { loadSubscriptions(); loadStrategies(filters); }}
            className="text-xs text-muted border border-bg-border px-3 py-1.5 rounded hover:text-white hover:border-muted/50 transition-colors"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-bg-border pb-0">
        {([
          { id: 'browse' as TabId, label: 'Browse', count: total },
          { id: 'subscriptions' as TabId, label: 'My Subscriptions', count: subscriptions.length },
        ]).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'text-accent border-accent'
                : 'text-muted border-transparent hover:text-white'
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] bg-bg-surface border border-bg-border">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-loss/10 border border-loss/30 rounded p-3 text-xs text-loss">
          {error}
        </div>
      )}

      {/* Browse Tab */}
      {activeTab === 'browse' && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <input
              type="text"
              placeholder="Search strategies..."
              value={filters.search ?? ''}
              onChange={(e) => handleFilter('search', e.target.value || undefined)}
              className="bg-bg-surface border border-bg-border rounded px-3 py-1.5 text-xs text-white placeholder-muted w-48 focus:outline-none focus:border-accent/50"
            />
            <select
              value={filters.category ?? ''}
              onChange={(e) => handleFilter('category', e.target.value || undefined)}
              className="bg-bg-surface border border-bg-border rounded px-2.5 py-1.5 text-xs text-white cursor-pointer"
            >
              <option value="">All Categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              value={`${filters.sortBy ?? 'sharpe'}-${filters.sortOrder ?? 'desc'}`}
              onChange={(e) => {
                const [sortBy, sortOrder] = e.target.value.split('-');
                setFilters((prev) => ({ ...prev, sortBy, sortOrder: sortOrder as 'asc' | 'desc', page: 1 }));
                loadStrategies({ ...filters, sortBy, sortOrder: sortOrder as 'asc' | 'desc' });
              }}
              className="bg-bg-surface border border-bg-border rounded px-2.5 py-1.5 text-xs text-white cursor-pointer"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={`${o.value}-desc`}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Strategy Grid */}
          {loading ? (
            <div className="text-muted text-xs py-12 text-center">Loading strategies...</div>
          ) : strategies.length === 0 ? (
            <div className="text-muted text-xs py-12 text-center">
              No strategies found. Try adjusting filters.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {strategies.map((s) => {
                const mySub = subByStrategy.get(s.id);
                const isSubbed = mySub?.status === 'active';
                return (
                  <div
                    key={s.id}
                    className={`bg-bg-surface border rounded-lg p-4 flex flex-col gap-3 transition-colors ${
                      isSubbed ? 'border-accent/40' : 'border-bg-border hover:border-accent/30'
                    }`}
                  >
                    {/* Name + Badges */}
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-white font-semibold text-xs leading-snug">
                        {s.name}
                      </h3>
                      <div className="flex gap-1.5 shrink-0">
                        {isSubbed && (
                          <span className={`text-[10px] border px-1.5 py-0.5 rounded font-mono ${statusColor('active')}`}>
                            Subscribed
                          </span>
                        )}
                        <span className="text-[10px] border border-bg-border text-muted px-1.5 py-0.5 rounded">
                          {s.category}
                        </span>
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-muted text-[11px] leading-relaxed line-clamp-2">
                      {s.description || 'No description provided.'}
                    </p>

                    {/* Stats */}
                    {s.backtestSummary && (
                      <div className="grid grid-cols-2 gap-1.5 border-t border-bg-border pt-2.5">
                        {[
                          ['Sharpe', s.backtestSummary.sharpe?.toFixed(2)],
                          ['Win Rate', `${s.backtestSummary.winRate?.toFixed(0)}%`],
                          ['Max DD', `${s.backtestSummary.maxDrawdown?.toFixed(1)}%`],
                          ['Trades', String(s.backtestSummary.totalTrades)],
                        ].map(([label, value]) => (
                          <div key={label} className="flex justify-between text-[10px]">
                            <span className="text-muted">{label}</span>
                            <span className="text-white font-mono">{value ?? '—'}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* CTA */}
                    {isSubbed ? (
                      <div className="text-center text-[10px] text-accent font-bold py-1.5 border border-accent/30 rounded">
                        ✓ Active
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setSubscribeModal({
                          listingId: s.id,
                          strategyName: s.name,
                          priceUsd: 0, // Free strategies for now
                        })}
                        className="text-center text-xs font-bold bg-accent text-bg py-2 rounded hover:bg-accent/80 transition-colors"
                      >
                        Subscribe
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handleFilter('page', p)}
                  className={`px-3 py-1 text-xs rounded border ${
                    (filters.page ?? 1) === p
                      ? 'border-accent text-accent bg-accent/10'
                      : 'border-bg-border text-muted hover:text-white'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Subscriptions Tab */}
      {activeTab === 'subscriptions' && (
        <div className="space-y-3">
          {subscriptions.length === 0 ? (
            <div className="text-muted text-xs py-12 text-center">
              No subscriptions yet. Browse strategies to subscribe.
            </div>
          ) : (
            subscriptions.map((sub) => (
              <div
                key={sub.id}
                className={`bg-bg-surface border rounded-lg p-4 flex flex-col md:flex-row md:items-center gap-3 ${
                  sub.status === 'active' ? 'border-accent/30' : 'border-bg-border'
                }`}
              >
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-semibold text-xs">
                      Strategy #{sub.strategyId.slice(0, 12)}...
                    </span>
                    <span className={`text-[10px] border px-1.5 py-0.5 rounded font-mono ${statusColor(sub.status)}`}>
                      {sub.status}
                    </span>
                  </div>
                  <div className="flex gap-3 text-[10px] text-muted">
                    <span>Alloc: {sub.allocationPercent}%</span>
                    <span>Invested: {formatCents(sub.currentInvestmentUsd)}</span>
                    <span className={sub.totalPnlUsd >= 0 ? 'text-profit' : 'text-loss'}>
                      P&L: {formatCents(sub.totalPnlUsd)}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  {sub.status === 'active' && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleExecute(sub)}
                        disabled={executing === sub.id}
                        className="px-3 py-1.5 text-[10px] font-bold bg-accent/20 text-accent border border-accent/30 rounded hover:bg-accent/30 disabled:opacity-50"
                      >
                        {executing === sub.id ? '...' : 'Execute'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePauseResume(sub)}
                        className="px-3 py-1.5 text-[10px] font-bold text-yellow-400 border border-yellow-400/30 rounded hover:bg-yellow-400/10"
                      >
                        Pause
                      </button>
                    </>
                  )}
                  {sub.status === 'paused' && (
                    <button
                      type="button"
                      onClick={() => handlePauseResume(sub)}
                      className="px-3 py-1.5 text-[10px] font-bold text-profit border border-profit/30 rounded hover:bg-profit/10"
                    >
                      Resume
                    </button>
                  )}
                  {(sub.status === 'active' || sub.status === 'paused') && (
                    <button
                      type="button"
                      onClick={() => handleCancel(sub)}
                      className="px-3 py-1.5 text-[10px] font-bold text-loss border border-loss/30 rounded hover:bg-loss/10"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Subscribe Modal */}
      {subscribeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setSubscribeModal(null)}>
          <div
            className="bg-bg-surface border border-bg-border rounded-xl p-6 w-full max-w-sm space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-white font-bold text-sm">Subscribe</h2>
              <button
                type="button"
                onClick={() => setSubscribeModal(null)}
                className="text-muted hover:text-white text-lg leading-none"
              >
                ×
              </button>
            </div>

            <p className="text-muted text-xs">
              Subscribe to <span className="text-white">{subscribeModal.strategyName}</span>
            </p>

            <div className="space-y-2">
              <label className="text-[10px] text-muted block">
                Allocation Percentage
              </label>
              <input
                type="range"
                min={1}
                max={100}
                value={allocPercent}
                onChange={(e) => setAllocPercent(Number(e.target.value))}
                className="w-full accent-accent"
              />
              <div className="flex justify-between text-[10px] text-muted">
                <span>1%</span>
                <span className="text-accent font-bold">{allocPercent}%</span>
                <span>100%</span>
              </div>
            </div>

            {checkoutUrl ? (
              <div className="space-y-3">
                <p className="text-xs text-yellow-400">
                  Complete payment to activate your subscription:
                </p>
                <a
                  href={checkoutUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center text-xs font-bold bg-accent text-bg py-2.5 rounded hover:bg-accent/80 transition-colors"
                >
                  Pay with USDT (NOWPayments)
                </a>
                <button
                  type="button"
                  onClick={() => { setCheckoutUrl(null); setSubscribeModal(null); loadSubscriptions(); }}
                  className="w-full text-center text-[10px] text-muted hover:text-white"
                >
                  I already paid
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleSubscribe}
                className="w-full text-xs font-bold bg-accent text-bg py-2.5 rounded hover:bg-accent/80 transition-colors"
              >
                Subscribe (Free)
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default MarketplacePage;
