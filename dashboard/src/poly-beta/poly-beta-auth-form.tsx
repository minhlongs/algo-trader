import { useEffect, useRef, useState, type FormEvent } from 'react';
import { betaRequest, setCsrfToken } from './poly-beta-api-client';
import { POLY_BETA_COPY, type BetaLang } from './poly-beta-copy';
import { localizeBetaError } from './poly-beta-helpers';

interface Props {
  lang: BetaLang;
  mode: 'signup' | 'login';
  onBusyChange: (busy: boolean) => void;
  onAuthenticated: (email: string, tenantId: string) => void;
}

const inputClass = 'w-full min-w-0 min-h-11 px-3 py-2 rounded bg-slate-950 border border-slate-700 text-sm text-white disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300';

export function PolyBetaAuthForm({ lang, mode, onBusyChange, onAuthenticated }: Props) {
  const t = POLY_BETA_COPY[lang];
  const [email, setEmail] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [password, setPassword] = useState('');
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => { heading.current?.focus(); }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || (mode === 'signup' && !ack)) return;
    lock.current = true;
    setError(null);
    setBusy(true);
    onBusyChange(true);
    try {
      const res = await betaRequest<{
        csrfToken?: string;
        user?: { email: string; tenantId: string };
      }>(`/api/beta/auth/${mode}`, {
        method: 'POST',
        body:
          mode === 'signup'
            ? { email, password, inviteToken: inviteToken.trim(), acknowledgeSimulationAndRisk: ack }
            : { email, password },
      });
      if ((res.status === 200 || res.status === 201) && res.data.user && res.data.csrfToken) {
        setCsrfToken(res.data.csrfToken);
        onAuthenticated(res.data.user.email, res.data.user.tenantId);
      } else {
        // Invalid login credentials are an auth error, not an expired session.
        setError(localizeBetaError(res, lang, t.authFailed));
      }
    } catch {
      // A failed form submit must surface a retryable message, never an
      // unhandled rejection that leaves the button silently stuck.
      setError(t.authFailed);
    } finally {
      lock.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} data-testid="beta-auth-form" aria-busy={busy} aria-labelledby="beta-auth-title"
      className="min-w-0 bg-slate-900 border border-slate-700 rounded-xl p-4 sm:p-6 max-w-lg w-full mx-auto space-y-4">
      <h2 id="beta-auth-title" ref={heading} tabIndex={-1} className="text-lg font-bold text-white">
        {mode === 'signup' ? t.authSignupTitle : t.authLoginTitle}
      </h2>
      {error && <div data-testid="auth-error-msg" role="alert"
        className="p-3 rounded bg-rose-950/80 border border-rose-500/50 text-rose-200 text-xs break-words">{error}</div>}
      <div>
        <label htmlFor="beta-email" className="block text-xs text-slate-300 mb-1">{t.emailLabel}</label>
        <input id="beta-email" name="email" type="email" autoComplete="email" maxLength={160} required
          disabled={busy} data-testid="auth-email-input" value={email}
          onChange={(e) => setEmail(e.target.value)} className={inputClass} />
      </div>
      {mode === 'signup' && (
        <div className="space-y-1">
          <label htmlFor="beta-invite-token" className="block text-xs text-slate-300">{t.inviteTokenLabel}</label>
          <input id="beta-invite-token" name="inviteToken" type="password" autoComplete="off"
            minLength={32} maxLength={128} required disabled={busy} data-testid="auth-invite-input"
            aria-describedby="beta-invite-hint" value={inviteToken}
            onChange={(e) => setInviteToken(e.target.value)} className={inputClass} />
          <p id="beta-invite-hint" className="text-xs text-slate-400">{t.inviteTokenHint}</p>
        </div>
      )}
      <div className="space-y-1">
        <label htmlFor="beta-password" className="block text-xs text-slate-300">{t.loginPasswordLabel}</label>
        <div className="flex min-w-0 items-center gap-2">
          <input id="beta-password" name="password" type={showPassword ? 'text' : 'password'} required
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            minLength={mode === 'signup' ? 12 : 1} maxLength={128}
            pattern={mode === 'signup' ? '(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{12,128}' : undefined}
            aria-describedby={mode === 'signup' ? 'beta-password-hint beta-no-reset' : 'beta-no-reset'}
            disabled={busy} data-testid="auth-password-input" value={password}
            onChange={(e) => setPassword(e.target.value)} className={inputClass} />
          <button type="button" aria-controls="beta-password" aria-pressed={showPassword} disabled={busy}
            onClick={() => setShowPassword((shown) => !shown)}
            className="min-h-11 shrink-0 px-3 py-2 rounded border border-slate-600 text-xs hover:bg-slate-800 disabled:opacity-50">
            {showPassword ? t.hidePassword : t.showPassword}
          </button>
        </div>
        {mode === 'signup' && <p id="beta-password-hint" className="text-xs text-slate-400">{t.passwordRequirementHint}</p>}
      </div>
      <p id="beta-no-reset" className="text-xs text-amber-200">{t.noPasswordResetNotice}</p>
      {mode === 'signup' && (
        <label htmlFor="beta-ack" className="flex items-start gap-2 text-xs text-slate-300 cursor-pointer">
          <input id="beta-ack" name="acknowledgeSimulationAndRisk" type="checkbox" required disabled={busy}
            data-testid="auth-ack-checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" />
          <span>{t.ackCheckbox}</span>
        </label>
      )}
      <button type="submit" disabled={busy || (mode === 'signup' && !ack)} data-testid="auth-submit-btn"
        className="w-full min-h-11 py-2.5 rounded-lg bg-emerald-500 text-slate-950 font-bold text-sm enabled:hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed">
        {busy ? t.submitting : mode === 'signup' ? t.submitSignup : t.submitLogin}
      </button>
      <p role="status" className="text-xs text-slate-300">{busy ? t.submitting : ''}</p>
    </form>
  );
}
