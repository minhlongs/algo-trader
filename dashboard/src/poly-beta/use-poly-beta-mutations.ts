import { useRef, useState } from 'react';
import { requestAccountDeletion, requestLogout } from './poly-beta-account-actions';
import { POLY_BETA_COPY, type BetaLang } from './poly-beta-copy';
import {
  buildSettleDrillConfirm,
  fmtSignedUsd,
  getControlAvailability,
  getSellableShares,
  localizeBetaError,
  microToNum,
  type StatusNotice,
} from './poly-beta-helpers';
import type { PolyBetaSession } from './use-poly-beta-session';

type Session = PolyBetaSession;

interface MutationResult {
  ok?: boolean;
  engineState?: string;
  orderId?: string;
  settledDeltaMicro?: number;
}

/**
 * Serialized mutation surface. Every user action runs through one synchronous
 * ref lock, so repeated clicks or a different control cannot overlap mutations.
 */
export function usePolyBetaMutations(session: Session, lang: BetaLang) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<StatusNotice | null>(null);
  const lock = useRef(false);
  const {
    view,
    selectedMarket,
    selectedStrategy,
    orderShares,
    authedRequest,
    loadPortfolio,
    clearClientSession,
  } = session;
  const t = POLY_BETA_COPY[lang];

  async function withLock(task: () => Promise<void>, fallback = t.actionFailed): Promise<void> {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setNotice(null);
    try {
      await task();
    } catch {
      setNotice({ tone: 'error', message: fallback });
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function mutate(
    path: string,
    body: unknown,
    success: (data: MutationResult) => StatusNotice,
    fallback: string,
    method: 'POST' | 'DELETE' = 'POST',
  ): Promise<void> {
    return withLock(async () => {
      const res = await authedRequest<MutationResult>(path, {
        method,
        ...(body !== undefined ? { body } : {}),
      });
      // A 401 anywhere inside an authenticated screen ends the session; the
      // session hook already returned the user to the login screen.
      if (res.abortedSession) return;
      if (res.status >= 200 && res.status < 300 && res.data.ok) {
        setNotice(success(res.data));
      } else {
        setNotice({ tone: 'error', message: localizeBetaError(res, lang, fallback) });
      }
      await loadPortfolio(false);
    }, fallback);
  }

  function canControl(action: 'START' | 'PAUSE' | 'STOP'): boolean {
    if (!view) return false;
    const guards = getControlAvailability(view, selectedMarket, orderShares, lock.current);
    const hasStrategy = view.strategies.some((strategy) => strategy.id === selectedStrategy);
    return action === 'START'
      ? guards.canStart && hasStrategy
      : action === 'PAUSE'
        ? guards.canPause
        : guards.canStop;
  }

  function sendControl(action: 'START' | 'PAUSE' | 'STOP') {
    if (!canControl(action)) return;
    void mutate(
      '/api/beta/strategy/control',
      { action, strategyId: selectedStrategy, marketId: selectedMarket || undefined },
      (data) => ({
        tone: data.engineState === 'RUNNING' ? 'success' : 'warning',
        message: `${t.enginePrefix}: ${data.engineState ?? '—'}`,
      }),
      t.actionFailed,
    );
  }

  function submitManualOrder(outcome: 'YES' | 'NO', side: 'BUY' | 'SELL') {
    if (!view || !view.strategies.some((strategy) => strategy.id === selectedStrategy)) return;
    if (!getControlAvailability(view, selectedMarket, orderShares, lock.current).canManualTrade) return;
    if (side === 'SELL' && getSellableShares(view, selectedMarket, outcome) < orderShares) return;
    void mutate(
      '/api/beta/orders',
      {
        idempotencyKey: `ui-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        marketId: selectedMarket,
        outcome,
        side,
        sizeShares: orderShares,
        strategyId: selectedStrategy,
      },
      (data) => ({ tone: 'success', message: `${t.orderRecorded}: ${data.orderId ?? '—'}` }),
      t.actionFailed,
    );
  }

  function testLockedDeposit() {
    void withLock(async () => {
      const res = await authedRequest<MutationResult>('/api/beta/deposit', { method: 'POST' });
      if (res.abortedSession) return;
      const blocked = res.status === 403 && res.data.code === 'REAL_MONEY_OPERATIONS_DISABLED';
      setNotice({
        tone: blocked ? 'warning' : 'error',
        message: blocked
          ? `[403] REAL_MONEY_OPERATIONS_DISABLED: ${res.data.error ?? t.depositBlocked}`
          : localizeBetaError(res, lang, t.actionFailed),
      });
    });
  }

  function cancelOrder(orderId: string) {
    if (lock.current) return;
    void mutate(
      `/api/beta/orders/${encodeURIComponent(orderId)}/cancel`,
      undefined,
      () => ({ tone: 'success', message: t.cancelSuccess }),
      t.cancelFailed,
    );
  }

  function settleMarket(marketId: string, winningOutcome: 'YES' | 'NO') {
    if (lock.current || !view) return;
    const confirmed = window.confirm(buildSettleDrillConfirm(view, marketId, winningOutcome, lang));
    if (!confirmed) return;
    void mutate(
      '/api/beta/positions/settle',
      { marketId, winningOutcome },
      // Show the server's realized settled PnL, not a client-estimated payout:
      // the drill's payout rule lives in the confirmation dialog.
      (data) => ({
        tone: 'success',
        message: `${t.settleSuccess} — ${t.settledPnl}: ${fmtSignedUsd(microToNum(data.settledDeltaMicro))}`,
      }),
      t.settleFailed,
    );
  }

  async function logout(): Promise<void> {
    return withLock(async () => {
      const result = await requestLogout(authedRequest, lang);
      if (result.outcome === 'failed') setNotice(result.notice);
      else if (result.outcome === 'session-cleared') clearClientSession(false);
    }, t.logoutFailed);
  }

  async function deleteAccount(): Promise<void> {
    if (lock.current || !window.confirm(t.confirmDelete)) return;
    return withLock(async () => {
      const result = await requestAccountDeletion(authedRequest, lang);
      if (result.outcome === 'failed') setNotice(result.notice);
      else if (result.outcome === 'session-cleared') clearClientSession(false);
    }, t.deleteFailed);
  }

  return {
    busy,
    notice,
    clearNotice: () => setNotice(null),
    canControl,
    sendControl,
    submitManualOrder,
    testLockedDeposit,
    cancelOrder,
    settleMarket,
    logout,
    deleteAccount,
  };
}
