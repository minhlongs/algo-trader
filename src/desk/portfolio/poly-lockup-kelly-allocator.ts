/**
 * Portfolio Allocator, 5-minute / pre-batch Limits Table Emitter,
 * Hard Freeze Kill-Switch, and Early Profit-Taking Rotation Evaluator.
 */

import type { PolyPortfolioKellyRiskState } from '../risk/poly-risk-types';
import { solveLockupAdjustedKelly } from './poly-lockup-kelly-solver';
import {
  DEFAULT_ALLOCATION_CADENCE_MS,
  DEFAULT_MAX_CLUSTER_LOSS,
  EARLY_ROTATION_PROFIT_CAPTURE_RATIO,
  EARLY_ROTATION_REMAINING_LOCKUP_DAYS,
  PORTFOLIO_DRAWDOWN_FREEZE_THRESHOLD_PCT,
  UMA_DISPUTE_LOCKUP_FREEZE_RATIO,
  type EarlyRotationDecision,
  type EarlyRotationInput,
  type PolyFreezeReason,
  type PolyKellyMarketCandidate,
  type PolyKellySolverConfig,
  type PolyKellySolverDiagnostics,
  type PolyPortfolioAllocatorInput,
  type PolyPortfolioLimitsTable,
} from './poly-lockup-kelly-types';

const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export interface PolyAllocatorOptions {
  readonly cadenceMs?: number;
  readonly defaultSolverConfig?: PolyKellySolverConfig;
}

export interface BuildPortfolioKellyRiskParams {
  readonly limits: PolyPortfolioLimitsTable;
  readonly tokenId: string;
  readonly clusterId: string;
  readonly currentTokenExposureUsd: number;
  readonly projectedClusterWorstCaseLossUsd: number;
}

export function shouldRotateEarly(
  input: EarlyRotationInput,
  minProfitCaptureRatio = EARLY_ROTATION_PROFIT_CAPTURE_RATIO,
  minRemainingLockupDays = EARLY_ROTATION_REMAINING_LOCKUP_DAYS,
): EarlyRotationDecision {
  const { remainingLockupDays } = input;
  let ratio = input.capturedProfitRatio;
  if (ratio === undefined && isFiniteNum(input.unrealizedNetProfitUsd) && isFiniteNum(input.expectedNetProfitUsd) && input.expectedNetProfitUsd > 0) {
    ratio = input.unrealizedNetProfitUsd / input.expectedNetProfitUsd;
  }
  if (!isFiniteNum(ratio) || !isFiniteNum(remainingLockupDays)) {
    return { rotate: false, capturedProfitRatio: 0, remainingLockupDays: isFiniteNum(remainingLockupDays) ? remainingLockupDays : 0, reason: 'non-finite profit ratio or lockup horizon' };
  }
  if (ratio >= minProfitCaptureRatio && remainingLockupDays > minRemainingLockupDays) {
    return {
      rotate: true,
      capturedProfitRatio: ratio,
      remainingLockupDays,
      reason: `captured ${(ratio * 100).toFixed(1)}% >= ${(minProfitCaptureRatio * 100).toFixed(1)}% with ${remainingLockupDays.toFixed(1)}d > ${minRemainingLockupDays}d remaining`,
    };
  }
  return {
    rotate: false,
    capturedProfitRatio: ratio,
    remainingLockupDays,
    reason: `below early-rotation threshold (ratio=${(ratio * 100).toFixed(1)}%, remainingDays=${remainingLockupDays.toFixed(1)})`,
  };
}

/** Single-market fractional Kelly ignoring cross-market scenario correlation and cluster loss caps. */
export function computeNaiveIndependentKellyWeights(
  scenarioProbabilities: readonly number[],
  candidates: readonly PolyKellyMarketCandidate[],
  gammaKelly = 0.25,
): number[] {
  return candidates.map((c) => {
    const minRet = Math.min(...c.scenarioNetReturns);
    const upper = minRet < 0 ? Math.min(1, 0.9999 / -minRet) : 1;
    const deriv = (w: number): number => {
      let g = 0;
      for (let s = 0; s < scenarioProbabilities.length; s++) {
        g += (scenarioProbabilities[s]! * c.scenarioNetReturns[s]!) / (1 + w * c.scenarioNetReturns[s]!);
      }
      return g;
    };
    if (deriv(0) <= 0) return 0;
    if (deriv(upper) >= 0) return gammaKelly * upper;
    let lo = 0;
    let hi = upper;
    for (let iter = 0; iter < 60; iter++) {
      const mid = 0.5 * (lo + hi);
      if (deriv(mid) > 0) lo = mid; else hi = mid;
    }
    return gammaKelly * 0.5 * (lo + hi);
  });
}

