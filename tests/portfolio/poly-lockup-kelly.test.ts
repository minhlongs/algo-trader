import { describe, expect, it } from 'vitest';
import {
  PolyLockupKellyAllocator,
  buildPortfolioKellyRiskState,
  computeNaiveIndependentKellyWeights,
  computeUmaResolutionRiskBps,
  shouldRotateEarly,
  solveLockupAdjustedKelly,
  type PolyKellyMarketCandidate,
} from '../../src/desk/portfolio';
import {
  evaluatePolyRisk,
  type PolyOrderIntent,
  type PolyPortfolioKellyRiskState,
  type PolyRiskState,
} from '../../src/desk/risk/poly-fail-closed-risk-engine';

const NOW = 1_700_000_000_000;
const NAV = 100_000;

function baseRiskState(portfolioKelly?: PolyPortfolioKellyRiskState | 'unknown'): PolyRiskState {
  return {
    nowMs: NOW,
    killSwitch: 'inactive',
    marketData: { observedAtMs: NOW - 250 },
    feeSchedule: { tokenId: 'tok-pa', rate: 0.02, exponent: 1 },
    positionReconciliation: { reconciled: true, reconciledAtMs: NOW - 1_000, openPositionCount: 3 },
    riskBudget: { maxNotionalUsd: 10_000, currentDrawdownPct: 1.0 },
    ...(portfolioKelly !== undefined ? { portfolioKelly } : {}),
  };
}

const baseIntent: PolyOrderIntent = {
  tokenId: 'tok-pa',
  side: 'buy',
  price: 0.50,
  size: 100, // $50 notional
  orderType: 'GTC',
};

