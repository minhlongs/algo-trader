import { useEffect, useState } from 'react';

import { POLY_BETA_COPY, type BetaLang } from './poly-beta-copy';
import { getBannerToneClasses } from './poly-beta-helpers';
import { usePolyBetaSession } from './use-poly-beta-session';
import { usePolyBetaMutations } from './use-poly-beta-mutations';
import { PolyBetaLandingAuth } from './poly-beta-landing-auth';
import { PolyBetaControlsHealth } from './poly-beta-controls-health';
import { PolyBetaFeedbackPanel } from './poly-beta-feedback-panel';
import { PolyBetaLedgerTables } from './poly-beta-ledger-tables';
import { PolyBetaAccountDangerZone, PolyBetaHeader, PolyBetaSummaryCards } from './poly-beta-summary-cards';

export function PolyBetaShell() {
  const [lang, setLang] = useState<BetaLang>('vi');
  const session = usePolyBetaSession(lang);
  const mutations = usePolyBetaMutations(session, lang);
  const t = POLY_BETA_COPY[lang];

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  if (session.authState === 'checking') {
    return <div lang={lang} role="status" aria-live="polite"
      className="min-h-screen bg-slate-950 text-slate-300 flex items-center justify-center p-4 text-sm text-center">
      {t.loadingApp}
    </div>;
  }

  if (session.authState === 'anon') {
    return <>
      {session.authCheckError && (
        <div role="alert" className="bg-rose-950 text-rose-200 px-4 py-2 text-xs flex flex-wrap items-center justify-center gap-3">
          <span className="break-words">{session.authCheckError}</span>
          <button type="button" onClick={() => void session.checkSession()}
            className="min-h-11 px-3 py-1.5 rounded bg-rose-800 text-white text-xs font-semibold">
            {t.retryBtn}
          </button>
        </div>
      )}
      <PolyBetaLandingAuth
        lang={lang}
        onToggleLang={() => setLang((current) => current === 'vi' ? 'en' : 'vi')}
        onAuthenticated={(email) => session.onAuthenticated(email)}
        sessionExpired={session.sessionExpired}
        onDismissSessionExpired={session.dismissSessionExpired}
      />
    </>;
  }

  if (!session.view) {
    return <div lang={lang} className="min-h-screen bg-slate-950 text-slate-200 flex flex-col items-center justify-center gap-3 p-4 text-sm text-center">
      <div role={session.loadError ? 'alert' : 'status'} aria-live={session.loadError ? 'assertive' : 'polite'}>
        {session.loadError || t.provisioningLedger}
      </div>
      {session.loadError && <button type="button" onClick={() => void session.loadPortfolio(true)}
        className="min-h-11 px-3 py-2 rounded bg-emerald-500 text-slate-950 text-xs font-semibold hover:bg-emerald-400">
        {t.retryBtn}
      </button>}
    </div>;
  }

  return (
    <div lang={lang} className="min-h-screen min-w-0 bg-slate-950 text-slate-100 overflow-x-hidden">
      <PolyBetaHeader
        lang={lang}
        userEmail={session.userEmail}
        tenantId={session.view.tenantId}
        busy={mutations.busy}
        onToggleLang={() => setLang((current) => current === 'vi' ? 'en' : 'vi')}
        onLogout={() => void mutations.logout()}
      />
      <main className="max-w-6xl mx-auto min-w-0 px-4 py-6 space-y-6">
        {session.loadError && <div role="alert" aria-live="assertive"
          className="p-3 rounded bg-rose-950/80 border border-rose-500/60 text-rose-200 text-xs break-words">
          {session.loadError}
        </div>}
        {mutations.notice && <div data-testid="status-banner"
          role={mutations.notice.tone === 'error' ? 'alert' : 'status'}
          aria-live={mutations.notice.tone === 'error' ? 'assertive' : 'polite'}
          className={`p-3 rounded border text-xs font-mono break-words ${getBannerToneClasses(mutations.notice.tone)}`}>
          {mutations.notice.message}
        </div>}

        <PolyBetaSummaryCards view={session.view} lang={lang} />

        <PolyBetaControlsHealth
          view={session.view}
          lang={lang}
          busy={mutations.busy}
          selectedStrategy={session.selectedStrategy}
          selectedMarket={session.selectedMarket}
          orderShares={session.orderShares}
          onSelectStrategy={session.setSelectedStrategy}
          onSelectMarket={session.setSelectedMarket}
          onChangeShares={session.setOrderShares}
          onControl={mutations.sendControl}
          onManualOrder={mutations.submitManualOrder}
          onLockedDeposit={mutations.testLockedDeposit}
        />

        <PolyBetaLedgerTables
          view={session.view}
          lang={lang}
          busy={mutations.busy}
          onCancelOrder={mutations.cancelOrder}
          onSettleMarket={mutations.settleMarket}
        />

        <PolyBetaFeedbackPanel lang={lang} authedRequest={session.authedRequest} />

        <PolyBetaAccountDangerZone
          lang={lang}
          busy={mutations.busy}
          onDeleteAccount={() => void mutations.deleteAccount()}
        />
      </main>
    </div>
  );
}
