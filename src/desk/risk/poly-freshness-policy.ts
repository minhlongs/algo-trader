/**
 * Governed market data freshness policy for Polymarket pre-trade risk gates.
 *
 * Aligns pre-trade staleness enforcement with IC Pre-Trade Risk Gate (p.50:
 * halt if feed stale > 1.5s) and `DEFAULT_LIQUIDITY_REGIME_CONFIG.maxWsLagMs` (1,500 ms).
 * Enforces fail-closed 1,500 ms default, bounded clock skew (500 ms), governed
 * `EVENT_SLOW_CADENCE` exceptions (<= 5,000 ms with non-expired approval), and
 * an anti-relaxation invariant that forbids widening during market stress.
 */

export const FRESHNESS_POLICY_VERSION = '1.0.0';
export const DEFAULT_MARKET_DATA_MAX_AGE_MS = 1_500;
export const EVENT_SLOW_CADENCE_DEFAULT_MAX_AGE_MS = 3_000;
export const MAX_GOVERNED_EXCEPTION_AGE_MS = 5_000;
export const MAX_CLOCK_SKEW_MS = 500;

export type StrategyFreshnessProfile = 'ACTIVE_MAKER' | 'NEGRISK_EXECUTION' | 'EVENT_SLOW_CADENCE';
export type FreshnessTimestampOrigin = 'recv_time' | 'exchange_time';
export type FreshnessStressRegime = 'QUIET' | 'TRENDING' | 'EVENT' | 'REDUCE_ONLY' | 'HALTED';
export type FreshnessAction = 'ALLOW' | 'CANCEL_AND_PAUSE';

export interface FreshnessExceptionApproval {
  approvalId: string;
  approvedBy: string;
  expiresAtMs: number;
  /** Governed exception TTL in ms (finite, > 0, <= 5,000). */
  maxAgeMs: number;
  /** Optional upper bound alias (if supplied, must be <= 5,000 and >= maxAgeMs). */
  maxAllowedMs?: number;
}

export interface ResolveFreshnessOptions {
  approval?: FreshnessExceptionApproval;
  regime?: FreshnessStressRegime;
  stressActive?: boolean;
  /** Optional explicit caller TTL override (backwards-compat; never widens under stress). */
  maxMarketDataAgeMs?: number;
}

export interface ResolvedFreshnessThreshold {
  profile: StrategyFreshnessProfile;
  maxAgeMs: number;
  relaxed: boolean;
  stressBlockedRelaxation: boolean;
  reason: string;
}

export interface MarketDataFreshnessPolicy extends ResolveFreshnessOptions {
  profile?: StrategyFreshnessProfile;
  maxClockSkewMs?: number;
}

export interface FreshnessMarketDataInput {
  observedAtMs: number | 'unknown';
  timestampOrigin?: FreshnessTimestampOrigin;
}

export interface MarketDataFreshnessEvaluation {
  ok: boolean;
  ageMs: number | null;
  maxAgeMs: number;
  action: FreshnessAction;
  reason: string;
  unresolved?: boolean;
}

const STRESS_REGIMES: ReadonlySet<FreshnessStressRegime> = new Set(['EVENT', 'TRENDING', 'REDUCE_ONLY', 'HALTED']);