describe('Lockup-Adjusted Multi-Market Kelly Solver', () => {
  const correlatedPi = [0.58, 0.07, 0.05, 0.30]; // omega_4 (p=0.30) is joint wipeout across all 4 swing states
  const swingCluster: PolyKellyMarketCandidate[] = [
    {
      tokenId: 'tok-pa',
      clusterId: 'election-swing',
      scenarioNetReturns: [0.96, 0.96, -0.98, -0.98],
      expectedLockupDays: 12,
      executableDepthUsd: 50_000,
      umaDispute: { disputeProbability: 0.002, extraLockupDays: 4.5, overturnHaircut: 0.5 },
    },
    {
      tokenId: 'tok-mi',
      clusterId: 'election-swing',
      scenarioNetReturns: [0.95, -0.98, 0.95, -0.98],
      expectedLockupDays: 12,
      executableDepthUsd: 50_000,
      umaDispute: { disputeProbability: 0.002, extraLockupDays: 4.5, overturnHaircut: 0.5 },
    },
    {
      tokenId: 'tok-wi',
      clusterId: 'election-swing',
      scenarioNetReturns: [0.94, 0.94, -0.98, -0.98],
      expectedLockupDays: 12,
      executableDepthUsd: 50_000,
      resolutionRiskBps: 10,
    },
    {
      tokenId: 'tok-ga',
      clusterId: 'election-swing',
      scenarioNetReturns: [0.92, -0.98, 0.92, -0.98],
      expectedLockupDays: 12,
      executableDepthUsd: 50_000,
      resolutionRiskBps: 10,
    },
  ];

  it('caps correlated cluster worst-case loss <= 3.0% NAV while naive independent 25% Kelly blows past 3.0% NAV', () => {
    const naiveWeights = computeNaiveIndependentKellyWeights(correlatedPi, swingCluster, 0.25);
    // Evaluate naive 25% Kelly loss in joint wipeout scenario s = 3
    const naiveJointLoss = naiveWeights.reduce(
      (acc, w, i) => acc + w * -swingCluster[i]!.scenarioNetReturns[3]!,
      0,
    );
    expect(naiveJointLoss).toBeGreaterThan(0.15); // > 15% NAV blow-through (>> 3.0% NAV cap)

    const solved = solveLockupAdjustedKelly({
      scenarioProbabilities: correlatedPi,
      candidates: swingCluster,
      navUsd: NAV,
    });

    expect(solved.diagnostics.failedClosed).toBe(false);
    expect(solved.diagnostics.converged).toBe(true);
    expect(solved.diagnostics.gradientOptimalityResidual).toBeLessThan(1e-5);
    expect(solved.diagnostics.worstPortfolioScenarioLoss).toBeLessThanOrEqual(0.03 + 1e-9);
    expect(solved.diagnostics.worstClusterScenarioLoss['election-swing']).toBeLessThanOrEqual(0.03 + 1e-9);
    expect(solved.weights.reduce((a, b) => a + b, 0)).toBeGreaterThan(0.025);
  });

  it('enforces per-event-cluster <= 3.0% worst-case loss even when another cluster offsets portfolio loss', () => {
    const pi = [0.65, 0.35];
    const multiCluster: PolyKellyMarketCandidate[] = [
      {
        tokenId: 'fed-cut-yes',
        clusterId: 'fomc-sep',
        scenarioNetReturns: [1.10, -1.0], // loses 100% in scenario 1
        expectedLockupDays: 10,
        executableDepthUsd: 80_000,
      },
      {
        tokenId: 'cpi-hedge-yes',
        clusterId: 'cpi-aug',
        scenarioNetReturns: [0.35, 1.50], // gains +150% in scenario 1, masking portfolio-wide loss!
        expectedLockupDays: 10,
        executableDepthUsd: 80_000,
      },
    ];

    const solved = solveLockupAdjustedKelly({
      scenarioProbabilities: pi,
      candidates: multiCluster,
      navUsd: NAV,
    });

    expect(solved.diagnostics.failedClosed).toBe(false);
    expect(solved.diagnostics.converged).toBe(true);
    // Without per-cluster cap, fomc-sep would exceed 3% because cpi-aug offsets scenario 1!
    expect(solved.diagnostics.worstClusterScenarioLoss['fomc-sep']).toBeLessThanOrEqual(0.03 + 1e-9);
    expect(solved.weightsByToken.get('fed-cut-yes')!).toBeLessThanOrEqual(0.03 + 1e-9);
  });

  it('immediately pre-filters opportunities whose daily net return <= marginal daily carry + UMA dispute cost', () => {
    const rrBps = computeUmaResolutionRiskBps({
      disputeProbability: 0.002,
      extraLockupDays: 4.5,
      overturnHaircut: 0.50,
    });
    expect(rrBps).toBeCloseTo(10.011, 2);

    const pi = [0.505, 0.495];
    const candidates: PolyKellyMarketCandidate[] = [
      {
        tokenId: 'sub-hurdle-token',
        clusterId: 'slow-macro',
        // E[R] = 0.505*(0.02) + 0.495*(0.0) = 0.0101 over 120d -> 0.84 bps/day < 4.5%/365 (~1.23 bps/day) + dispute
        scenarioNetReturns: [0.02, 0.0],
        expectedLockupDays: 120,
        executableDepthUsd: 50_000,
        resolutionRiskBps: 15,
      },
      {
        tokenId: 'high-edge-token',
        clusterId: 'fast-catalyst',
        scenarioNetReturns: [0.85, -0.50],
        expectedLockupDays: 7,
        executableDepthUsd: 50_000,
        resolutionRiskBps: 10,
      },
    ];

    const solved = solveLockupAdjustedKelly({ scenarioProbabilities: pi, candidates, navUsd: NAV });
    expect(solved.diagnostics.rejectedTokenIds).toContain('sub-hurdle-token');
    expect(solved.weightsByToken.get('sub-hurdle-token')).toBe(0);
    expect(solved.weightsByToken.get('high-edge-token')!).toBeGreaterThan(0);
  });

  it('enforces executable depth cap, total locked capital cap, and lockup/gamma sensitivity', () => {
    const pi = [0.80, 0.20];
    // Mild tail loss (-0.02) so neither scenario loss cap (0.03) nor single depth binds before maxLockedCapital
    const hedgedBatch: PolyKellyMarketCandidate[] = Array.from({ length: 5 }, (_, idx) => ({
      tokenId: `arb-${idx}`,
      clusterId: `cluster-${idx}`,
      scenarioNetReturns: [0.25, -0.02],
      expectedLockupDays: 10,
      executableDepthUsd: idx === 0 ? 1_500 : 40_000, // arb-0 depth = 1.5% NAV
      resolutionRiskBps: 5,
    }));

    const solved = solveLockupAdjustedKelly({
      scenarioProbabilities: pi,
      candidates: hedgedBatch,
      navUsd: NAV,
      config: { maxLockedCapital: 0.60, gammaKelly: 0.20 },
    });

    expect(solved.diagnostics.failedClosed).toBe(false);
    expect(solved.weightsByToken.get('arb-0')!).toBeLessThanOrEqual(0.015 + 1e-9);
    const totalLocked = solved.weights.reduce((a, b) => a + b, 0);
    expect(totalLocked).toBeLessThanOrEqual(0.60 + 1e-9);
    expect(totalLocked).toBeCloseTo(0.60, 4);

    // Lockup & gammaKelly sensitivity on an interior solution (not clipped by 3% cluster loss cap)
    const interiorCandidate: PolyKellyMarketCandidate = {
      tokenId: 'interior-1',
      clusterId: 'c1',
      scenarioNetReturns: [0.22, -0.20],
      expectedLockupDays: 30,
      executableDepthUsd: 90_000,
      resolutionRiskBps: 10,
    };
    const hiGamma = solveLockupAdjustedKelly({
      scenarioProbabilities: [0.53, 0.47],
      candidates: [interiorCandidate],
      navUsd: NAV,
      config: { gammaKelly: 0.25 },
    });
    const loGamma = solveLockupAdjustedKelly({
      scenarioProbabilities: [0.53, 0.47],
      candidates: [interiorCandidate],
      navUsd: NAV,
      config: { gammaKelly: 0.15 },
    });
    expect(loGamma.weights[0]!).toBeLessThan(hiGamma.weights[0]!);

    // True fractional Kelly damping check (HIGH-1 regression):
    // pi = [0.51, 0.49], R = [+0.20, -0.20] -> Full Kelly = 0.01 / 0.04 = 10.0% NAV;
    // 0.20 Fractional Kelly without drag is 2.0% NAV (slightly lower after 2-day carry + 1 bps RR).
    const fracCheck = solveLockupAdjustedKelly({
      scenarioProbabilities: [0.51, 0.49],
      candidates: [{
        tokenId: 'frac-kelly-tok',
        clusterId: 'c-frac',
        scenarioNetReturns: [0.20, -0.20],
        expectedLockupDays: 2,
        executableDepthUsd: 90_000,
        resolutionRiskBps: 1,
      }],
      navUsd: NAV,
      config: { gammaKelly: 0.20 },
    });
    expect(fracCheck.weights[0]!).toBeGreaterThan(0.015);
    expect(fracCheck.weights[0]!).toBeLessThanOrEqual(0.02 + 1e-6);
  });

  it('fails closed to zero weights on non-finite, unnormalized, or out-of-range inputs', () => {
    const badProb = solveLockupAdjustedKelly({
      scenarioProbabilities: [0.7, 0.5],
      candidates: swingCluster,
      navUsd: NAV,
    });
    expect(badProb.diagnostics.failedClosed).toBe(true);
    expect(badProb.weights).toEqual([0, 0, 0, 0]);

    const badGamma = solveLockupAdjustedKelly({
      scenarioProbabilities: correlatedPi,
      candidates: swingCluster,
      navUsd: NAV,
      config: { gammaKelly: 0.50 }, // violates [0.15, 0.25]
    });
    expect(badGamma.diagnostics.failedClosed).toBe(true);
    expect(badGamma.weights).toEqual([0, 0, 0, 0]);

    const nanReturn = solveLockupAdjustedKelly({
      scenarioProbabilities: [0.5, 0.5],
      candidates: [{
        tokenId: 'nan-tok',
        clusterId: 'c1',
        scenarioNetReturns: [Number.NaN, -0.5],
        expectedLockupDays: 10,
        executableDepthUsd: 10_000,
      }],
      navUsd: NAV,
    });
    expect(nanReturn.diagnostics.failedClosed).toBe(true);
    expect(nanReturn.weights).toEqual([0]);
  });
});

