/**
 * Strategy 7 — 5-State Microstructure Liquidity Regime Switching Meta-Control Policy.
 *
 * Type definitions, parameter surface, and `DELETE /cancel-market-orders` transport
 * per IC Report (pp. 43–45).
 */

export type LiquidityRegimeState =
  | 'QUIET'
  | 'TRENDING'
  | 'EVENT'
  | 'REDUCE_ONLY'
  | 'HALTED';

export const MIN_EVENT_COOLDOWN_MS = 60_000;
export const DEFAULT_EVENT_COOLDOWN_MS = 120_000;
export const MAX_EVENT_COOLDOWN_MS = 180_000;

export interface LiquidityRegimeConfig {
  /** Maximum WebSocket market-data lag before HALTED (default 1,500 ms). */
  maxWsLagMs: number;
  /** Daily realized + mark-to-market loss cap in pUSD before HALTED. */
  maxDailyLossPusd: number;
  /** Rolling 1-minute API error count threshold; > threshold trips HALTED (default 10). */
  maxApiErrorsPerMinute: number;
  /** p99 cancel acknowledgement latency threshold in ms; > threshold trips HALTED (default 1,000 ms). */
  maxCancelAckP99Ms: number;
  /** Minimum lock duration in HALTED once tripped (default 300,000 ms = 5 minutes). */
  haltLockDurationMs: number;
  /** Normalized inventory |q| threshold for REDUCE_ONLY (default 1.0). */
  reduceOnlyInventoryThreshold: number;
  /** Remaining time to expiry at or below which REDUCE_ONLY engages (default 2 hours). */
  reduceOnlyExpiryMs: number;
  /** Remaining time to expiry at or below which all quotes are withdrawn (default 30 minutes). */
  fullWithdrawExpiryMs: number;
  /** 10-second mid/touch jump in ticks that triggers EVENT (default 3 ticks). */
  eventPriceJump10sTicks: number;
  /** 10-second reference price move in percent that triggers EVENT (default 2.0%). */
  eventRefPriceMove10sPct: number;
  /** Calm-observation cooling-off duration required to leave EVENT (default 120,000 ms). */
  eventCooldownMs: number;
  /** 85th-percentile VPIN threshold above which TRENDING engages (default 0.65). */
  vpinQ85Threshold: number;
  /** Fill rate per minute above which TRENDING engages (default 3). */
  trendingFillsPerMinute: number;
  /** Kyle's lambda multiple over baseline above which TRENDING engages (default 2.0). */
  trendingKyleLambdaMultiple: number;
}

export const DEFAULT_LIQUIDITY_REGIME_CONFIG: LiquidityRegimeConfig = {
  maxWsLagMs: 1_500,
  maxDailyLossPusd: 150,
  maxApiErrorsPerMinute: 10,
  maxCancelAckP99Ms: 1_000,
  haltLockDurationMs: 300_000,
  reduceOnlyInventoryThreshold: 1.0,
  reduceOnlyExpiryMs: 2 * 3_600_000,
  fullWithdrawExpiryMs: 30 * 60_000,
  eventPriceJump10sTicks: 3,
  eventRefPriceMove10sPct: 2.0,
  eventCooldownMs: DEFAULT_EVENT_COOLDOWN_MS,
  vpinQ85Threshold: 0.65,
  trendingFillsPerMinute: 3,
  trendingKyleLambdaMultiple: 2.0,
};

export interface LiquidityRegimeObservation {
  marketId: string;
  nowMs: number;
  wsLagMs?: number;
  http425Active?: boolean;
  ghostFillDetected?: boolean;
  dailyLossPusd?: number;
  apiErrorsLastMinute?: number;
  cancelAckP99Ms?: number;
  normalizedInventoryQ?: number;
  timeToExpiryMs?: number;
  priceJump10sTicks?: number;
  refPriceMove10sPct?: number;
  referencePrice?: number;
  tickSize?: number;
  inScheduledCatalystWindow?: boolean;
  vpin?: number;
  fillsPerMinute?: number;
  kyleLambda?: number;
  baselineKyleLambda?: number;
}

export interface LiquidityRegimeDecision {
  marketId: string;
  state: LiquidityRegimeState;
  previousState: LiquidityRegimeState;
  transitioned: boolean;
  reasons: string[];
  sizeMultiplier: number;
  spreadMultiplier: number;
  allowNewQuotes: boolean;
  allowCloseOrMergeOnly: boolean;
  withdrawAllQuotes: boolean;
  cancelMarketOrders: boolean;
  optimizeIncentiveSpread: boolean;
  haltedUntilMs: number;
  eventCooldownUntilMs: number;
  evaluatedAtMs: number;
}

export interface CancelMarketOrdersRequest {
  marketId: string;
  reason: string;
  requestedAtMs: number;
}

export interface CancelMarketOrdersResult {
  ok: boolean;
  status: number;
  canceledIds: string[];
  body?: string;
}

export type CancelMarketOrdersTransport = (
  req: CancelMarketOrdersRequest,
) => Promise<CancelMarketOrdersResult>;

export interface LiquidityRegimeTelemetrySnapshot {
  systemHaltedUntilMs: number;
  rollingApiErrorsLastMinute: number;
  markets: Record<string, LiquidityRegimeDecision>;
  transitionsCount: number;
}

/** CLOB V2 `DELETE {host}/cancel-market-orders` transport seam for EVENT / HALTED regimes. */
export function createCancelMarketOrdersTransport(options: {
  host?: string;
  fetchImpl?: typeof fetch;
  headers?: Record<string, string>;
  getHeaders?: (body: string) => Record<string, string> | Promise<Record<string, string>>;
} = {}): CancelMarketOrdersTransport {
  const host = (options.host ?? 'https://clob.polymarket.com').replace(/\/+$/, '');
  return async (req): Promise<CancelMarketOrdersResult> => {
    const doFetch = options.fetchImpl ?? fetch;
    const payload = JSON.stringify({ market: req.marketId });
    const dyn = options.getHeaders ? await options.getHeaders(payload) : {};
    const res = await doFetch(`${host}/cancel-market-orders`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}), ...dyn },
      body: payload,
    });
    const raw = await res.text();
    let canceledIds: string[] = [];
    try {
      const parsed = JSON.parse(raw) as { canceled?: unknown };
      if (Array.isArray(parsed.canceled)) {
        canceledIds = parsed.canceled.filter((x): x is string => typeof x === 'string');
      }
    } catch {
      canceledIds = [];
    }
    return { ok: res.ok, status: res.status, canceledIds, body: raw };
  };
}