function isFiniteNum(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isStressActive(opts?: ResolveFreshnessOptions): boolean {
  return Boolean(opts && (opts.stressActive === true || (opts.regime !== undefined && STRESS_REGIMES.has(opts.regime))));
}

function thresholdResult(
  profile: StrategyFreshnessProfile,
  maxAgeMs: number,
  reason: string,
  relaxed = false,
  stressBlockedRelaxation = false,
): ResolvedFreshnessThreshold {
  return { profile, maxAgeMs, relaxed, stressBlockedRelaxation, reason };
}

function validateApproval(
  approval: FreshnessExceptionApproval | undefined,
  nowMs: number,
): { valid: true; maxAgeMs: number } | { valid: false; reason: string } {
  if (!approval) return { valid: false, reason: 'no risk approval record supplied' };
  if (typeof approval.approvalId !== 'string' || !approval.approvalId.trim()) return { valid: false, reason: 'approvalId is missing or empty' };
  if (typeof approval.approvedBy !== 'string' || !approval.approvedBy.trim()) return { valid: false, reason: 'approvedBy is missing or empty' };
  if (!isFiniteNum(approval.expiresAtMs) || approval.expiresAtMs <= nowMs) return { valid: false, reason: 'risk approval has expired or has non-finite expiresAtMs' };
  if (!isFiniteNum(approval.maxAgeMs) || approval.maxAgeMs <= 0) return { valid: false, reason: 'approval maxAgeMs must be a positive finite number' };
  if (approval.maxAgeMs > MAX_GOVERNED_EXCEPTION_AGE_MS) {
    return { valid: false, reason: `approval maxAgeMs ${approval.maxAgeMs}ms exceeds ${MAX_GOVERNED_EXCEPTION_AGE_MS}ms cap` };
  }
  if (approval.maxAllowedMs !== undefined) {
    if (!isFiniteNum(approval.maxAllowedMs) || approval.maxAllowedMs <= 0 || approval.maxAllowedMs > MAX_GOVERNED_EXCEPTION_AGE_MS) {
      return { valid: false, reason: `approval maxAllowedMs must be in (0, ${MAX_GOVERNED_EXCEPTION_AGE_MS}]` };
    }
    if (approval.maxAgeMs > approval.maxAllowedMs) {
      return { valid: false, reason: `approval maxAgeMs ${approval.maxAgeMs}ms exceeds maxAllowedMs ${approval.maxAllowedMs}ms` };
    }
  }
  return { valid: true, maxAgeMs: approval.maxAgeMs };
}

/**
 * Resolve effective market-data freshness threshold (ms).
 * Fail-closed 1,500 ms default; validates non-expired exception approvals;
 * forbids any relaxation above 1,500 ms during market stress.
 */
export function resolveFreshnessThreshold(
  profile: StrategyFreshnessProfile | undefined,
  nowMs: number,
  opts?: ResolveFreshnessOptions,
): ResolvedFreshnessThreshold {
  const effectiveProfile: StrategyFreshnessProfile = profile ?? 'ACTIVE_MAKER';
  const stressed = isStressActive(opts);

  if (!isFiniteNum(nowMs)) {
    return thresholdResult(effectiveProfile, DEFAULT_MARKET_DATA_MAX_AGE_MS, 'evaluation clock non-finite; fail-closed default 1500ms applied');
  }

  if (opts?.maxMarketDataAgeMs !== undefined) {
    const req = opts.maxMarketDataAgeMs;
    if (!isFiniteNum(req) || req <= 0) {
      return thresholdResult(effectiveProfile, DEFAULT_MARKET_DATA_MAX_AGE_MS, 'invalid explicit maxMarketDataAgeMs; fail-closed default 1500ms applied');
    }
    if (req <= DEFAULT_MARKET_DATA_MAX_AGE_MS) {
      return thresholdResult(effectiveProfile, req, `explicit tightened threshold ${req}ms applied`);
    }
    if (stressed) {
      return thresholdResult(effectiveProfile, DEFAULT_MARKET_DATA_MAX_AGE_MS, `relaxation to ${req}ms refused during market stress; snapped to ${DEFAULT_MARKET_DATA_MAX_AGE_MS}ms`, false, true);
    }
    const capped = Math.min(req, MAX_GOVERNED_EXCEPTION_AGE_MS);
    return thresholdResult(effectiveProfile, capped, `explicit caller threshold ${capped}ms applied`, capped > DEFAULT_MARKET_DATA_MAX_AGE_MS);
  }

  if (effectiveProfile !== 'EVENT_SLOW_CADENCE') {
    const triedRelax = (opts?.approval?.maxAgeMs ?? 0) > DEFAULT_MARKET_DATA_MAX_AGE_MS;
    return thresholdResult(effectiveProfile, DEFAULT_MARKET_DATA_MAX_AGE_MS, `${effectiveProfile} requires strict ${DEFAULT_MARKET_DATA_MAX_AGE_MS}ms freshness gate`, false, stressed && triedRelax);
  }

  if (stressed) {
    return thresholdResult(effectiveProfile, DEFAULT_MARKET_DATA_MAX_AGE_MS, `EVENT_SLOW_CADENCE relaxation forbidden during market stress; snapped to ${DEFAULT_MARKET_DATA_MAX_AGE_MS}ms`, false, true);
  }

  const check = validateApproval(opts?.approval, nowMs);
  if (!check.valid) {
    return thresholdResult(effectiveProfile, DEFAULT_MARKET_DATA_MAX_AGE_MS, `EVENT_SLOW_CADENCE exception denied (${check.reason}); fail-closed ${DEFAULT_MARKET_DATA_MAX_AGE_MS}ms applied`);
  }

  return thresholdResult(
    effectiveProfile,
    check.maxAgeMs,
    `governed exception ${opts!.approval!.approvalId} approved by ${opts!.approval!.approvedBy} (${check.maxAgeMs}ms)`,
    check.maxAgeMs > DEFAULT_MARKET_DATA_MAX_AGE_MS,
  );
}

/**
 * Evaluate market data freshness fail-closed.
 * Returns `CANCEL_AND_PAUSE` on missing/non-finite timestamps, excessive future
 * clock skew (> maxClockSkewMs), or staleness (> resolved maxAgeMs).
 */
export function evaluateMarketDataFreshness(
  marketData: FreshnessMarketDataInput | 'unknown' | undefined,
  nowMs: number | 'unknown',
  policy?: MarketDataFreshnessPolicy,
): MarketDataFreshnessEvaluation {
  const resolved = resolveFreshnessThreshold(policy?.profile, isFiniteNum(nowMs) ? nowMs : Number.NaN, policy);
  const maxAgeMs = resolved.maxAgeMs;
  const maxClockSkewMs = isFiniteNum(policy?.maxClockSkewMs) && policy.maxClockSkewMs >= 0 ? policy.maxClockSkewMs : MAX_CLOCK_SKEW_MS;

  if (!isFiniteNum(nowMs)) {
    return { ok: false, ageMs: null, maxAgeMs, action: 'CANCEL_AND_PAUSE', reason: 'evaluation clock (nowMs) is unknown or non-finite', unresolved: true };
  }
  const observedAtMs = typeof marketData === 'object' && marketData !== null ? marketData.observedAtMs : 'unknown';
  if (!isFiniteNum(observedAtMs)) {
    return { ok: false, ageMs: null, maxAgeMs, action: 'CANCEL_AND_PAUSE', reason: 'market data: observation timestamp is unknown', unresolved: true };
  }

  const ageMs = nowMs - observedAtMs;
  if (ageMs < -maxClockSkewMs) {
    return { ok: false, ageMs, maxAgeMs, action: 'CANCEL_AND_PAUSE', reason: `market data is ${-ageMs}ms in the future (exceeds ${maxClockSkewMs}ms clock skew tolerance)` };
  }
  if (ageMs > maxAgeMs) {
    return { ok: false, ageMs, maxAgeMs, action: 'CANCEL_AND_PAUSE', reason: `market data is ${ageMs}ms old, TTL is ${maxAgeMs}ms (policy v${FRESHNESS_POLICY_VERSION})` };
  }
  return { ok: true, ageMs, maxAgeMs, action: 'ALLOW', reason: 'fresh' };
}
