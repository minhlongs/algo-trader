import type { BetaPortfolioView } from './poly-beta-api-client';
import { POLY_BETA_COPY, type BetaLang } from './poly-beta-copy';
import { getControlAvailability, getEngineBadgeClasses, getSellableShares } from './poly-beta-helpers';

interface Props {
  view: BetaPortfolioView;
  lang: BetaLang;
  busy: boolean;
  selectedStrategy: string;
  selectedMarket: string;
  orderShares: number;
  onSelectStrategy: (id: string) => void;
  onSelectMarket: (id: string) => void;
  onChangeShares: (shares: number) => void;
  onControl: (action: 'START' | 'PAUSE' | 'STOP') => void;
  onManualOrder: (outcome: 'YES' | 'NO', side: 'BUY' | 'SELL') => void;
  onLockedDeposit: () => void;
}

const button = 'min-h-11 px-3 py-2 rounded text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed enabled:hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300';
const field = 'w-full min-w-0 min-h-11 px-3 py-2 rounded bg-slate-950 border border-slate-700 text-xs disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300';

export function PolyBetaControlsHealth({
  view, lang, busy, selectedStrategy, selectedMarket, orderShares,
  onSelectStrategy, onSelectMarket, onChangeShares, onControl, onManualOrder, onLockedDeposit,
}: Props) {
  const t = POLY_BETA_COPY[lang];
  const guards = getControlAvailability(view, selectedMarket, orderShares, busy);
  const strategy = view.strategies.find((s) => s.id === selectedStrategy);
  const minShares = Math.max(5, guards.activeMarket?.minOrderShares ?? 5);
  const canTrade = guards.canManualTrade && Boolean(strategy);
  const sellableShares = (outcome: 'YES' | 'NO') => getSellableShares(view, selectedMarket, outcome);
  const manualButtons = [
    { outcome: 'YES', side: 'BUY', label: t.buyYes, id: 'buy-yes-btn', color: 'bg-emerald-700 text-white' },
    { outcome: 'NO', side: 'BUY', label: t.buyNo, id: 'buy-no-btn', color: 'bg-sky-700 text-white' },
    { outcome: 'YES', side: 'SELL', label: t.sellYes, id: 'sell-yes-btn', color: 'bg-slate-700 text-white' },
    { outcome: 'NO', side: 'SELL', label: t.sellNo, id: 'sell-no-btn', color: 'bg-slate-700 text-white' },
  ] as const;

  return (
    <section className="grid min-w-0 grid-cols-1 lg:grid-cols-2 gap-4" aria-busy={busy}>
      <div className="min-w-0 bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="min-w-0 font-semibold text-sm text-emerald-300">{t.strategyControl}</h2>
          <span data-testid="engine-state-badge" role="status"
            className={`shrink-0 px-2 py-1 rounded font-mono text-xs ${getEngineBadgeClasses(view.engine.state)}`}>
            {view.engine.state}
          </span>
        </div>
        <div className="space-y-1">
          <label htmlFor="beta-strategy" className="block text-xs text-slate-300">{t.strategySelectLabel}</label>
          <select id="beta-strategy" data-testid="strategy-select" value={selectedStrategy}
            disabled={busy || view.strategies.length === 0} onChange={(e) => onSelectStrategy(e.target.value)} className={field}>
            {view.strategies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        {strategy && (
          <div data-testid="selected-strategy-details" className="space-y-2 text-xs text-slate-300 break-words">
            <p>{lang === 'vi' ? strategy.summaryVi : strategy.summaryEn}</p>
            <dl className="space-y-1">
              <div><dt className="font-semibold text-slate-400">{t.feeModelLabel}</dt><dd lang="en">{strategy.feeModel}</dd></div>
              <div><dt className="font-semibold text-slate-400">{t.queueAssumptionLabel}</dt><dd lang="en">{strategy.queueAssumption}</dd></div>
            </dl>
          </div>
        )}
        <div className="space-y-1">
          <label htmlFor="beta-market" className="block text-xs text-slate-300">{t.marketSelectLabel}</label>
          <select id="beta-market" data-testid="market-select" value={selectedMarket}
            disabled={busy || view.markets.length === 0} onChange={(e) => onSelectMarket(e.target.value)} className={field}>
            {!guards.activeMarket && <option value="">{t.emptyFeedOption}</option>}
            {view.markets.map((m) => <option key={m.marketId} value={m.marketId}>{m.question}</option>)}
          </select>
        </div>
        {!guards.feedReady && <p role="status" className="text-xs text-amber-200">{t.emptyFeedNotice}</p>}
        {guards.drawdownLocked && <p role="status" className="text-xs text-rose-200">{t.drawdownLockedNotice}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" data-testid="strategy-start-btn" disabled={!guards.canStart || !strategy}
            onClick={() => onControl('START')} className={`${button} bg-emerald-500 text-slate-950`}>{t.startBtn}</button>
          <button type="button" data-testid="strategy-pause-btn" disabled={!guards.canPause}
            onClick={() => onControl('PAUSE')} className={`${button} bg-amber-500 text-slate-950`}>{t.pauseBtn}</button>
          <button type="button" data-testid="strategy-stop-btn" disabled={!guards.canStop}
            onClick={() => onControl('STOP')} className={`${button} bg-rose-700 text-white`}>{t.stopBtn}</button>
          <button type="button" data-testid="locked-deposit-btn" disabled={busy}
            onClick={onLockedDeposit} className={`${button} border border-slate-700 text-slate-300`}>{t.liveLockedBtn}</button>
        </div>
        <fieldset className="pt-2 border-t border-slate-800 space-y-2">
          <legend className="text-xs text-slate-300">{t.manualOrderTitle}</legend>
          <label htmlFor="beta-shares" className="block text-xs text-slate-400">{t.sharesInputLabel}</label>
          <input id="beta-shares" type="number" min={minShares} max={20} step="any" disabled={busy}
            aria-invalid={!guards.sharesValid} aria-describedby={!guards.sharesValid ? 'beta-shares-hint' : undefined}
            value={Number.isFinite(orderShares) ? orderShares : ''}
            onChange={(e) => onChangeShares(e.target.valueAsNumber)} className={`${field} font-mono tabular-nums`} />
          {!guards.sharesValid && <p id="beta-shares-hint" className="text-xs text-amber-200">
            {lang === 'vi' ? `Nhập từ ${minShares} đến 20 cổ phần.` : `Enter between ${minShares} and 20 shares.`}
          </p>}
          <div className="flex flex-wrap gap-2">
            {manualButtons.map((b) => <button key={b.id} type="button" data-testid={b.id}
              disabled={!canTrade || (b.side === 'SELL' && sellableShares(b.outcome) < orderShares)}
              onClick={() => onManualOrder(b.outcome, b.side)} className={`${button} ${b.color}`}>{b.label}</button>)}
          </div>
        </fieldset>
      </div>
      <div data-testid="system-health-panel" className="min-w-0 bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 text-xs">
        <h2 className="font-semibold text-sm text-emerald-300">{t.healthTitle}</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono tabular-nums break-words">
          <div><dt className="text-slate-400">{t.exposureLabel}</dt><dd>${view.summary.openExposureUsd.toFixed(2)} / ${view.limits.maxPortfolioExposureUsd.toFixed(2)}</dd></div>
          <div><dt className="text-slate-400">{t.drawdownLabel}</dt><dd>{view.summary.currentDrawdownPct}% / {view.limits.maxDrawdownPct}%</dd></div>
          <div><dt className="text-slate-400">{t.maxOrderCapLabel}</dt><dd>${view.limits.maxSingleOrderUsd.toFixed(2)}</dd></div>
          <div><dt className="text-slate-400">{t.feedStatusLabel}</dt><dd className={guards.feedReady ? 'text-emerald-300' : 'text-rose-200'}>
            {guards.feedReady ? (lang === 'vi' ? 'Ổn định' : 'Healthy') : (lang === 'vi' ? 'Không khả dụng' : 'Unavailable')}
          </dd></div>
          <div><dt className="text-slate-400">{t.cryptoGuardLabel}</dt><dd className="break-all">{view.health.cryptoFiveMinuteGuard}</dd></div>
          <div><dt className="text-slate-400">{t.liveLockLabel}</dt><dd className="break-all">{view.health.liveExecutionLock}</dd></div>
        </dl>
        {view.engine.haltReason && <div role="alert" className="p-2 rounded bg-rose-950 border border-rose-600 text-rose-200 font-mono break-all">
          {t.haltPrefix}: {view.engine.haltReason}
        </div>}
        {view.health.staleReason && <p className="text-amber-200 break-all">{view.health.staleReason}</p>}
        <p className="text-slate-400 pt-2 border-t border-slate-800">{t.simLimitationsBody}</p>
      </div>
    </section>
  );
}