describe('PolyLockupKellyAllocator, Kill-Switch & Early Rotation', () => {
  const pi = [0.65, 0.35];
  const candidates: PolyKellyMarketCandidate[] = [
    {
      tokenId: 'tok-pa',
      clusterId: 'election-swing',
      scenarioNetReturns: [0.90, -0.95],
      expectedLockupDays: 20,
      executableDepthUsd: 50_000,
    },
  ];

  it('tracks 5-minute cadence and emits an immutable PolyPortfolioLimitsTable', () => {
    const allocator = new PolyLockupKellyAllocator();
    expect(allocator.isRebalanceDue(NOW)).toBe(true);

    const limits = allocator.allocate({
      nowMs: NOW,
      navPusd: NAV,
      disputedLockedPusd: 2_000, // 2% NAV
      portfolioDrawdownPct: 1.2,
      scenarioProbabilities: pi,
      candidates,
    });

    expect(Object.isFrozen(limits)).toBe(true);
    expect(limits.frozen).toBe(false);
    expect(limits.freezeReason).toBeNull();
    expect(limits.maxNotionalPerTokenUsd.get('tok-pa')!).toBeGreaterThan(0);
    expect(limits.maxClusterWorstCaseLossUsd.get('election-swing')).toBe(3_000);
    expect(allocator.isRebalanceDue(NOW + 299_999)).toBe(false);
    expect(allocator.isRebalanceDue(NOW + 300_000)).toBe(true);
  });

  it('freezes all disbursements when UMA-disputed capital exceeds 10% of NAV or drawdown >= 5.0%', () => {
    const allocator = new PolyLockupKellyAllocator();

    // Exact 10.0% UMA disputed is still allowed (strictly > 0.10 freezes)
    const atTenPct = allocator.allocate({
      nowMs: NOW,
      navPusd: NAV,
      disputedLockedPusd: 10_000,
      portfolioDrawdownPct: 2.0,
      scenarioProbabilities: pi,
      candidates,
    });
    expect(atTenPct.frozen).toBe(false);

    // 10.5% UMA disputed triggers UMA_DISPUTE_LOCKUP_CAP freeze & zeroes caps
    const umaFrozen = allocator.allocate({
      nowMs: NOW + 1_000,
      navPusd: NAV,
      disputedLockedPusd: 10_500,
      portfolioDrawdownPct: 2.0,
      scenarioProbabilities: pi,
      candidates,
    });
    expect(umaFrozen.frozen).toBe(true);
    expect(umaFrozen.freezeReason).toBe('UMA_DISPUTE_LOCKUP_CAP');
    expect(umaFrozen.maxNotionalPerTokenUsd.get('tok-pa')).toBe(0);

    // 5.0% portfolio drawdown triggers PORTFOLIO_DRAWDOWN_CAP freeze & zeroes caps
    const ddFrozen = allocator.allocate({
      nowMs: NOW + 2_000,
      navPusd: NAV,
      disputedLockedPusd: 1_000,
      portfolioDrawdownPct: 5.0,
      scenarioProbabilities: pi,
      candidates,
    });
    expect(ddFrozen.frozen).toBe(true);
    expect(ddFrozen.freezeReason).toBe('PORTFOLIO_DRAWDOWN_CAP');
    expect(ddFrozen.maxNotionalPerTokenUsd.get('tok-pa')).toBe(0);

    expect(() =>
      allocator.allocate({
        nowMs: NOW,
        navPusd: 0,
        disputedLockedPusd: 0,
        portfolioDrawdownPct: 0,
        scenarioProbabilities: pi,
        candidates,
      }),
    ).toThrow(RangeError);
  });

  it('triggers shouldRotateEarly iff >= 80% expected net profit is captured and > 15 lockup days remain', () => {
    expect(shouldRotateEarly({ capturedProfitRatio: 0.80, remainingLockupDays: 15.1 }).rotate).toBe(true);
    expect(shouldRotateEarly({ unrealizedNetProfitUsd: 85, expectedNetProfitUsd: 100, remainingLockupDays: 22 }).rotate).toBe(true);
    expect(shouldRotateEarly({ capturedProfitRatio: 0.85, remainingLockupDays: 15.0 }).rotate).toBe(false);
    expect(shouldRotateEarly({ capturedProfitRatio: 0.799, remainingLockupDays: 30 }).rotate).toBe(false);
    expect(shouldRotateEarly({ capturedProfitRatio: Number.NaN, remainingLockupDays: 25 }).rotate).toBe(false);
  });
});

