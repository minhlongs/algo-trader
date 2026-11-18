import type { BetaPortfolioView } from './poly-beta-api-client';
import { POLY_BETA_COPY, type BetaLang } from './poly-beta-copy';
import { fmtSignedUsd, formatIsoTimestamp, microToNum } from './poly-beta-helpers';

interface Props {
  view: BetaPortfolioView;
  lang: BetaLang;
}

const headerCell = 'py-2 pr-3 align-bottom whitespace-normal font-semibold';
const numCell = 'py-2 pr-3 font-mono tabular-nums whitespace-nowrap';

function sideClasses(side: string): string {
  if (side === 'SETTLE') return 'bg-amber-500/20 text-amber-300';
  if (side === 'SELL') return 'bg-sky-500/20 text-sky-300';
  return 'bg-emerald-500/20 text-emerald-300';
}

function levelClasses(level: string): string {
  if (level === 'HALT' || level === 'ERROR' || level === 'RISK_BLOCK') return 'text-rose-300';
  if (level === 'WARN') return 'text-amber-300';
  return 'text-emerald-300';
}

export function PolyBetaFillsAndLogs({ view, lang }: Props) {
  const t = POLY_BETA_COPY[lang];

  return (
    <section className="min-w-0 bg-slate-900 border border-slate-800 rounded-xl p-4 md:p-5 space-y-4">
      <h2 className="font-semibold text-sm text-emerald-300">{t.ledgerTitle}</h2>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-slate-300">{t.fillsSectionTitle}</h3>
        <div className="min-w-0 overflow-x-auto" tabIndex={0} role="region" aria-label={t.fillsSectionTitle}>
          <table className="w-full min-w-[52rem] text-xs text-left">
            <thead className="text-slate-400 border-b border-slate-800">
              <tr>
                <th scope="col" className={headerCell}>{t.colMarket}</th>
                <th scope="col" className={headerCell}>{t.colFillSide}</th>
                <th scope="col" className={headerCell}>{t.colFillQtyPrice}</th>
                <th scope="col" className={headerCell}>{t.colFillNotionalFee}</th>
                <th scope="col" className={headerCell}>{t.colFillPnl}</th>
                <th scope="col" className={`${headerCell} pr-0`}>{t.colFillTime}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {view.fills.length === 0 && (
                <tr><td colSpan={6} className="py-3 text-slate-400">{t.emptyFills}</td></tr>
              )}
              {view.fills.map((fill) => {
                const side = String(fill.side ?? '');
                const realized = microToNum(fill.realized_delta_micro);
                const settled = microToNum(fill.settled_delta_micro);
                return (
                  <tr key={String(fill.fill_id)} data-testid="fill-row">
                    <td className="py-2 pr-3 min-w-[10rem] max-w-[16rem] truncate text-slate-100">
                      {String(fill.market_question ?? fill.market_id ?? '—')}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <span className={`px-1.5 py-0.5 rounded font-mono text-[11px] ${sideClasses(side)}`}>{side}</span>{' '}
                      <span className="font-mono">{String(fill.outcome ?? '')}</span>
                    </td>
                    <td className={numCell}>
                      {microToNum(fill.shares_micro).toFixed(2)} @ ${microToNum(fill.price_micro).toFixed(3)}
                    </td>
                    <td className={numCell}>
                      ${microToNum(fill.notional_micro).toFixed(4)} / ${microToNum(fill.fee_micro).toFixed(4)}
                    </td>
                    <td className={numCell}>
                      <span className={realized >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{fmtSignedUsd(realized)}</span>
                      {' / '}
                      <span className={settled >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{fmtSignedUsd(settled)}</span>
                    </td>
                    <td className={`${numCell} pr-0 text-slate-400`}>
                      {formatIsoTimestamp(fill.created_at_ms)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="min-w-0 space-y-2 max-h-64 overflow-y-auto" tabIndex={0} role="region" aria-label={t.ledgerEntriesHeading}>
          <h3 className="text-xs font-semibold text-slate-300">{t.ledgerEntriesHeading}</h3>
          {view.ledgerEntries.length === 0 && <p className="text-xs text-slate-400">{t.emptyLedgerEntries}</p>}
          {view.ledgerEntries.map((entry) => {
            const noteText = String(entry.note ?? '');
            const isSimDrill = noteText.startsWith('[SIMULATED_DRILL]');
            return (
              <div key={String(entry.entry_id)} data-testid="ledger-entry-row"
                className="min-w-0 p-2.5 rounded bg-slate-950 border border-slate-800 text-xs font-mono">
                <div className="flex flex-wrap items-center justify-between gap-2 text-slate-200">
                  <span className="flex min-w-0 flex-wrap items-center gap-1.5 break-all">
                    <span>#{String(entry.seq)} {String(entry.entry_type)}</span>
                    {isSimDrill && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px]">
                        {t.simDrillBadge}
                      </span>
                    )}
                  </span>
                  <span className="whitespace-nowrap tabular-nums">
                    {t.cashAfterLabel}: ${microToNum(entry.cash_after_micro).toFixed(4)}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1 break-words">
                  {t.feeLabel}: ${microToNum(entry.fee_micro).toFixed(4)} | {noteText}
                </div>
              </div>
            );
          })}
        </div>

        <div className="min-w-0 space-y-2 max-h-64 overflow-y-auto" tabIndex={0} role="region" aria-label={t.execLogsHeading}>
          <h3 className="text-xs font-semibold text-slate-300">{t.execLogsHeading}</h3>
          {view.executionLogs.length === 0 && <p className="text-xs text-slate-400">{t.emptyExecLogs}</p>}
          {view.executionLogs.map((log) => (
            <div key={String(log.log_id)} className="min-w-0 p-2.5 rounded bg-slate-950 border border-slate-800 text-xs font-mono">
              <span className={levelClasses(String(log.level))}>[{String(log.level)}]</span>{' '}
              <span className="text-slate-200 break-all">{String(log.event_code)}</span>:{' '}
              <span className="text-slate-400 break-words">{String(log.detail)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