export function buildPortfolioKellyRiskState(params: BuildPortfolioKellyRiskParams): PolyPortfolioKellyRiskState {
  const { limits, tokenId, clusterId, currentTokenExposureUsd, projectedClusterWorstCaseLossUsd } = params;
  return {
    frozen: limits.frozen,
    umaDisputedNavPct: limits.umaDisputedNavPct,
    portfolioDrawdownPct: limits.portfolioDrawdownPct,
    navUsd: limits.navPusd,
    tokenCapUsd: limits.maxNotionalPerTokenUsd.get(tokenId) ?? 0,
    currentTokenExposureUsd,
    projectedClusterWorstCaseLossUsd,
    maxClusterWorstCaseLossUsd: limits.maxClusterWorstCaseLossUsd.get(clusterId),
  };
}

export class PolyLockupKellyAllocator {
  private readonly cadenceMs: number;
  private readonly defaultSolverConfig: PolyKellySolverConfig;
  private lastEvaluatedAtMs: number | null = null;
  private lastLimits: PolyPortfolioLimitsTable | null = null;

  constructor(options: PolyAllocatorOptions = {}) {
    this.cadenceMs = options.cadenceMs ?? DEFAULT_ALLOCATION_CADENCE_MS;
    this.defaultSolverConfig = options.defaultSolverConfig ?? {};
    if (!isFiniteNum(this.cadenceMs) || this.cadenceMs <= 0) {
      throw new RangeError('PolyLockupKellyAllocator cadenceMs must be a positive finite number');
    }
  }

  public isRebalanceDue(nowMs: number): boolean {
    if (!isFiniteNum(nowMs)) return true;
    return this.lastEvaluatedAtMs === null || nowMs < this.lastEvaluatedAtMs || nowMs - this.lastEvaluatedAtMs >= this.cadenceMs;
  }

  public getLastLimitsTable(): PolyPortfolioLimitsTable | null {
    return this.lastLimits;
  }

  public allocate(input: PolyPortfolioAllocatorInput): PolyPortfolioLimitsTable {
    const { nowMs, navPusd, disputedLockedPusd, portfolioDrawdownPct, scenarioProbabilities, candidates } = input;
    if (!isFiniteNum(nowMs) || !isFiniteNum(navPusd) || navPusd <= 0 || !isFiniteNum(disputedLockedPusd) || disputedLockedPusd < 0 || !isFiniteNum(portfolioDrawdownPct) || portfolioDrawdownPct < 0) {
      throw new RangeError('Invalid allocator boundary state: nowMs, navPusd (>0), disputedLockedPusd (>=0), and portfolioDrawdownPct (>=0) must be finite');
    }
    const mergedConfig: PolyKellySolverConfig = { ...this.defaultSolverConfig, ...input.solverConfig };
    const maxClusterLoss = mergedConfig.maxClusterLoss ?? DEFAULT_MAX_CLUSTER_LOSS;
    const umaDisputedRatio = disputedLockedPusd / navPusd;
    const umaDisputedNavPct = umaDisputedRatio * 100;

    let freezeReason: PolyFreezeReason = null;
    if (umaDisputedRatio > UMA_DISPUTE_LOCKUP_FREEZE_RATIO) {
      freezeReason = 'UMA_DISPUTE_LOCKUP_CAP';
    } else if (portfolioDrawdownPct >= PORTFOLIO_DRAWDOWN_FREEZE_THRESHOLD_PCT) {
      freezeReason = 'PORTFOLIO_DRAWDOWN_CAP';
    }
    const frozen = freezeReason !== null;

    const clusterCaps = new Map<string, number>();
    for (const c of candidates) clusterCaps.set(c.clusterId, maxClusterLoss * navPusd);

    let maxNotional: Map<string, number>;
    let weightsByToken: ReadonlyMap<string, number>;
    let diagnostics: PolyKellySolverDiagnostics;

    if (frozen) {
      maxNotional = new Map(candidates.map((c) => [c.tokenId, 0]));
      weightsByToken = new Map(candidates.map((c) => [c.tokenId, 0]));
      diagnostics = Object.freeze({
        iterations: 0, elapsedMs: 0, converged: true, failedClosed: false, failClosedReason: null,
        objectiveValue: 0, gradientOptimalityResidual: 0, worstPortfolioScenarioLoss: 0,
        worstClusterScenarioLoss: {}, rejectedTokenIds: [],
      });
    } else {
      const solved = solveLockupAdjustedKelly({ scenarioProbabilities, candidates, navUsd: navPusd, config: mergedConfig });
      weightsByToken = solved.weightsByToken;
      maxNotional = new Map(candidates.map((c) => [c.tokenId, (solved.weightsByToken.get(c.tokenId) ?? 0) * navPusd]));
      diagnostics = Object.freeze({ ...solved.diagnostics });
    }

    const table: PolyPortfolioLimitsTable = Object.freeze({
      evaluatedAtMs: nowMs,
      navPusd,
      maxNotionalPerTokenUsd: maxNotional,
      maxClusterWorstCaseLossUsd: clusterCaps,
      weightsByToken,
      umaDisputedNavPct,
      portfolioDrawdownPct,
      frozen,
      freezeReason,
      diagnostics,
    });
    this.lastEvaluatedAtMs = nowMs;
    this.lastLimits = table;
    return table;
  }
}
