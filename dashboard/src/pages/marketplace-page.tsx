/**
 * Marketplace Page — strategy catalogue with browse, subscribe, and manage.
 *
 * Tabs:
 *  - Browse — discover published strategies, filter, sort, subscribe
 *  - My Subscriptions — manage active/paused subscriptions, view P&L
 */
import { useState, useCallback, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useMarketplace } from '../hooks/use-marketplace';
import { useAuthStore } from '../stores/auth-store';
import { useTranslation } from 'react-i18next';
import type { MarketplaceSubscription, StrategyFilters } from '../hooks/use-marketplace';
import { ConfirmationDialog } from '../components/confirmation-dialog';
import { SubscriptionDetail } from '../components/subscription-detail';
import type { ExecutionRecord } from '../components/subscription-detail';
import { BacktestResults } from '../components/backtest-results';
import { MarketplaceBadge } from '../components/marketplace-badge';

const CATEGORIES = ['arbitrage', 'momentum', 'mean-reversion', 'statistical', 'portfolio', 'risk', 'hedging', 'other'];
const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'sharpe', label: 'Sharpe Ratio' },
  { value: 'subscriber_count', label: 'Popular' },
  { value: 'total_pnl', label: 'Total P&L' },
  { value: 'win_rate', label: 'Win Rate' },
  { value: 'created_at', label: 'Newest' },
];

