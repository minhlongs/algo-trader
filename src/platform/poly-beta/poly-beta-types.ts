/**
 * POLY-G5 Public Beta — Isolated Worker Types & Safety Constants.
 *
 * Enforces `LIVE_TRADING_ENABLED = false` and `$100.00` (`100_000_000` micro-USD)
 * authoritative virtual portfolio boundaries.
 */

export const INITIAL_VIRTUAL_CAPITAL_MICRO = 100_000_000; // $100.000000
export const MICRO_PER_USD = 1_000_000;
export const MAX_PORTFOLIO_EXPOSURE_MICRO = 20_000_000; // $20.00 max exposure
export const MAX_SINGLE_ORDER_MICRO = 5_000_000; // $5.00 max single order
export const MAX_CUMULATIVE_DRAWDOWN_BPS = 500; // 5.00% ($5.00 on $100)
export const MARKET_STALENESS_LIMIT_MS = 30_000; // 30s fail-closed freshness limit
export const ACTIVE_ENGINE_ALARM_MS = 10_000; // 10s active DO alarm (never 5m cron)
export const SESSION_COOKIE_NAME = '__Host-poly_beta_sid';
export const DEV_SESSION_COOKIE_NAME = 'poly_beta_sid';
export const SESSION_TTL_MS = 24 * 60 * 60 * 1_000;

export const PILOT_APPROVED_STRATEGY_ID = 'toxicity-aware-mm-paper' as const;

export type ApprovedPaperStrategyId = typeof PILOT_APPROVED_STRATEGY_ID;

export function isApprovedPaperStrategyId(id: unknown): id is ApprovedPaperStrategyId {
  return id === PILOT_APPROVED_STRATEGY_ID;
}

export type EngineLifecycleState = 'STOPPED' | 'RUNNING' | 'PAUSED' | 'HALTED';

export interface ApprovedPaperStrategyDescriptor {
  id: ApprovedPaperStrategyId;
  name: string;
  mode: 'PAPER_ONLY';
  summaryVi: string;
  summaryEn: string;
  feeModel: string;
  queueAssumption: string;
}

/**
 * Approved paper execution harnesses.
 *
 * Public Beta runs ONE signal-free execution loop. These entries describe the
 * order-placement behaviour the harness genuinely performs today — they are not
 * quantitative strategies. The `id` values are legacy identifiers kept for
 * ledger compatibility and carry no strategy meaning in this beta.
 */
export const APPROVED_PAPER_STRATEGIES: readonly ApprovedPaperStrategyDescriptor[] = [
  {
    id: PILOT_APPROVED_STRATEGY_ID,
    name: 'Execution Harness — Taker (crosses spread)',
    mode: 'PAPER_ONLY',
    summaryVi:
      'Chiến lược duy nhất được phê duyệt trong Public Beta: mua YES ngay tại giá bán tốt nhất (best ask) với giới hạn rủi ro nghiêm ngặt.',
    summaryEn:
      'Single approved Public Beta execution harness: immediate BUY YES at best ask under strict paper risk limits.',
    feeModel: 'Taker parabolic fee = 0.02 × p × (1-p) × notional, floor $0.001',
    queueAssumption: 'No queue: fills immediately at best ask, pays taker fee',
  },
] as const;

export interface PolyBetaMarketSnapshot {
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
  source: 'polymarket-gamma-clob' | 'deterministic-fixture';
  sourceTimestampMs: number;
  fetchedAtMs: number;
}

export interface PolyBetaD1BoundStatement {
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean }>;
}

export interface PolyBetaD1Prepared {
  bind(...values: unknown[]): PolyBetaD1BoundStatement;
}

export interface PolyBetaD1Database {
  prepare(query: string): PolyBetaD1Prepared;
  batch?(statements: PolyBetaD1BoundStatement[]): Promise<unknown[]>;
  exec?(query: string): Promise<unknown>;
}

export interface PolyBetaKvNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface PolyBetaDoStub {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export interface PolyBetaDoNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): PolyBetaDoStub;
}

export interface PolyBetaEnv {
  POLY_BETA_DB: PolyBetaD1Database;
  POLY_BETA_KV: PolyBetaKvNamespace;
  TENANT_PAPER_ENGINE: PolyBetaDoNamespace;
  ENVIRONMENT?: string;
  LIVE_TRADING_ENABLED?: string;
  MAINTENANCE_MODE?: string;
  SIGNUP_GATE_MODE?: string;
  BETA_SIGNUP_ALLOWLIST?: string;
  BETA_SIGNUP_INVITES?: string;
  G1_SOAK_LOCK?: string;
  G2_POLY_SHADOW_LOCK?: string;
  ALLOWED_ORIGINS?: string;
  POLY_BETA_SESSION_SECRET?: string;
  POLY_BETA_PROXY_SECRET?: string;
  POLYMARKET_PUBLIC_GAMMA_URL?: string;
  POLYMARKET_PUBLIC_CLOB_URL?: string;
  COMMIT_SHA?: string;
}

export interface AuthenticatedTenantContext {
  userId: string;
  tenantId: string;
  email: string;
  sessionHash: string;
  csrfToken: string;
}