describe('evaluatePolyRisk Integration (portfolioKelly)', () => {
  const healthyKelly: PolyPortfolioKellyRiskState = {
    tokenId: 'tok-pa',
    frozen: false,
    umaDisputedNavPct: 3.5,
    portfolioDrawdownPct: 1.8,
    navUsd: NAV,
    tokenCapUsd: 1_500,
    currentTokenExposureUsd: 400,
    projectedClusterWorstCaseLossUsd: 1_200,
    maxClusterWorstCaseLossUsd: 3_000,
  };

  it('preserves existing behavior when portfolioKelly is omitted and allows healthy portfolioKelly state', () => {
    expect(evaluatePolyRisk(baseIntent, baseRiskState())).toEqual({ allowed: true });
    expect(evaluatePolyRisk(baseIntent, baseRiskState(healthyKelly))).toEqual({ allowed: true });
  });

  it('blocks fail-closed with UNRESOLVED_STATE when portfolioKelly or any field inside it is unknown or NaN', () => {
    const wholeUnknown = evaluatePolyRisk(baseIntent, baseRiskState('unknown'));
    expect(wholeUnknown).toMatchObject({ allowed: false, reason: 'UNRESOLVED_STATE' });

    const fieldOverrides: Array<Partial<PolyPortfolioKellyRiskState>> = [
      { tokenId: 'unknown' },
      { tokenId: 'tok-other' },
      { tokenId: '   ' },
      { frozen: 'unknown' },
      { umaDisputedNavPct: 'unknown' },
      { umaDisputedNavPct: Number.NaN },
      { portfolioDrawdownPct: 'unknown' },
      { navUsd: 'unknown' },
      { tokenCapUsd: 'unknown' },
      { currentTokenExposureUsd: Number.NaN },
      { projectedClusterWorstCaseLossUsd: 'unknown' },
      { maxClusterWorstCaseLossUsd: 'unknown' },
    ];
    for (const patch of fieldOverrides) {
      const verdict = evaluatePolyRisk(baseIntent, baseRiskState({ ...healthyKelly, ...patch }));
      expect(verdict).toMatchObject({ allowed: false, reason: 'UNRESOLVED_STATE' });
    }
  });

  it('blocks on freeze, UMA dispute > 10% NAV, drawdown >= 5%, token cap breach, and cluster tail loss > 3% NAV', () => {
    expect(
      evaluatePolyRisk(baseIntent, baseRiskState({ ...healthyKelly, frozen: true })),
    ).toMatchObject({ allowed: false, reason: 'PORTFOLIO_KELLY_FROZEN' });

    expect(
      evaluatePolyRisk(baseIntent, baseRiskState({ ...healthyKelly, portfolioDrawdownPct: 5.0 })),
    ).toMatchObject({ allowed: false, reason: 'PORTFOLIO_KELLY_FROZEN' });

    expect(
      evaluatePolyRisk(baseIntent, baseRiskState({ ...healthyKelly, umaDisputedNavPct: 10.1 })),
    ).toMatchObject({ allowed: false, reason: 'UMA_DISPUTE_LOCKUP_HALT' });

    expect(
      evaluatePolyRisk(baseIntent, baseRiskState({ ...healthyKelly, currentTokenExposureUsd: 1_460 })), // 1460 + 50 > 1500
    ).toMatchObject({ allowed: false, reason: 'TOKEN_KELLY_CAP_EXCEEDED' });

    expect(
      evaluatePolyRisk(baseIntent, baseRiskState({ ...healthyKelly, projectedClusterWorstCaseLossUsd: 3_001 })),
    ).toMatchObject({ allowed: false, reason: 'CLUSTER_TAIL_LOSS_ABOVE_CAP' });

    // Even if maxClusterWorstCaseLossUsd is omitted, > 0.03 * navUsd ($3,000) still blocks
    expect(
      evaluatePolyRisk(
        baseIntent,
        baseRiskState({ ...healthyKelly, maxClusterWorstCaseLossUsd: undefined, projectedClusterWorstCaseLossUsd: 3_010 }),
      ),
    ).toMatchObject({ allowed: false, reason: 'CLUSTER_TAIL_LOSS_ABOVE_CAP' });
  });

  it('wires PolyLockupKellyAllocator -> buildPortfolioKellyRiskState -> evaluatePolyRisk end-to-end', () => {
    const allocator = new PolyLockupKellyAllocator();
    const limits = allocator.allocate({
      nowMs: NOW,
      navPusd: NAV,
      disputedLockedPusd: 1_500,
      portfolioDrawdownPct: 0.8,
      scenarioProbabilities: [0.65, 0.35],
      candidates: [{
        tokenId: 'tok-pa',
        clusterId: 'election-swing',
        scenarioNetReturns: [0.95, -1.0],
        expectedLockupDays: 14,
        executableDepthUsd: 50_000,
      }],
    });

    const okRisk = buildPortfolioKellyRiskState({
      limits,
      tokenId: 'tok-pa',
      clusterId: 'election-swing',
      currentTokenExposureUsd: 500,
      projectedClusterWorstCaseLossUsd: 550,
    });
    expect(evaluatePolyRisk(baseIntent, baseRiskState(okRisk))).toEqual({ allowed: true });

    // Unlisted token defaults to tokenCapUsd = 0 and blocks with TOKEN_KELLY_CAP_EXCEEDED
    const unlistedRisk = buildPortfolioKellyRiskState({
      limits,
      tokenId: 'unapproved-token',
      clusterId: 'election-swing',
      currentTokenExposureUsd: 0,
      projectedClusterWorstCaseLossUsd: 50,
    });
    expect(
      evaluatePolyRisk({ ...baseIntent, tokenId: 'unapproved-token' }, {
        ...baseRiskState(unlistedRisk),
        feeSchedule: { tokenId: 'unapproved-token', rate: 0.02, exponent: 1 },
      }),
    ).toMatchObject({ allowed: false, reason: 'TOKEN_KELLY_CAP_EXCEEDED' });

    // Unknown clusterId fails closed with UNRESOLVED_STATE; tokenId mismatch fails closed; SELL reduce-only is allowed
    const missingClusterRisk = buildPortfolioKellyRiskState({
      limits,
      tokenId: 'tok-pa',
      clusterId: 'unknown-cluster',
      currentTokenExposureUsd: 0,
      projectedClusterWorstCaseLossUsd: 10,
    });
    expect(evaluatePolyRisk(baseIntent, baseRiskState(missingClusterRisk))).toMatchObject({
      allowed: false,
      reason: 'UNRESOLVED_STATE',
    });
    expect(
      evaluatePolyRisk({ ...baseIntent, tokenId: 'other-tok' }, {
        ...baseRiskState(okRisk),
        feeSchedule: { tokenId: 'other-tok', rate: 0.02, exponent: 1 },
      }),
    ).toMatchObject({ allowed: false, reason: 'UNRESOLVED_STATE' });
    expect(
      evaluatePolyRisk({ ...baseIntent, side: 'sell' }, baseRiskState({ ...okRisk, frozen: true })),
    ).toEqual({ allowed: true });
  });
});