type TabId = 'browse' | 'subscriptions';

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
  const { t } = useTranslation();

  const {
    strategies, subscriptions, loading, error, total, totalPages,
    loadStrategies, loadSubscriptions,
    subscribe, updateSubscription, executeSubscription,
  } = useMarketplace();

  const [activeTab, setActiveTab] = useState<TabId>('browse');
  const [filters, setFilters] = useState<StrategyFilters>({ sortBy: 'sharpe', sortOrder: 'desc', limit: 12 });
  const [subscribeModal, setSubscribeModal] = useState<{ listingId: string; strategyName: string; priceCents: number } | null>(null);
  const [allocPercent, setAllocPercent] = useState(25);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [executing, setExecuting] = useState<string | null>(null);
  const [subscribing, setSubscribing] = useState(false);
  const [subscribeError, setSubscribeError] = useState<string | null>(null);
  const [subscribeSuccess, setSubscribeSuccess] = useState(false);
  const [pollingPayment, setPollingPayment] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<MarketplaceSubscription | null>(null);
  const [executionHistory, setExecutionHistory] = useState<Map<string, ExecutionRecord>>(new Map());

  const tenantId = useAuthStore((s) => s.tenantId);

  useEffect(() => {
    loadSubscriptions();
  }, [loadSubscriptions]);

  const subByStrategy = useMemo(() => {
    const m = new Map<string, MarketplaceSubscription>();
    for (const s of subscriptions) m.set(s.strategyId, s);
    return m;
  }, [subscriptions]);

  const strategyNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of strategies) m.set(s.id, s.name);
    return m;
  }, [strategies]);

  /** Sort featured strategies first, then by name. */
  const sortedStrategies = useMemo(() => {
    return [...strategies].sort((a, b) => {
      const aFeatured = a.tags?.includes('featured') ?? false;
      const bFeatured = b.tags?.includes('featured') ?? false;
      if (aFeatured !== bFeatured) return aFeatured ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [strategies]);

  const handleFilter = useCallback((key: string, value: string | number | undefined) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value || undefined, page: 1 };
      loadStrategies(next);
      return next;
    });
  }, [loadStrategies]);

  const handleSubscribe = useCallback(async () => {
    if (!subscribeModal) return;
    setSubscribing(true);
    setSubscribeError(null);
    setSubscribeSuccess(false);
    try {
      const result = await subscribe(subscribeModal.listingId, allocPercent);
      if (result?.checkoutUrl) {
        setCheckoutUrl(result.checkoutUrl);
      } else {
        // Free subscription — show success briefly
        setSubscribeSuccess(true);
        loadSubscriptions();
      }
    } catch (err) {
      setSubscribeError(err instanceof Error ? err.message : 'Subscribe failed. Please try again.');
    } finally {
      setSubscribing(false);
    }
  }, [subscribeModal, allocPercent, subscribe, loadSubscriptions]);

  const handleCheckPayment = useCallback(async () => {
    if (!subscribeModal) return;
    setPollingPayment(true);
    setSubscribeError(null);
    const maxAttempts = 10;
    const intervalMs = 5000;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, intervalMs));
      const subs = await loadSubscriptions();
      if (!subs) continue;
      const found = subs.find(
        (s) => s.status === 'active' && s.listingId === subscribeModal.listingId,
      );
      if (found) {
        setPollingPayment(false);
        setSubscribeSuccess(true);
        return;
      }
    }
    setPollingPayment(false);
    setSubscribeError('Payment not detected yet. If you already paid, the system may take a few minutes to process. Please try again later.');
  }, [subscribeModal, loadSubscriptions]);

  const handlePauseResume = useCallback(async (sub: MarketplaceSubscription) => {
    const action = sub.status === 'active' ? 'pause' : 'resume';
    await updateSubscription(sub.id, action);
    loadSubscriptions();
  }, [updateSubscription, loadSubscriptions]);

  const handleCancel = useCallback((sub: MarketplaceSubscription) => {
    setCancelTarget(sub);
  }, []);

  const confirmCancel = useCallback(async () => {
    if (!cancelTarget) return;
    await updateSubscription(cancelTarget.id, 'cancel');
    setCancelTarget(null);
    loadSubscriptions();
  }, [cancelTarget, updateSubscription, loadSubscriptions]);

  const handleExecute = useCallback(async (sub: MarketplaceSubscription) => {
    setExecuting(sub.id);
    try {
      const result = await executeSubscription(sub.id) as ExecutionRecord | null;
      setExecutionHistory((prev) => {
        const next = new Map(prev);
        next.set(sub.id, result
          ? { ...result, timestamp: Date.now() }
          : { timestamp: Date.now() });
        return next;
      });
    } catch {
      setExecutionHistory((prev) => {
        const next = new Map(prev);
        next.set(sub.id, { timestamp: Date.now(), error: 'Execution failed' });
        return next;
      });
    } finally {
      setExecuting(null);
      loadSubscriptions();
    }
  }, [executeSubscription, loadSubscriptions]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-white text-2xl font-bold tracking-tight">{t('marketplace.title')}</h1>
          <p className="text-muted text-xs mt-1">
            {t('marketplace.subtitle')}
            {total > 0 && ` ${t('marketplace.strategiesAvailable', { count: total })}`}
          </p>
        </div>
        <div className="flex gap-2">
          {tenantId && (
            <Link
              to={`/app/subscriber/${tenantId}/overview`}
              className="text-xs text-accent border border-accent/30 px-3 py-1.5 rounded hover:bg-accent/10 transition-colors"
            >
              {t('marketplace.subscriberPortal')}
            </Link>
          )}
          <button
            type="button"
            onClick={() => { loadSubscriptions(); loadStrategies(filters); }}
            className="text-xs text-muted border border-bg-border px-3 py-1.5 rounded hover:text-white hover:border-muted/50 transition-colors"
          >
            ↻ {t('marketplace.refresh')}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-bg-border pb-0">
        {([
          { id: 'browse' as TabId, label: t('marketplace.browse'), count: total },
          { id: 'subscriptions' as TabId, label: t('marketplace.mySubscriptions'), count: subscriptions.length },
        ]).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition-colors min-h-touch ${
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
              placeholder={t('marketplace.searchPlaceholder')}
              value={filters.search ?? ''}
              onChange={(e) => handleFilter('search', e.target.value || undefined)}
              className="bg-bg-surface border border-bg-border rounded px-3 py-1.5 text-xs text-white placeholder-muted w-48 focus:outline-none focus:border-accent/50"
            />
            <select
              value={filters.category ?? ''}
              onChange={(e) => handleFilter('category', e.target.value || undefined)}
              className="bg-bg-surface border border-bg-border rounded px-2.5 py-1.5 text-xs text-white cursor-pointer"
            >
              <option value="">{t('marketplace.allCategories')}</option>
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
            <div className="text-muted text-xs py-12 text-center">{t('marketplace.loadingStrategies')}</div>
          ) : strategies.length === 0 ? (
            <div className="text-muted text-xs py-12 text-center">
              {t('marketplace.noStrategiesFound')}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {sortedStrategies.map((s) => {
                const mySub = subByStrategy.get(s.id);
                const isSubbed = mySub?.status === 'active';
                const isPending = mySub?.status === 'pending_payment';
                const isPaused = mySub?.status === 'paused';
                return (
                  <div
                    key={s.id}
                    className={`bg-bg-surface border rounded-lg p-4 flex flex-col gap-3 transition-colors ${
                      isSubbed ? 'border-accent/40' : isPending ? 'border-yellow-400/40' : 'border-bg-border hover:border-accent/30'
                    }`}
                  >
                    {/* Name + Badges */}
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        to={`/app/strategies/${s.id}`}
                        className="text-white font-semibold text-xs leading-snug hover:text-accent transition-colors"
                      >
                        {s.name}
                      </Link>
                      <div className="flex gap-1.5 shrink-0">
                        {isSubbed && (
                          <span className={`text-[10px] border px-1.5 py-0.5 rounded ${statusColor('active')}`}>
                            {t('marketplace.subscribed')}
                          </span>
                        )}
                        {isPending && (
                          <span className={`text-[10px] border px-1.5 py-0.5 rounded ${statusColor('pending_payment')}`}>
                            {t('marketplace.paymentPending')}
                          </span>
                        )}
                        {s.tags?.includes('featured') && (
                          <span className="text-[10px] border border-accent/40 text-accent px-1.5 py-0.5 rounded">
                            🏆 {t('marketplace.topPerformer')}
                          </span>
                        )}
                        {s.listingId && <MarketplaceBadge listingId={s.listingId} />}
                        <span className="text-[10px] border border-bg-border text-muted px-1.5 py-0.5 rounded">
                          {s.category}
                        </span>
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-muted text-[11px] leading-relaxed line-clamp-2">
                      {s.description || t('marketplace.noDescription')}
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
                            <span className="text-white">{value ?? '—'}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Backtest history (expandable) */}
                    {isSubbed && (
                      <div className="border-t border-bg-border pt-2">
                        <BacktestResults strategyId={s.id} />
                      </div>
                    )}

                    {/* CTA */}
                    <div className="flex gap-2">
                      <Link
                        to={`/app/strategies/${s.id}`}
                        className="flex-1 text-center text-[10px] text-accent border border-accent/30 py-2 rounded hover:bg-accent/10 transition-colors min-h-touch"
                      >
                        {t('marketplace.viewDetails')}
                      </Link>
                      {isSubbed ? (
                        <div className="flex-1 text-center text-[10px] text-profit font-bold py-2 border border-profit/30 rounded">
                          {t('marketplace.active')}
                        </div>
                      ) : isPending ? (
                        <div className="flex-1 text-center text-[10px] text-yellow-400 py-2 border border-yellow-400/30 rounded">
                          {t('marketplace.paymentPending')}
                        </div>
                      ) : isPaused ? (
                        <div className="flex-1 text-center text-[10px] text-muted py-2 border border-bg-border rounded">
                          {t('marketplace.paused')}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setSubscribeModal({
                            listingId: s.listingId ?? s.id,
                            strategyName: s.name,
                            priceCents: s.listingPriceUsdMonthly ?? 0,
                          })}
                          className="flex-1 text-center text-[10px] font-bold bg-accent text-bg py-2 rounded hover:bg-accent/80 transition-colors min-h-touch"
                        >
                          {s.listingPriceUsdMonthly && s.listingPriceUsdMonthly > 0
                            ? t('marketplace.subscribePrice', { price: (s.listingPriceUsdMonthly / 100).toFixed(2) })
                            : t('marketplace.subscribeFree')}
                        </button>
                      )}
                    </div>
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
                  className={`px-3 py-1 text-xs rounded border min-h-touch ${
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
            <div className="text-center py-12 space-y-3">
              <p className="text-muted text-xs">
                {t('marketplace.noSubscriptions')}
              </p>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('browse');
                  loadStrategies(filters);
                }}
                className="px-4 py-2 text-xs font-bold bg-accent text-bg rounded hover:bg-accent/80 transition-colors min-h-touch"
              >
                {t('marketplace.browseStrategies')}
              </button>
            </div>
          ) : subscriptions.every((s) => s.status !== 'active') ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-muted text-xs">
                {t('marketplace.noActiveSubscriptions')}
              </p>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('browse');
                  loadStrategies(filters);
                }}
                className="px-4 py-2 text-xs font-bold bg-accent text-bg rounded hover:bg-accent/80 transition-colors min-h-touch"
              >
                {t('marketplace.browseStrategies')}
              </button>
            </div>
          ) : (
            subscriptions.map((sub) => (
              <SubscriptionDetail
                key={sub.id}
                subscription={sub}
                strategyName={
                  strategyNameById.get(sub.strategyId) ??
                  `Strategy #${sub.strategyId.slice(0, 12)}...`
                }
                executionHistory={executionHistory}
                isExecuting={executing === sub.id}
                onPauseResume={handlePauseResume}
                onCancel={handleCancel}
                onExecute={handleExecute}
              />
            ))
          )}
        </div>
      )}

      {/* Subscribe Modal */}
      {subscribeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => { setSubscribeModal(null); setCheckoutUrl(null); setSubscribeError(null); setSubscribeSuccess(false); }}>
          <div
            className="bg-bg-surface border border-bg-border rounded-xl p-6 w-full max-w-sm space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-white font-bold text-sm">{t('marketplace.subscribeModalTitle')}</h2>
              <button
                type="button"
                onClick={() => { setSubscribeModal(null); setCheckoutUrl(null); setSubscribeError(null); setSubscribeSuccess(false); }}
                className="text-muted hover:text-white text-lg leading-none"
              >
                ×
              </button>
            </div>

            {subscribeSuccess ? (
              /* ── Success State ── */
              <div className="space-y-4 py-4 text-center">
                <div className="w-16 h-16 mx-auto rounded-full bg-profit/20 flex items-center justify-center">
                  <span className="text-profit text-3xl font-bold">✓</span>
                </div>
                <div>
                  <p className="text-white font-bold text-sm">Strategy Activated!</p>
                  <p className="text-muted text-xs mt-1">
                    Your subscription to{' '}
                    <span className="text-white">{subscribeModal.strategyName}</span>{' '}
                    is now active.
                  </p>
                </div>
                <div className="border-t border-bg-border pt-3 mt-2">
                  <p className="text-[10px] text-muted mb-2">
                    Refer friends and earn 10% of their fees.{' '}
                    <Link to="/app/referral" className="text-accent hover:underline">
                      Learn more
                    </Link>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setSubscribeModal(null); setCheckoutUrl(null); setSubscribeError(null); setSubscribeSuccess(false); setPollingPayment(false); }}
                  className="px-6 py-2 text-xs font-bold bg-accent text-bg rounded hover:bg-accent/80 transition-colors"
                >
                  Done
                </button>
              </div>
            ) : subscribing ? (
              /* ── Loading State (checkout URL generating) ── */
              <div className="space-y-4 py-4 text-center">
                <div className="flex justify-center">
                  <svg className="animate-spin h-8 w-8 text-accent" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                </div>
                <p className="text-muted text-xs">
                  Generating checkout URL...
                </p>
                <p className="text-muted text-[10px]">
                  Please wait while we prepare your payment link.
                </p>
              </div>
            ) : checkoutUrl ? (
              /* ── Payment Pending State ── */
              <div className="space-y-3">
                {subscribeError && (
                  <div className="bg-loss/10 border border-loss/30 rounded p-3 text-xs text-loss">
                    {subscribeError}
                  </div>
                )}
                <p className="text-xs text-yellow-400 font-medium">
                  Complete payment to activate your subscription:
                </p>

                {/* Checkout link */}
                <div className="bg-bg-surface/50 border border-bg-border rounded p-3">
                  <p className="text-[10px] text-muted mb-2">Send USDT payment via:</p>
                  <a
                    href={checkoutUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-center text-xs font-bold bg-accent text-bg py-2.5 rounded hover:bg-accent/80 transition-colors"
                  >
                    Pay with USDT (NOWPayments)
                  </a>
                </div>

                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={handleCheckPayment}
                    disabled={pollingPayment}
                    className="w-full text-center text-xs font-bold bg-accent/20 text-accent border border-accent/30 py-2 rounded hover:bg-accent/30 disabled:opacity-50 transition-colors"
                  >
                    {pollingPayment ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Checking payment status...
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        I've paid
                      </span>
                    )}
                  </button>
                  <p className="text-[10px] text-muted text-center">
                    After sending payment, click "I've paid" to verify. Status checks every 5 seconds.
                  </p>
                </div>
              </div>
            ) : (
              /* ── Subscribe Form ── */
              <>
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

                {subscribeModal.priceCents > 0 && (
                  <p className="text-xs text-white">
                    Price: <span className="text-accent font-bold">${(subscribeModal.priceCents / 100).toFixed(2)}/mo</span>
                  </p>
                )}

                {subscribeError && (
                  <div className="bg-loss/10 border border-loss/30 rounded p-3 text-xs text-loss">
                    {subscribeError}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleSubscribe}
                  className="w-full text-xs font-bold bg-accent text-bg py-2.5 rounded hover:bg-accent/80 transition-colors"
                >
                  {subscribeModal.priceCents > 0
                    ? `Subscribe — $${(subscribeModal.priceCents / 100).toFixed(2)}/mo`
                    : 'Subscribe (Free)'}
                </button>

                {subscribeError && (
                  <button
                    type="button"
                    onClick={handleSubscribe}
                    className="w-full text-center text-[10px] text-accent hover:text-white transition-colors"
                  >
                    Retry
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Cancel Confirmation Dialog */}
      <ConfirmationDialog
        open={cancelTarget !== null}
        title={t('marketplace.cancelSubscription')}
        message={
          cancelTarget && (
            <span>
              Cancel subscription to{' '}
              <span className="text-white font-semibold">
                {strategyNameById.get(cancelTarget.strategyId) ??
                  `Strategy #${cancelTarget.strategyId.slice(0, 12)}...`}
              </span>
              ? This cannot be undone.
            </span>
          )
        }
        confirmLabel={t('marketplace.cancelSubscription')}
        cancelLabel={t('marketplace.goBack')}
        variant="danger"
        onConfirm={confirmCancel}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  );
}

export default MarketplacePage;
