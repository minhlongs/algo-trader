import { useState } from 'react';
import { POLY_BETA_COPY, type BetaLang } from './poly-beta-copy';
import { PolyBetaAuthForm } from './poly-beta-auth-form';

interface Props {
  lang: BetaLang;
  onToggleLang: () => void;
  onAuthenticated: (email: string, tenantId: string) => void;
  /** Session expiry opens the login form directly; landing stays the default. */
  sessionExpired?: boolean;
  onDismissSessionExpired?: () => void;
}

const navButton = 'min-h-11 px-3 py-1.5 rounded border border-slate-700 text-xs hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed';

export function PolyBetaLandingAuth({
  lang,
  onToggleLang,
  onAuthenticated,
  sessionExpired = false,
  onDismissSessionExpired,
}: Props) {
  const t = POLY_BETA_COPY[lang];
  const [mode, setMode] = useState<'landing' | 'signup' | 'login'>('landing');
  const [authBusy, setAuthBusy] = useState(false);
  // An expired session must show its notice and the login form in the same
  // paint, so derive the form mode instead of waiting for an effect tick.
  const activeMode: 'landing' | 'signup' | 'login' =
    sessionExpired && mode === 'landing' ? 'login' : mode;

  function open(next: 'signup' | 'login') {
    if (authBusy) return;
    setMode(next);
    onDismissSessionExpired?.();
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <div data-testid="paper-mode-banner"
        className="bg-amber-500/20 border-b border-amber-400/40 px-4 py-2 text-center text-xs md:text-sm font-semibold text-amber-200">
        {t.badge}
      </div>

      <header className="max-w-5xl w-full mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 text-base sm:text-lg font-bold tracking-tight text-emerald-400 break-words">{t.brand}</span>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="lang-toggle-btn" onClick={onToggleLang} aria-label={t.langToggleAria}
            className={navButton}>{lang === 'vi' ? 'EN' : 'VI'}</button>
          <button type="button" data-testid="nav-login-btn" disabled={authBusy} onClick={() => open('login')}
            className={navButton}>{t.ctaLogin}</button>
          <button type="button" data-testid="nav-signup-btn" disabled={authBusy} onClick={() => open('signup')}
            className={`${navButton} bg-emerald-500 text-slate-950 border-emerald-500 font-semibold`}>{t.ctaStart}</button>
        </div>
      </header>

      <main className="max-w-5xl w-full mx-auto px-4 py-6 sm:py-8 flex-1 flex flex-col gap-6 sm:gap-8">
        <section className="min-w-0 bg-slate-900/80 border border-slate-800 rounded-xl p-4 sm:p-6 md:p-8">
          <h1 className="text-xl sm:text-2xl md:text-4xl font-bold text-white leading-tight break-words">{t.heroTitle}</h1>
          <p className="mt-3 text-slate-300 text-sm md:text-base max-w-3xl">{t.heroSub}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" data-testid="hero-signup-btn" disabled={authBusy} onClick={() => open('signup')}
              className="min-h-11 px-5 py-2.5 rounded-lg bg-emerald-500 text-slate-950 font-semibold text-sm hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed">
              {t.ctaStart}
            </button>
            <button type="button" disabled={authBusy} onClick={() => open('login')}
              className="min-h-11 px-5 py-2.5 rounded-lg border border-slate-700 text-slate-200 text-sm hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed">
              {t.ctaLogin}
            </button>
          </div>
        </section>

        {sessionExpired && (
          <div role="alert" data-testid="session-expired-notice"
            className="min-w-0 max-w-lg w-full mx-auto p-3 rounded bg-amber-950/70 border border-amber-500/50 text-amber-200 text-xs break-words">
            {t.sessionExpiredNotice}
          </div>
        )}

        {(activeMode === 'signup' || activeMode === 'login') && (
          <PolyBetaAuthForm key={activeMode} lang={lang} mode={activeMode} onBusyChange={setAuthBusy}
            onAuthenticated={onAuthenticated} />
        )}

        <section data-testid="simulation-risk-disclosure"
          className="bg-slate-900/60 border border-amber-500/30 rounded-xl p-4 sm:p-5 text-xs text-slate-300 space-y-2">
          <h3 className="font-semibold text-amber-300 text-sm">{t.simLimitationsTitle}</h3>
          <p>{t.simLimitationsBody}</p>
        </section>
      </main>
    </div>
  );
}
