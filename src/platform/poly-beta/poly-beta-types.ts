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

export type ApprovedPaperStrategyId =
  | 'toxicity-aware-mm-paper'
  | 'neg-risk-bundle-paper'
  | 'bayesian-fair-value-paper';

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
    id: 'toxicity-aware-mm-paper',
    name: 'Execution Harness — Taker (crosses spread)',
    mode: 'PAPER_ONLY',
    summaryVi:
      'ID cũ giữ để tương thích sổ cái. Hành vi hiện tại: mua YES ngay tại giá bán tốt nhất (best ask), không có mô hình tín hiệu OFI/VPIN nào chạy.',
    summaryEn:
      'Legacy ID kept for ledger compatibility. Current behaviour: immediate BUY YES at best ask. No OFI/VPIN signal model runs in this beta.',
    feeModel: 'Taker parabolic fee = 0.02 × p × (1-p) × notional, floor $0.001',
    queueAssumption: 'No queue: fills immediately at best ask, pays taker fee',
  },
  {
    id: 'neg-risk-bundle-paper',
    name: 'Execution Harness — Post-only (rests at best bid)',
    mode: 'PAPER_ONLY',
    summaryVi:
      'ID cũ giữ để tương thích sổ cái. Hành vi hiện tại: đặt lệnh BUY giới hạn tại best bid và nằm chờ; beta chưa khớp lệnh chờ.',
    summaryEn:
      'Legacy ID kept for ledger compatibility. Current behaviour: rests a BUY limit order at best bid. Resting orders never auto-match in this beta.',
    feeModel: 'Maker 0 bps — resting orders are never filled, so no fee is charged',
    queueAssumption: 'Rests at best bid until manually cancelled or market settlement',
  },
  {
    id: 'bayesian-fair-value-paper',
    name: 'Execution Harness — Passive (rests below best bid)',
    mode: 'PAPER_ONLY',
    summaryVi:
      'ID cũ giữ để tương thích sổ cái. Hành vi hiện tại: đặt lệnh BUY giới hạn thấp hơn best bid một bước giá và nằm chờ; không có mô hình định giá Bayes.',
    summaryEn:
      'Legacy ID kept for ledger compatibility. Current behaviour: rests a BUY limit one tick below best bid. No Bayesian fair-value model runs in this beta.',
    feeModel: 'Maker 0 bps — resting orders are never filled, so no fee is charged',
    queueAssumption: 'Rests one tick below best bid until manually cancelled or settlement',
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
