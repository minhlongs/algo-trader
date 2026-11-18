/**
 * POLY-G5 Public Beta — Logout & Account-Deletion Request Semantics.
 *
 * Pure request/interpretation layer: the caller owns the busy lock and the
 * state updates. `session-aborted` means the centralized 401 path
 * already ended the session, so the caller must not clear it again (that
 * would wipe the expiry notice).
 */

import { POLY_BETA_COPY, type BetaLang } from './poly-beta-copy';
import { localizeBetaError, type StatusNotice } from './poly-beta-helpers';
import type { PolyBetaSession } from './use-poly-beta-session';

export type AccountActionResult =
  | { outcome: 'session-cleared' }
  | { outcome: 'session-aborted' }
  | { outcome: 'failed'; notice: StatusNotice };

/** A 401 means the server session is already gone: that is a completed logout. */
export async function requestLogout(
  authedRequest: PolyBetaSession['authedRequest'],
  lang: BetaLang,
): Promise<AccountActionResult> {
  const t = POLY_BETA_COPY[lang];
  const res = await authedRequest<{ ok?: boolean }>('/api/beta/auth/logout', { method: 'POST' }, false);
  if (res.abortedSession) return { outcome: 'session-aborted' };
  if ((res.status === 200 && res.data.ok) || res.status === 401) return { outcome: 'session-cleared' };
  return {
    outcome: 'failed',
    notice: { tone: 'error', message: localizeBetaError(res, lang, t.logoutFailed) },
  };
}

export async function requestAccountDeletion(
  authedRequest: PolyBetaSession['authedRequest'],
  lang: BetaLang,
): Promise<AccountActionResult> {
  const t = POLY_BETA_COPY[lang];
  const res = await authedRequest<{ ok?: boolean }>('/api/beta/account', { method: 'DELETE' });
  // The session hook already returned the user to the login screen on 401.
  if (res.abortedSession) return { outcome: 'session-aborted' };
  if (res.status === 200 && res.data.ok) return { outcome: 'session-cleared' };
  return {
    outcome: 'failed',
    notice: { tone: 'error', message: localizeBetaError(res, lang, t.deleteFailed) },
  };
}
