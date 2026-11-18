/**
 * POLY-G5 Public Beta — Centralized Session, Authoritative Load & 401 Expiry Handling.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  betaRequest,
  isUnauthorizedStatus,
  setCsrfToken,
  type BetaPortfolioView,
  type BetaResponse,
} from './poly-beta-api-client';
import { POLY_BETA_COPY, type BetaLang } from './poly-beta-copy';
import { localizeBetaError } from './poly-beta-helpers';

interface AuthedResult<T> extends BetaResponse<T> {
  /** True when the request belongs to a session that already ended. */
  abortedSession: boolean;
}

interface MeResponse {
  ok?: boolean;
  csrfToken?: string;
  user?: { email: string; tenantId: string };
}

const POLL_INTERVAL_MS = 10_000;

export function usePolyBetaSession(lang: BetaLang) {
  const [authState, setAuthState] = useState<'checking' | 'anon' | 'authed'>('checking');
  const [sessionExpired, setSessionExpired] = useState(false);
  const [authCheckError, setAuthCheckError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState('');
  const [view, setView] = useState<BetaPortfolioView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedStrategy, setSelectedStrategy] = useState('toxicity-aware-mm-paper');
  const [selectedMarket, setSelectedMarket] = useState('');
  const [orderShares, setOrderShares] = useState(5);

  const langRef = useRef(lang);
  langRef.current = lang;
  // Bumped whenever a session starts or ends so a late response cannot
  // resurrect a logged-out view (401 expiry, logout, deletion, or sign-in).
  const sessionEpochRef = useRef(0);
  const checkSeqRef = useRef(0);
  // Only the newest portfolio request may write state; a slow poll must never
  // replace a fresher post-mutation snapshot.
  const loadSeqRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const clearClientSession = useCallback((expired: boolean) => {
    sessionEpochRef.current += 1;
    // Cancel any in-flight `/auth/me` so it cannot restore the session.
    checkSeqRef.current += 1;
    loadSeqRef.current += 1;
    setCsrfToken('');
    setUserEmail('');
    setView(null);
    setLoadError(null);
    setAuthCheckError(null);
    setSessionExpired(expired);
    setAuthState('anon');
  }, []);

  const authedRequest = useCallback(
    async <T,>(
      path: string,
      options: { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown } = {},
      expireOnUnauthorized = true,
    ): Promise<AuthedResult<T>> => {
      const epoch = sessionEpochRef.current;
      const res = await betaRequest<T>(path, options);
      if (epoch !== sessionEpochRef.current || !mountedRef.current) return { ...res, abortedSession: true };
      if (isUnauthorizedStatus(res.status) && expireOnUnauthorized) {
        // Only an already-authenticated surface reaches here, so a 401 means the
        // session expired rather than an anonymous first visit.
        clearClientSession(true);
        return { ...res, abortedSession: true };
      }
      return { ...res, abortedSession: false };
    },
    [clearClientSession],
  );

  const loadPortfolio = useCallback(
    async (syncSelection = false) => {
      const seq = ++loadSeqRef.current;
      const res = await authedRequest<BetaPortfolioView>('/api/beta/portfolio');
      // Drop a superseded or unmounted response instead of letting it overwrite
      // a fresher snapshot (poll vs. post-mutation reload).
      if (res.abortedSession || seq !== loadSeqRef.current || !mountedRef.current) return;
      if (res.status === 200 && res.data.ok) {
        setLoadError(null);
        setView(res.data);
        if (syncSelection) setSelectedStrategy(res.data.engine.selectedStrategyId);
        const markets = res.data.markets;
        const engineMarket = res.data.engine.selectedMarketId;
        const fallback =
          (engineMarket && markets.some((m) => m.marketId === engineMarket)
            ? engineMarket
            : markets[0]?.marketId) ?? '';
        // Drop a stale pick so a vanished or empty feed never offers a trade on
        // a market the backend no longer serves.
        setSelectedMarket((prev) =>
          prev && markets.some((m) => m.marketId === prev) ? prev : fallback,
        );
      } else {
        const activeLang = langRef.current;
        setLoadError(
          localizeBetaError(res, activeLang, POLY_BETA_COPY[activeLang].portfolioLoadFailed),
        );
      }
    },
    [authedRequest],
  );

  const checkSession = useCallback(async () => {
    const seq = ++checkSeqRef.current;
    const me = await betaRequest<MeResponse>('/api/beta/auth/me');
    // A sign-in or logout performed while this check was in flight owns the
    // session now; its stale answer must not undo that transition.
    if (seq !== checkSeqRef.current || !mountedRef.current) return;
    if (me.status === 200 && me.data.user && me.data.csrfToken) {
      sessionEpochRef.current += 1;
      setCsrfToken(me.data.csrfToken);
      setUserEmail(me.data.user.email);
      setSessionExpired(false);
      setAuthCheckError(null);
      setAuthState('authed');
      await loadPortfolio(true);
      return;
    }
    // An anonymous visitor's expected 401 must never read as an expired session;
    // a transport failure is a real, retryable error.
    sessionEpochRef.current += 1;
    setCsrfToken('');
    setSessionExpired(false);
    setUserEmail('');
    setView(null);
    setAuthCheckError(
      me.status === 401
        ? null
        : localizeBetaError(me, langRef.current, POLY_BETA_COPY[langRef.current].authCheckFailed),
    );
    setAuthState('anon');
  }, [loadPortfolio]);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  const isRunning = authState === 'authed' && view?.engine.state === 'RUNNING';
  useEffect(() => {
    if (!isRunning) return;
    const id = globalThis.setInterval(() => {
      void loadPortfolio(false);
    }, POLL_INTERVAL_MS);
    return () => globalThis.clearInterval(id);
  }, [isRunning, loadPortfolio]);

  const onAuthenticated = useCallback(
    (email: string) => {
      sessionEpochRef.current += 1;
      // Invalidate an in-flight `/auth/me` that predates this sign-in.
      checkSeqRef.current += 1;
      setSessionExpired(false);
      setAuthCheckError(null);
      setLoadError(null);
      setUserEmail(email);
      setAuthState('authed');
      void loadPortfolio(true);
    },
    [loadPortfolio],
  );

  return {
    authState,
    sessionExpired,
    authCheckError,
    dismissSessionExpired: () => setSessionExpired(false),
    checkSession,
    userEmail,
    view,
    loadError,
    selectedStrategy,
    setSelectedStrategy,
    selectedMarket,
    setSelectedMarket,
    orderShares,
    setOrderShares,
    loadPortfolio,
    onAuthenticated,
    authedRequest,
    clearClientSession,
  };
}

export type PolyBetaSession = ReturnType<typeof usePolyBetaSession>;
