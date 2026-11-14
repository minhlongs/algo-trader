/**
 * Types and constants for Dependency-Aware Multi-Market Portfolio
 * & Lockup-Adjusted Fractional Kelly Convex Optimization.
 */

export const MIN_GAMMA_KELLY = 0.15;
export const MAX_GAMMA_KELLY = 0.25;
export const DEFAULT_GAMMA_KELLY = 0.20;
export const DEFAULT_ANNUAL_CARRY_RATE = 0.045;
export const DEFAULT_MAX_CLUSTER_LOSS = 0.03;
export const DEFAULT_MAX_LOCKED_CAPITAL = 0.60;
export const DEFAULT_UMA_RESOLUTION_RISK_BPS = 10;
export const DEFAULT_UMA_EXTRA_LOCKUP_DAYS = 4.5;
export const DEFAULT_UMA_OVERTURN_HAIRCUT = 0.50;
export const DEFAULT_KELLY_MAX_ITERATIONS = 250;
export const DEFAULT_KELLY_TIME_BUDGET_MS = 50;
export const DEFAULT_ALLOCATION_CADENCE_MS = 5 * 60 * 1_000;
export const UMA_DISPUTE_LOCKUP_FREEZE_RATIO = 0.10;
export const PORTFOLIO_DRAWDOWN_FREEZE_THRESHOLD_PCT = 5.0;
export const EARLY_ROTATION_PROFIT_CAPTURE_RATIO = 0.80;
export const EARLY_ROTATION_REMAINING_LOCKUP_DAYS = 15;

export interface PolyUmaDisputeParams {
  /** Posterior market dispute probability P(D_i) in [0, 1]. */
  readonly disputeProbability: number;
  /** Expected extra UMA dispute lockup days (typically 3-6 days; default 4.5). */
  readonly extraLockupDays?: number;
  /** Expected 50-50 split / oracle overturn haircut in [0, 1] (default 0.50). */
  readonly overturnHaircut?: number;
}

export interface PolyKellyMarketCandidate {
  readonly tokenId: string;
  readonly clusterId: string;
  /** Net scenario return R_i^net(omega_s) for each s in 0..S-1 (net of early-exit fees & 3-6d lockup buffer). */
  readonly scenarioNetReturns: readonly number[];
  /** Expected lockup duration E[tau_i] in days (> 0). */
  readonly expectedLockupDays: number;
  /** Executable orderbook depth V_{depth,i} in USD/pUSD (>= 0). */
  readonly executableDepthUsd: number;
  /** Explicit UMA resolution risk premium RR_i in bps; overrides `umaDispute` when provided. */
  readonly resolutionRiskBps?: number;
  /** Structural UMA dispute parameters used to derive RR_i when `resolutionRiskBps` is omitted. */
  readonly umaDispute?: PolyUmaDisputeParams;
}

export interface PolyKellySolverConfig {
  /** Fractional Kelly damper gamma_kelly in [0.15, 0.25] (default 0.20). */
  readonly gammaKelly?: number;
  /** Annual opportunity carry rate r_carry (default 0.045 = 4.5%/yr). */
  readonly annualCarryRate?: number;
  /** Worst-case scenario and per-event-cluster tail loss fraction L_cluster_max (default 0.03 = 3.0% NAV). */
  readonly maxClusterLoss?: number;
  /** Total locked capital fraction cap U_max_locked (default 0.60 = 60% NAV). */
  readonly maxLockedCapital?: number;
  /** Outer Projected Gradient Ascent iteration ceiling (default 250). */
  readonly maxIterations?: number;
  /** Deterministic wall-clock budget in milliseconds (default 50ms). */
  readonly timeBudgetMs?: number;
  /** KKT projected-gradient optimality tolerance (default 1e-6). */
  readonly optimalityTolerance?: number;
}

export interface PolyKellySolverInput {
  /** Joint world-state posterior probabilities pi(omega_s) >= 0, sum_s pi(omega_s) = 1. */
  readonly scenarioProbabilities: readonly number[];
  /** Candidate Polymarket token positions i = 1..M. */
  readonly candidates: readonly PolyKellyMarketCandidate[];
  /** Total portfolio NAV B_total in USD/pUSD (> 0). */
  readonly navUsd: number;
  readonly config?: PolyKellySolverConfig;
}

export interface PolyKellySolverDiagnostics {
  readonly iterations: number;
  readonly elapsedMs: number;
  readonly converged: boolean;
  readonly failedClosed: boolean;
  readonly failClosedReason: string | null;
  readonly objectiveValue: number;
  readonly gradientOptimalityResidual: number;
  readonly worstPortfolioScenarioLoss: number;
  readonly worstClusterScenarioLoss: Readonly<Record<string, number>>;
  readonly rejectedTokenIds: readonly string[];
}

export interface PolyKellySolverResult {
  readonly weights: readonly number[];
  readonly weightsByToken: ReadonlyMap<string, number>;
  readonly diagnostics: PolyKellySolverDiagnostics;
}

export type PolyFreezeReason = 'UMA_DISPUTE_LOCKUP_CAP' | 'PORTFOLIO_DRAWDOWN_CAP' | null;

export interface PolyPortfolioLimitsTable {
  readonly evaluatedAtMs: number;
  readonly navPusd: number;
  readonly maxNotionalPerTokenUsd: ReadonlyMap<string, number>;
  readonly maxClusterWorstCaseLossUsd: ReadonlyMap<string, number>;
  readonly weightsByToken: ReadonlyMap<string, number>;
  readonly umaDisputedNavPct: number;
  readonly portfolioDrawdownPct: number;
  readonly frozen: boolean;
  readonly freezeReason: PolyFreezeReason;
  readonly diagnostics: PolyKellySolverDiagnostics;
}

export interface PolyPortfolioAllocatorInput {
  readonly nowMs: number;
  readonly navPusd: number;
  readonly disputedLockedPusd: number;
  readonly portfolioDrawdownPct: number;
  readonly scenarioProbabilities: readonly number[];
  readonly candidates: readonly PolyKellyMarketCandidate[];
  readonly solverConfig?: PolyKellySolverConfig;
}

export interface EarlyRotationInput {
  readonly tokenId?: string;
  /** Ratio of captured net profit in [0, +inf), e.g. 0.82 = 82% of expected net profit captured. */
  readonly capturedProfitRatio?: number;
  /** Optional unrealized net profit in USD (used with `expectedNetProfitUsd` if `capturedProfitRatio` omitted). */
  readonly unrealizedNetProfitUsd?: number;
  /** Optional initial expected net profit in USD (> 0). */
  readonly expectedNetProfitUsd?: number;
  /** Remaining expected capital lockup in days. */
  readonly remainingLockupDays: number;
}

export interface EarlyRotationDecision {
  readonly rotate: boolean;
  readonly capturedProfitRatio: number;
  readonly remainingLockupDays: number;
  readonly reason: string;
}
