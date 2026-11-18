import type { BetaPortfolioView } from './poly-beta-api-client';
import { POLY_BETA_COPY, type BetaLang } from './poly-beta-copy';
import { fmtSignedUsd } from './poly-beta-helpers';

interface HeaderProps {
  lang: BetaLang;
  userEmail: string;
  tenantId: string;
  busy: boolean;
  onToggleLang: () => void;
  /** Logout stays in the header; destructive account deletion has its own section. */
  onLogout: () => void;
}

export function PolyBetaHeader({ lang, userEmail, tenantId, busy, onToggleLang, onLogout }: HeaderProps) {
  const t = POLY_BETA_COPY[lang];
  return (
    <>
      <div data-testid="paper-mode-banner" className="bg-amber-500/20 border-b border-amber-400/40 px-4 py-2 text-center text-xs md:text-sm font-semibold text-amber-200">
        {t.badge}
      </div>
      <header className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800">
        <div className="min-w-0">
          <span className="font-bold text-emerald-400 break-words">{t.brand}</span>
          <span className="ml-3 text-xs font-mono text-slate-400 break-all" data-testid="tenant-badge">
            {userEmail} ({tenantId.slice(0, 12)})
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy} aria-label={t.langToggleAria} onClick={onToggleLang}
            className="min-h-11 px-2.5 py-1 rounded border border-slate-700 text-xs hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed">
            {lang === 'vi' ? 'EN' : 'VI'}
          </button>
          <button type="button" disabled={busy} data-testid="logout-btn" onClick={onLogout}
            className="min-h-11 px-2.5 py-1 rounded border border-slate-700 text-xs hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed">
            {busy ? t.submitting : t.logout}
          </button>
        </div>
      </header>
    </>
  );
}

interface DangerProps {
  lang: BetaLang;
  busy: boolean;
  onDeleteAccount: () => void;
}

export function PolyBetaAccountDangerZone({ lang, busy, onDeleteAccount }: DangerProps) {
  const t = POLY_BETA_COPY[lang];
  return (
    <section data-testid="account-danger-zone" aria-labelledby="danger-title"
      className="min-w-0 bg-slate-900 border border-rose-500/40 rounded-xl p-4 md:p-5 space-y-3">
      <h2 id="danger-title" className="font-semibold text-sm text-rose-300">{t.dangerZoneTitle}</h2>
      <p className="text-xs text-slate-400 break-words">{t.dangerZoneDesc}</p>
      <button type="button" disabled={busy} data-testid="delete-account-btn" onClick={onDeleteAccount}
        className="min-h-11 px-3 py-2 rounded bg-rose-900/70 text-rose-200 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed">
        {busy ? t.submitting : t.deleteAccount}
      </button>
    </section>
  );
}

interface SummaryProps {
  view: BetaPortfolioView;
  lang: BetaLang;
}

export function PolyBetaSummaryCards({ view, lang }: SummaryProps) {
  const t = POLY_BETA_COPY[lang];
  const cards = [
    { key: 'equity', label: t.equity, testId: 'stat-total-equity', value: `$${view.summary.totalEquityUsd.toFixed(2)}`, className: 'text-white' },
    { key: 'cash', label: t.cash, testId: 'stat-cash-balance', value: `$${view.summary.cashBalanceUsd.toFixed(2)}`, className: 'text-emerald-300' },
    { key: 'realized', label: t.realizedPnl, testId: 'stat-realized-pnl', value: fmtSignedUsd(view.summary.realizedTradingPnlUsd), className: '' },
    { key: 'unrealized', label: t.unrealizedPnl, testId: 'stat-unrealized-pnl', value: fmtSignedUsd(view.summary.unrealizedMtmPnlUsd), className: '' },
    { key: 'settled', label: t.settledPnl, testId: 'stat-settled-pnl', value: fmtSignedUsd(view.summary.settledRedemptionPnlUsd), className: '' },
    { key: 'fees', label: t.feesPaid, testId: 'stat-fees-paid', value: `$${view.summary.feesPaidUsd.toFixed(4)}`, className: 'text-amber-300' },
  ] as const;

  return (
    <section className="min-w-0 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((card) => (
        <div key={card.key} className="min-w-0 bg-slate-900 border border-slate-800 rounded-xl p-3">
          <div className="text-[11px] text-slate-400">{card.label}</div>
          <div data-testid={card.testId} className={`font-bold font-mono tabular-nums break-words ${card.className}`}>
            {card.value}
          </div>
        </div>
      ))}
    </section>
  );
}
