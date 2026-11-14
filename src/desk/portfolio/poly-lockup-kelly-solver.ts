/**
 * Deterministic zero-native-dep convex solver for Lockup-Adjusted
 * Multi-Market Fractional Kelly (`w = gamma * f` fractional Kelly coordinates)
 * over joint world-state scenarios.
 */
import {
  DEFAULT_ANNUAL_CARRY_RATE, DEFAULT_GAMMA_KELLY, DEFAULT_KELLY_MAX_ITERATIONS,
  DEFAULT_KELLY_TIME_BUDGET_MS, DEFAULT_MAX_CLUSTER_LOSS, DEFAULT_MAX_LOCKED_CAPITAL,
  DEFAULT_UMA_EXTRA_LOCKUP_DAYS, DEFAULT_UMA_OVERTURN_HAIRCUT, DEFAULT_UMA_RESOLUTION_RISK_BPS,
  MAX_GAMMA_KELLY, MIN_GAMMA_KELLY,
  type PolyKellyMarketCandidate, type PolyKellySolverInput, type PolyKellySolverResult, type PolyUmaDisputeParams,
} from './poly-lockup-kelly-types';

interface HalfSpace { readonly a: Float64Array; readonly normSq: number; readonly b: number; }
const isFin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function dotVec(a: Float64Array, b: Float64Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}

export function computeUmaResolutionRiskBps(dispute: PolyUmaDisputeParams, annualCarryRate = DEFAULT_ANNUAL_CARRY_RATE): number {
  const p = dispute.disputeProbability, extraDays = dispute.extraLockupDays ?? DEFAULT_UMA_EXTRA_LOCKUP_DAYS, haircut = dispute.overturnHaircut ?? DEFAULT_UMA_OVERTURN_HAIRCUT;
  if (!isFin(p) || p < 0 || p > 1 || !isFin(extraDays) || extraDays < 0 || !isFin(haircut) || haircut < 0 || haircut > 1 || !isFin(annualCarryRate) || annualCarryRate < 0) return Number.NaN;
  return 10_000 * p * (haircut + (annualCarryRate * extraDays) / 365);
}

function projectOntoCappedBox(y: Float64Array, u: Float64Array, cap: number, out: Float64Array): void {
  if (cap <= 0) { out.fill(0); return; }
  let sum = 0, maxY = 0;
  for (let i = 0; i < y.length; i++) {
    out[i] = Math.min(u[i]!, Math.max(0, y[i]!));
    sum += out[i]!;
    if (y[i]! > maxY) maxY = y[i]!;
  }
  if (sum <= cap) return;
  let lo = 0, hi = maxY;
  for (let iter = 0; iter < 60; iter++) {
    const mid = 0.5 * (lo + hi);
    let s = 0;
    for (let i = 0; i < y.length; i++) s += Math.min(u[i]!, Math.max(0, y[i]! - mid));
    if (s > cap) lo = mid; else hi = mid;
  }
  for (let i = 0; i < y.length; i++) out[i] = Math.min(u[i]!, Math.max(0, y[i]! - hi));
}

