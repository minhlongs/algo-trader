import type { BetaPortfolioView } from './poly-beta-api-client';
import { POLY_BETA_COPY, type BetaLang } from './poly-beta-copy';
import { buildSettleButtonLabel, fmtSignedUsd, formatIsoTimestamp } from './poly-beta-helpers';
import { PolyBetaFillsAndLogs } from './poly-beta-fills-logs';

interface TablesProps {
  view: BetaPortfolioView;
  lang: BetaLang;
  busy: boolean;
  onCancelOrder: (orderId: string) => void;
  onSettleMarket: (marketId: string, winningOutcome: 'YES' | 'NO') => void;
}

const cellNumber = 'py-2 pr-3 font-mono tabular-nums whitespace-nowrap';
const headerCell = 'py-2 pr-3 align-bottom whitespace-normal font-semibold';

export function PolyBetaLedgerTables({ view, lang, busy, onCancelOrder, onSettleMarket }: TablesProps) {
  const t = POLY_BETA_COPY[lang];

  return (
    <div className="min-w-0 space-y-6">
      <section className="min-w-0 bg-slate-900 border border-slate-800 rounded-xl p-4 md:p-5">
        <h2 className="font-semibold text-sm text-emerald-300 mb-3">{t.marketsTitle}</h2>
        <div className="min-w-0 overflow-x-auto" tabIndex={0} role="region" aria-label={t.marketsTitle}>
          <table className="w-full min-w-[44rem] text-xs text-left">
            <thead className="text-slate-400 border-b border-slate-800">
              <tr>
                <th scope="col" className={headerCell}>{t.colMarket}</th>
                <th scope="col" className={headerCell}>{t.colBidAsk}</th>
                <th scope="col" className={headerCell}>{t.colSpread}</th>
                <th scope="col" className={headerCell}>{t.colMinShares}</th>
                <th scope="col" className={`${headerCell} pr-0`}>{t.colSourceTime}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {view.markets.length === 0 && (
                <tr><td colSpan={5} className="py-3 text-slate-400">{t.emptyMarketsTable}</td></tr>
              )}
              {view.markets.map((m) => (
                <tr key={m.marketId} data-testid={`market-row-${m.marketId}`}>
                  <td className="py-2 pr-3 font-medium text-slate-100 min-w-[12rem] max-w-[18rem] truncate">{m.question}</td>
                  <td className={cellNumber}>${m.bestBid.toFixed(3)} / ${m.bestAsk.toFixed(3)}</td>
                  <td className={cellNumber}>{m.spreadBps} bps</td>
                  <td className={cellNumber}>{m.minOrderShares}</td>
                  <td className={`${cellNumber} pr-0 text-slate-400`}>{formatIsoTimestamp(m.sourceTimestampMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="min-w-0 bg-slate-900 border border-slate-800 rounded-xl p-4 md:p-5 space-y-4">
        <h2 className="font-semibold text-sm text-emerald-300">{t.positionsTitle}</h2>
        {view.openPositions.length === 0 && view.pendingOrders.length === 0 ? (
          <p className="text-xs text-slate-400">{t.emptyPositionsOrders}</p>
        ) : (
          <div className="space-y-3">
            {view.openPositions.map((p) => (
              <div key={p.tokenId} data-testid="open-position-row"
                className="flex flex-wrap items-center justify-between gap-2 p-3 rounded bg-slate-950 border border-slate-800 text-xs">
                <div className="min-w-0 break-words">
                  <span className="font-semibold text-white">{p.marketQuestion}</span>{' '}
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">{p.outcome}</span>
                </div>
                <div className="flex flex-wrap items-center gap-3 font-mono tabular-nums text-slate-300">
                  <span className="whitespace-nowrap">{p.shares.toFixed(2)} sh</span>
                  <span className="whitespace-nowrap">{t.entryPriceLabel}: ${p.avgEntryPrice.toFixed(3)}</span>
                  <span className="whitespace-nowrap">{t.markPriceLabel}: ${p.markPrice.toFixed(3)}</span>
                  <span className={`whitespace-nowrap ${p.unrealizedPnlUsd >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    MTM: {fmtSignedUsd(p.unrealizedPnlUsd)}
                  </span>
                </div>
                <div className="basis-full space-y-2 pt-2 border-t border-slate-800/70">
                  <p className="text-[11px] text-amber-200">{t.settleDrillGroupLabel}</p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" data-testid="simulate-settle-yes-btn" disabled={busy}
                      onClick={() => onSettleMarket(p.marketId, 'YES')}
                      className="min-h-11 px-2 py-1 rounded border border-amber-500/50 text-amber-200 text-[11px] disabled:opacity-50 disabled:cursor-not-allowed">
                      {buildSettleButtonLabel(p, 'YES', lang)}
                    </button>
                    <button type="button" data-testid="simulate-settle-no-btn" disabled={busy}
                      onClick={() => onSettleMarket(p.marketId, 'NO')}
                      className="min-h-11 px-2 py-1 rounded border border-amber-500/50 text-amber-200 text-[11px] disabled:opacity-50 disabled:cursor-not-allowed">
                      {buildSettleButtonLabel(p, 'NO', lang)}
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {view.pendingOrders.map((ord) => {
              const id = String(ord.order_id ?? '');
              return (
                <div key={id} data-testid="pending-order-row"
                  className="flex flex-wrap items-center justify-between gap-2 p-3 rounded bg-slate-950 border border-amber-500/30 text-xs">
                  <span className="min-w-0 break-all font-mono tabular-nums text-amber-200">
                    {t.pendingPrefix} {String(ord.side)} {(Number(ord.size_shares_micro) / 1e6).toFixed(2)}{' '}
                    {String(ord.outcome)} @ ${(Number(ord.price_micro) / 1e6).toFixed(3)}
                  </span>
                  <button type="button" disabled={busy} onClick={() => onCancelOrder(id)}
                    className="min-h-11 px-2 py-1 rounded bg-rose-900/60 text-rose-200 text-[11px] disabled:opacity-50 disabled:cursor-not-allowed">
                    {t.cancelBtn}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <PolyBetaFillsAndLogs view={view} lang={lang} />
    </div>
  );
}
