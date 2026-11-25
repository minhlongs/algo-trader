/**
 * POLY-G5 Public Beta — Frontend API Client & Authoritative Ledger Types.
 *
 * Uses `credentials: 'include'` (`HttpOnly; Secure; SameSite=None` session cookie)
 * + in-memory `X-CSRF-Token` (never persists bearer tokens to `localStorage`).
 */

export interface BetaMarket {
  marketId: string;
  question: string;
  slug: string;
  category: string;
  yesTokenId: string;
  noTokenId: string;
  bestBid: number;
  bestAsk: number;
  midPrice: number;
  spreadBps: number;
  feeRateBps: number;
  tickSize: number;
  minOrderShares: number;
  source: string;
  sourceTimestampMs: number;
  fetchedAtMs: number;
}

export interface BetaStrategy {
  id: 'toxicity-aware-mm-paper';
  name: string;
  mode: 'PAPER_ONLY';
  summaryVi: string;
  summaryEn: string;
  feeModel: string;
  queueAssumption: string;
}

export type BetaFeedbackCategory =
  | 'bug'
  | 'confusing_workflow'
  | 'trading_simulation'
  | 'feature_suggestion'
  | 'other';

export interface BetaFeedbackItem {
  feedbackId: string;
  category: BetaFeedbackCategory;
  message: string;
  screenId: string | null;
  status: string;
  createdAtMs: number;
}

export interface BetaPosition {
  marketId: string;
  tokenId: string;
  marketQuestion: string;
  outcome: 'YES' | 'NO';
  shares: number;
  avgEntryPrice: number;
  markPrice: number;
  unrealizedPnlUsd: number;
}

export interface BetaPortfolioView {
  ok: boolean;
  mode: 'PAPER_ONLY';
  liveTradingEnabled: false;
  tenantId: string;
  summary: {
    initialCapitalUsd: number;
    cashBalanceUsd: number;
    totalEquityUsd: number;
    openExposureUsd: number;
    realizedTradingPnlUsd: number;
    unrealizedMtmPnlUsd: number;
    settledRedemptionPnlUsd: number;
    feesPaidUsd: number;
    currentDrawdownPct: number;
    maxDrawdownPct: number;
  };
  limits: { maxPortfolioExposureUsd: number; maxSingleOrderUsd: number; maxDrawdownPct: number };
  engine: {
    state: 'STOPPED' | 'RUNNING' | 'PAUSED' | 'HALTED';
    haltReason: string | null;
    selectedStrategyId: string;
    selectedMarketId: string | null;
    lastTickAtMs: number | null;
  };
  health: {
    marketFeedHealthy: boolean;
    staleReason: string | null;
    ghostGuardMode: string;
    cryptoFiveMinuteGuard: string;
    liveExecutionLock: string;
    marketDataProvenance?: {
      gammaApi: string;
      clobApi: string;
      stalenessLimitMs: number;
      accountingCurrency?: string;
      dataRightsStatus?: string;
      mode: string;
    };
  };
  strategies: BetaStrategy[];
  markets: BetaMarket[];
  openPositions: BetaPosition[];
  pendingOrders: Array<Record<string, unknown>>;
  orders: Array<Record<string, unknown>>;
  fills: Array<Record<string, unknown>>;
  ledgerEntries: Array<Record<string, unknown>>;
  executionLogs: Array<Record<string, unknown>>;
}

// Public-beta requests use the same-origin Pages proxy so browser requests retain
// same-site cookie and Sec-Fetch semantics while the API remains on workers.dev.
const API_BASE =
  import.meta.env.VITE_APP_MODE === 'poly-beta'
    ? ''
    : (import.meta.env.VITE_POLY_BETA_API_URL || '').replace(/\/+$/, '');

let csrfTokenMemory = '';

export function setCsrfToken(token: string): void {
  csrfTokenMemory = token;
}

export interface BetaApiErrorFields {
  error?: string;
  code?: string;
  detail?: string;
}

export interface BetaResponse<T> {
  /** HTTP status code, or `0` when the request never produced an API response. */
  status: number;
  data: T & BetaApiErrorFields;
}

/** Client-side ceiling so a stalled edge/proxy cannot leave the UI spinning forever. */
export const BETA_REQUEST_TIMEOUT_MS = 12_000;

export function isUnauthorizedStatus(status: number): boolean {
  return status === 401;
}

function isAbortError(err: unknown): boolean {
  return (
    (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'AbortError')
  );
}

function networkFailure<T>(
  code: 'NETWORK_TIMEOUT' | 'NETWORK_ERROR',
  message: string,
): BetaResponse<T> {
  return { status: 0, data: { error: message, code } as unknown as T & BetaApiErrorFields };
}

export async function betaRequest<T>(
  path: string,
  options: { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown } = {},
): Promise<BetaResponse<T>> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && csrfTokenMemory) headers['X-CSRF-Token'] = csrfTokenMemory;

  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), BETA_REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: 'include',
      headers,
      signal: controller.signal,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
    const parsed: unknown = await res.json().catch((parseErr: unknown) => {
      if (isAbortError(parseErr)) throw parseErr;
      return null;
    });
    // JSON scalars and arrays are not beta response envelopes. Keep the HTTP
    // status so even a malformed 401 still ends an authenticated session.
    const data = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : { error: 'Invalid API response', code: 'INVALID_RESPONSE' };
    return { status: res.status, data: data as T & BetaApiErrorFields };
  } catch (err) {
    return isAbortError(err)
      ? networkFailure<T>('NETWORK_TIMEOUT', 'The API did not respond in time. Check your connection and retry.')
      : networkFailure<T>('NETWORK_ERROR', 'Network request failed. Check your connection and retry.');
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}