function projectOntoPolytope(y: Float64Array, u: Float64Array, cap: number, halfSpaces: readonly HalfSpace[], deadlineMs: number): Float64Array {
  const m = y.length, x = new Float64Array(y), z0 = new Float64Array(m), tmp = new Float64Array(m), alpha = new Float64Array(halfSpaces.length);
  for (let cyc = 0; cyc < 160; cyc++) {
    let maxStep = 0, maxViol = 0;
    for (let i = 0; i < m; i++) tmp[i] = x[i]! + z0[i]!;
    projectOntoCappedBox(tmp, u, cap, x);
    for (let i = 0; i < m; i++) { const nextZ = tmp[i]! - x[i]!; maxStep = Math.max(maxStep, Math.abs(nextZ - z0[i]!)); z0[i] = nextZ; }
    for (let h = 0; h < halfSpaces.length; h++) {
      const hs = halfSpaces[h]!, viol = dotVec(hs.a, x) - hs.b;
      if (viol > maxViol) maxViol = viol;
      const nextAlpha = Math.max(0, alpha[h]! + viol / hs.normSq), delta = alpha[h]! - nextAlpha;
      if (delta !== 0) {
        for (let i = 0; i < m; i++) x[i] = x[i]! + delta * hs.a[i]!;
        maxStep = Math.max(maxStep, Math.abs(delta) * Math.sqrt(hs.normSq));
      }
      alpha[h] = nextAlpha;
    }
    if ((maxStep < 1e-12 && maxViol < 1e-12) || performance.now() >= deadlineMs) break;
  }
  for (let i = 0; i < m; i++) x[i] = Math.min(u[i]!, Math.max(0, x[i]!));
  let scale = cap > 0 ? x.reduce((acc, v) => acc + v, 0) / cap : 1;
  for (const hs of halfSpaces) scale = Math.max(scale, dotVec(hs.a, x) / hs.b);
  if (scale > 1) for (let i = 0; i < m; i++) x[i] = x[i]! / scale;
  return x;
}

function failClosed(candidates: readonly PolyKellyMarketCandidate[], reason: string, elapsedMs: number): PolyKellySolverResult {
  return {
    weights: candidates.map(() => 0), weightsByToken: new Map(candidates.map((c) => [c.tokenId, 0])),
    diagnostics: { iterations: 0, elapsedMs, converged: false, failedClosed: true, failClosedReason: reason, objectiveValue: 0, gradientOptimalityResidual: Number.POSITIVE_INFINITY, worstPortfolioScenarioLoss: 0, worstClusterScenarioLoss: {}, rejectedTokenIds: [] },
  };
}

function worstLossOnIndices(indices: readonly number[], w: Float64Array, candidates: readonly PolyKellyMarketCandidate[], sCount: number): number {
  let worst = 0;
  for (let s = 0; s < sCount; s++) {
    let ret = 0;
    for (const idx of indices) ret += w[idx]! * candidates[idx]!.scenarioNetReturns[s]!;
    if (-ret > worst) worst = -ret;
  }
  return worst;
}

export function solveLockupAdjustedKelly(input: PolyKellySolverInput): PolyKellySolverResult {
  const t0 = performance.now(), { scenarioProbabilities: pi, candidates, navUsd, config = {} } = input;
  const gamma = config.gammaKelly ?? DEFAULT_GAMMA_KELLY, carryRate = config.annualCarryRate ?? DEFAULT_ANNUAL_CARRY_RATE;
  const maxClusterLoss = config.maxClusterLoss ?? DEFAULT_MAX_CLUSTER_LOSS, maxLocked = config.maxLockedCapital ?? DEFAULT_MAX_LOCKED_CAPITAL;
  const maxIter = config.maxIterations ?? DEFAULT_KELLY_MAX_ITERATIONS, budgetMs = config.timeBudgetMs ?? DEFAULT_KELLY_TIME_BUDGET_MS;
  const optTol = config.optimalityTolerance ?? 1e-6, sCount = pi.length, m = candidates.length;

  if (!isFin(navUsd) || navUsd <= 0) return failClosed(candidates, 'navUsd must be positive finite', performance.now() - t0);
  if (!isFin(gamma) || gamma < MIN_GAMMA_KELLY || gamma > MAX_GAMMA_KELLY) return failClosed(candidates, 'gammaKelly out of [0.15, 0.25]', performance.now() - t0);
  if (!isFin(carryRate) || carryRate < 0 || !isFin(maxClusterLoss) || maxClusterLoss <= 0 || maxClusterLoss >= 1 || !isFin(maxLocked) || maxLocked <= 0 || maxLocked > 1 || !isFin(maxIter) || maxIter < 1 || !isFin(budgetMs) || budgetMs <= 0) return failClosed(candidates, 'invalid solver configuration bounds', performance.now() - t0);
  if (sCount === 0 || pi.some((p) => !isFin(p) || p < 0) || Math.abs(pi.reduce((a, b) => a + b, 0) - 1) > 1e-5) return failClosed(candidates, 'scenarioProbabilities must be non-negative and sum to 1', performance.now() - t0);
  if (m === 0) return { weights: [], weightsByToken: new Map(), diagnostics: { iterations: 0, elapsedMs: performance.now() - t0, converged: true, failedClosed: false, failClosedReason: null, objectiveValue: 0, gradientOptimalityResidual: 0, worstPortfolioScenarioLoss: 0, worstClusterScenarioLoss: {}, rejectedTokenIds: [] } };

  const drag = new Float64Array(m), u = new Float64Array(m), rejectedTokenIds: string[] = [], clusterMap = new Map<string, number[]>(), seenTokens = new Set<string>();
  for (let i = 0; i < m; i++) {
    const c = candidates[i]!;
    if (!c.tokenId || seenTokens.has(c.tokenId) || !c.clusterId || c.scenarioNetReturns.length !== sCount || c.scenarioNetReturns.some((r) => !isFin(r)) || !isFin(c.expectedLockupDays) || !isFin(c.executableDepthUsd) || c.executableDepthUsd < 0) return failClosed(candidates, `invalid candidate fields on index ${i}`, performance.now() - t0);
    seenTokens.add(c.tokenId);
    const rrBps = c.resolutionRiskBps !== undefined ? c.resolutionRiskBps : c.umaDispute ? computeUmaResolutionRiskBps(c.umaDispute, carryRate) : DEFAULT_UMA_RESOLUTION_RISK_BPS;
    if (!isFin(rrBps) || rrBps < 0) return failClosed(candidates, `invalid UMA resolution risk on ${c.tokenId}`, performance.now() - t0);
    const ci = (carryRate * Math.max(0, c.expectedLockupDays)) / 365 + 1e-4 * rrBps;
    drag[i] = ci;
    const mu = pi.reduce((acc, ps, s) => acc + ps * c.scenarioNetReturns[s]!, 0);
    if (c.expectedLockupDays <= 0 || c.executableDepthUsd <= 0 || mu / c.expectedLockupDays <= ci / c.expectedLockupDays) { u[i] = 0; rejectedTokenIds.push(c.tokenId); }
    else u[i] = Math.min(maxLocked, c.executableDepthUsd / navUsd);
    clusterMap.set(c.clusterId, [...(clusterMap.get(c.clusterId) ?? []), i]);
  }

  const allIndices = Array.from({ length: m }, (_, i) => i), halfSpaces: HalfSpace[] = [];
  for (const indices of [allIndices, ...(clusterMap.size > 1 ? clusterMap.values() : [])]) {
    for (let s = 0; s < sCount; s++) {
      const a = new Float64Array(m);
      let normSq = 0, hasPos = false;
      for (const idx of indices) {
        const lossCoeff = -candidates[idx]!.scenarioNetReturns[s]!;
        if (u[idx]! > 0 && lossCoeff !== 0) { a[idx] = lossCoeff; normSq += lossCoeff * lossCoeff; if (lossCoeff > 0) hasPos = true; }
      }
      if (hasPos && normSq > 1e-16) halfSpaces.push({ a, normSq, b: maxClusterLoss });
    }
  }

  const evalObjAndGrad = (w: Float64Array, gradOut?: Float64Array): number => {
    if (gradOut) for (let i = 0; i < m; i++) gradOut[i] = -drag[i]!;
    let obj = -dotVec(w, drag);
    for (let s = 0; s < sCount; s++) {
      let scaledPortRet = 0;
      for (let i = 0; i < m; i++) scaledPortRet += (w[i]! / gamma) * candidates[i]!.scenarioNetReturns[s]!;
      if (1 + scaledPortRet <= 0) return Number.NEGATIVE_INFINITY;
      obj += gamma * pi[s]! * Math.log(1 + scaledPortRet);
      if (gradOut) for (let i = 0; i < m; i++) gradOut[i] = gradOut[i]! + (pi[s]! / (1 + scaledPortRet)) * candidates[i]!.scenarioNetReturns[s]!;
    }
    return obj;
  };

  const deadlineMs = t0 + budgetMs, grad = new Float64Array(m), prevW = new Float64Array(m), prevGrad = new Float64Array(m), trial = new Float64Array(m);
  let w = new Float64Array(m), fVal = evalObjAndGrad(w, grad), eta = gamma, iterations = 0;
  for (let iter = 0; iter < maxIter && performance.now() < deadlineMs; iter++) {
    iterations = iter + 1;
    for (let i = 0; i < m; i++) trial[i] = w[i]! + eta * grad[i]!;
    const projected = projectOntoPolytope(trial, u, maxLocked, halfSpaces, deadlineMs);
    let dirDeriv = 0, maxDir = 0;
    for (let i = 0; i < m; i++) { const di = projected[i]! - w[i]!; dirDeriv += grad[i]! * di; maxDir = Math.max(maxDir, Math.abs(di)); }
    if (maxDir <= optTol * Math.min(1, eta) || dirDeriv <= 1e-14) break;
    let beta = 1.0, nextF = Number.NEGATIVE_INFINITY;
    for (let ls = 0; ls < 30; ls++) {
      for (let i = 0; i < m; i++) trial[i] = w[i]! + beta * (projected[i]! - w[i]!);
      nextF = evalObjAndGrad(trial);
      if (nextF >= fVal + 1e-4 * beta * dirDeriv) break;
      beta *= 0.5;
    }
    if (nextF <= fVal) break;
    prevW.set(w); prevGrad.set(grad); w = new Float64Array(trial); fVal = evalObjAndGrad(w, grad);
    let ss = 0, sy = 0;
    for (let i = 0; i < m; i++) { const si = w[i]! - prevW[i]!, yi = prevGrad[i]! - grad[i]!; ss += si * si; sy += si * yi; }
    eta = sy > 1e-14 ? Math.min(10, Math.max(1e-5, ss / sy)) : gamma;
  }

  // Evaluate projected-gradient stationarity with small probe step `tau = 1e-3`
  // so boundary active-set KKT residuals are exact rather than distorted by `eta = 1.0` jumps.
  const tau = 1e-3;
  for (let i = 0; i < m; i++) trial[i] = w[i]! + tau * grad[i]!;
  const unitProj = projectOntoPolytope(trial, u, maxLocked, halfSpaces, t0 + budgetMs + 10);
  let gradResidual = 0, sumW = 0;
  for (let i = 0; i < m; i++) {
    gradResidual = Math.max(gradResidual, Math.abs(unitProj[i]! - w[i]!) / tau); sumW += w[i]!;
    if (!isFin(w[i]) || w[i]! < -1e-9 || w[i]! > u[i]! + 1e-9) return failClosed(candidates, 'infeasible box weight', performance.now() - t0);
  }
  const worstPortLoss = worstLossOnIndices(allIndices, w, candidates, sCount), worstClusterLoss: Record<string, number> = {};
  for (const [cid, idxs] of clusterMap.entries()) {
    const worst = worstLossOnIndices(idxs, w, candidates, sCount);
    worstClusterLoss[cid] = worst;
    if (worst > maxClusterLoss + 1e-7) return failClosed(candidates, `cluster ${cid} tail loss exceeded cap`, performance.now() - t0);
  }
  if (!isFin(fVal) || fVal < -1e-9 || !isFin(gradResidual) || sumW > maxLocked + 1e-7 || worstPortLoss > maxClusterLoss + 1e-7) return failClosed(candidates, 'post-solve feasibility or optimality check failed', performance.now() - t0);
  const weights = Array.from(w);
  return {
    weights, weightsByToken: new Map(candidates.map((c, i) => [c.tokenId, weights[i]!])),
    diagnostics: { iterations, elapsedMs: performance.now() - t0, converged: gradResidual <= Math.max(optTol, 1e-4), failedClosed: false, failClosedReason: null, objectiveValue: fVal, gradientOptimalityResidual: gradResidual, worstPortfolioScenarioLoss: worstPortLoss, worstClusterScenarioLoss: worstClusterLoss, rejectedTokenIds },
  };
}
