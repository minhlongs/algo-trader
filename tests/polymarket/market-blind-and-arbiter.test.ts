import { describe, expect, it, vi } from 'vitest';
import type { ClobClient, RawOrderBook } from '../../src/desk/polymarket/clob-client';
import type { EventBus } from '../../src/desk/events/event-bus';
import type { GammaClient, GammaEvent, GammaMarket } from '../../src/desk/polymarket/gamma-client';
import type { OrderManager } from '../../src/desk/polymarket/order-manager';
import {
  MarketBlindError,
  MarketBlindProspectiveLedger,
  PROB_EPS,
  assertMarketBlindClean,
  calibrateLogitLinear,
  commitMarketBlindForecast,
  computeShrunkPosterior,
  evaluateCalibrationMetrics,
  evaluateSkillGate,
  fitIsotonicCalibrator,
  fitLogitCalibrator,
  logit,
  predictIsotonic,
  predictLogitCalibrated,
  sanitizeMarketBlindContext,
  sigmoid,
  stripForbiddenMarketKeys,
  type CalibrationMetrics,
  type OosEvaluationRecord,
  type SealedForecastReceipt,
} from '../../src/desk/polymarket/market-blind';
import {
  DEFAULT_CONFIG as NEWS_DEFAULT_CONFIG,
  PrimarySourceNewsLatencyStrategy,
  arbitrationChecksFromTable,
  recordedBulletinSource,
  verifyBulletin,
  type Bulletin,
  type MarketCheck,
  type NewsStreams,
  type PrimarySourceNewsLatencyDeps,
} from '../../src/desk/strategies/polymarket/quant-alpha/primary-source-news-latency';

const BASE_NOW = 1_763_000_000_000;

function passingMetrics(overrides: Partial<CalibrationMetrics> = {}): CalibrationMetrics {
  return {
    resolvedCount: 200,
    bsModel: 0.16,
    bsMarket: 0.20,
    bssOos: 0.20,
    bssLower95: 0.08,
    ece: 0.018,
    rolling100ModelBrier: 0.155,
    rolling100MarketBrier: 0.195,
    ...overrides,
  };
}

describe('Strategy 6 — Market-Blind Sanitizer & Anti-Hindcast Guard', () => {
  it('recursively strips forbidden market/orderbook keys and scrubs inline odds/price anchors', () => {
    const rawMeta: Record<string, unknown> = {
      author: 'BLS',
      midPrice: 0.64,
      bestBid: 0.63,
      bestAsk: 0.65,
      lastTradePrice: 0.64,
      polymarketPrice: '64%',
      nested: {
        yesPrice: 0.64,
        noPrice: 0.36,
        impliedProb: 0.64,
        orderbook: { bids: [0.63], asks: [0.65] },
        crowdProb: 0.66,
        note: 'Polymarket shows 64% chance while trading at 64¢ with best ask 0.65.',
      },
    };
    const cleaned = stripForbiddenMarketKeys(rawMeta) as { author: string; nested: Record<string, unknown> };
    expect(cleaned).toEqual({
      author: 'BLS',
      nested: {
        note: '[REDACTED_MARKET_ANCHOR] while [REDACTED_MARKET_ANCHOR] with [REDACTED_MARKET_ANCHOR].',
      },
    });
    expect(() => assertMarketBlindClean(JSON.stringify(cleaned))).not.toThrow();
  });

  it('hard-blocks via assertMarketBlindClean if unredacted Polymarket price/odds tokens remain', () => {
    expect(() => assertMarketBlindClean('Polymarket currently prices YES at 72%')).toThrowError(MarketBlindError);
    expect(() => assertMarketBlindClean('Contract trading at 58¢ on heavy flow')).toThrow(/MARKET_ANCHOR_LEAKAGE_DETECTED/);
    expect(() => assertMarketBlindClean('Current market odds 81% ahead of print')).toThrow(/MARKET_ANCHOR_LEAKAGE_DETECTED/);
    expect(() => assertMarketBlindClean('Snapshot {"bestAsk": 0.44}')).toThrow(/MARKET_ANCHOR_LEAKAGE_DETECTED/);
    expect(() => assertMarketBlindClean('CPI rose 0.2% month-over-month per BLS release.')).not.toThrow();
  });

  it('enforces 6,000 per-doc and 24,000 total context caps against multi-megabyte payloads', () => {
    const hugeChunk = 'Macro release paragraph without market anchors. '.repeat(250); // ~12,000 chars
    const docs = Array.from({ length: 6 }, (_, idx) => ({
      id: `doc-${idx}`,
      title: `Release ${idx} `,
      content: `${hugeChunk} Polymarket odds 77% trading at 77¢`,
    }));

    const ctx = sanitizeMarketBlindContext({ documents: docs });
    expect(ctx.totalChars).toBeLessThanOrEqual(24_000);
    expect(ctx.documents).toHaveLength(4);
    expect(ctx.droppedDocuments).toBe(2);
    expect(ctx.truncatedDocuments).toBe(4);
    for (const d of ctx.documents) {
      expect(d.title.length + d.content.length).toBeLessThanOrEqual(6_000);
      expect(() => assertMarketBlindClean(`${d.title} ${d.content}`)).not.toThrow();
    }
    expect(ctx.contextHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('blocks hindcast-contaminated evaluations on or before modelKnowledgeCutoffMs', () => {
    const cutoff = Date.UTC(2026, 5, 30);
    expect(() =>
      sanitizeMarketBlindContext(
        {
          documents: [{ id: 'd1', title: 'Doc', content: 'Primary filing' }],
          eventResolutionOrCutoffMs: cutoff,
        },
        { modelKnowledgeCutoffMs: cutoff },
      ),
    ).toThrow(/HINDCAST_CONTAMINATION_BLOCKED/);

    const prospective = sanitizeMarketBlindContext(
      {
        documents: [{ id: 'd1', title: 'Doc', content: 'Primary filing' }],
        eventResolutionOrCutoffMs: cutoff + 86_400_000,
      },
      { modelKnowledgeCutoffMs: cutoff },
    );
    expect(prospective.documents).toHaveLength(1);
  });
});

describe('Strategy 6 — Immutable Prospective Ledger & Calibration (PAVA + Logit)', () => {
  it('commits hash-chained sealed receipts and blocks pre-commit or forged market price reads', async () => {
    const ledger = new MarketBlindProspectiveLedger();
    const r1 = commitMarketBlindForecast(
      {
        modelVersionId: 'opus-5.5-mb-v1',
        stateVariant: 'blind-rag-v2',
        questionId: 'q-fomc-nov',
        category: 'macro',
        pRaw: 0.68,
        loggedAtMs: BASE_NOW,
        contextHash: 'a'.repeat(64),
      },
      ledger,
    );
    const r2 = ledger.commitForecast({
      modelVersionId: 'opus-5.5-mb-v1',
      stateVariant: 'blind-rag-v2',
      questionId: 'q-cpi-nov',
      category: 'macro',
      pRaw: 0.41,
      loggedAtMs: BASE_NOW + 100,
      contextHash: 'b'.repeat(64),
    });

    expect(r1.entryHash).toMatch(/^[0-9a-f]{64}$/);
    expect(r2.prevEntryHash).toBe(r1.entryHash);
    expect(ledger.verifyChainIntegrity()).toBe(true);

    const liveMid = await ledger.readLiveMarketAfterCommit(r1, () => 0.52);
    expect(liveMid).toBe(0.52);

    const forged: SealedForecastReceipt = { ...r1 };
    await expect(ledger.readLiveMarketAfterCommit(forged, () => 0.52)).rejects.toThrow(/UNSEALED_FORECAST_RECEIPT/);
    expect(() =>
      computeShrunkPosterior({
        receipt: forged,
        pCal: 0.66,
        marketPrice: 0.52,
        metrics: passingMetrics(),
      }),
    ).toThrow(/UNSEALED_FORECAST_RECEIPT/);

    expect(() =>
      ledger.recordResolution({
        receipt: r1,
        marketPriceAtCommit: 0.52,
        marketObservedAtMs: BASE_NOW - 1,
        outcome: 1,
        resolvedAtMs: BASE_NOW + 10_000,
      }),
    ).toThrow(/before forecast commit/);
  });

  it('fits monotonic PAVA isotonic and Platt logit calibrators clamped inside [1e-4, 1-1e-4]', () => {
    const samples = [
      { pRaw: 0.10, outcome: 0 as const },
      { pRaw: 0.20, outcome: 1 as const }, // adjacent violator vs 0.30 -> pooled to 0.5
      { pRaw: 0.30, outcome: 0 as const },
      { pRaw: 0.75, outcome: 1 as const },
      { pRaw: 0.90, outcome: 1 as const },
    ];
    const iso = fitIsotonicCalibrator(samples);
    const grid = [0.05, 0.15, 0.25, 0.50, 0.80, 0.99];
    const preds = grid.map((p) => predictIsotonic(iso, p));
    for (let i = 1; i < preds.length; i += 1) {
      expect(preds[i]!).toBeGreaterThanOrEqual(preds[i - 1]! - 1e-12);
    }
    for (const p of preds) {
      expect(p).toBeGreaterThanOrEqual(PROB_EPS);
      expect(p).toBeLessThanOrEqual(1 - PROB_EPS);
    }

    const platt = fitLogitCalibrator(samples);
    expect(platt.slope).toBeGreaterThan(0);
    const lowCal = predictLogitCalibrated(platt, 0.15);
    const highCal = predictLogitCalibrated(platt, 0.85);
    expect(highCal).toBeGreaterThan(lowCal);
    expect(calibrateLogitLinear(0.999999, 50, 20)).toBe(1 - PROB_EPS);
    expect(calibrateLogitLinear(0.000001, 50, -20)).toBe(PROB_EPS);
  });

  it('computes OOS Brier, BSS_OOS, 95% lower bound, 10-bin ECE, and rolling-100 Brier', () => {
    const records: OosEvaluationRecord[] = [];
    for (let i = 0; i < 160; i += 1) {
      const outcome: 0 | 1 = i % 2 === 0 ? 1 : 0;
      const pCal = outcome === 1 ? 0.72 : 0.28;
      const pMarket = 0.50;
      records.push({ pCal, pMarket, outcome });
    }
    const m = evaluateCalibrationMetrics(records);
    expect(m.resolvedCount).toBe(160);
    expect(m.bsModel).toBeCloseTo(0.28 ** 2, 6);
    expect(m.bsMarket).toBeCloseTo(0.25, 6);
    expect(m.bssOos).toBeCloseTo(1 - 0.0784 / 0.25, 6);
    expect(m.bssLower95).toBeGreaterThan(0.5);
    expect(m.rolling100ModelBrier).toBeLessThan(m.rolling100MarketBrier);
  });
});

describe('Strategy 6 — Shrunk Posterior, Hard Skill Gate & Conservative Signal Rules', () => {
  const receipt = commitMarketBlindForecast({
    modelVersionId: 'opus-5.5-mb-v1',
    stateVariant: 'blind-v1',
    questionId: 'q-rate-cut',
    category: 'macro',
    pRaw: 0.78,
    loggedAtMs: BASE_NOW,
  });

  it('hard-locks w_skill = 0 and p_post === p_mkt on each of the 4 kill-switch failure modes', () => {
    const cases: Array<[Partial<CalibrationMetrics>, string]> = [
      [{ resolvedCount: 149 }, 'INSUFFICIENT_RESOLVED_SAMPLES'],
      [{ bssOos: 0.015 }, 'INSUFFICIENT_BSS_OOS'],
      [{ bssLower95: 0 }, 'NON_POSITIVE_BSS_LOWER95'],
      [{ ece: 0.035 }, 'EXCESSIVE_ECE'],
      [{ rolling100ModelBrier: 0.19, rolling100MarketBrier: 0.19 }, 'ROLLING_100_BRIER_WORSE_THAN_MARKET'],
    ];

    for (const [patch, reason] of cases) {
      const res = computeShrunkPosterior({
        receipt,
        pCal: 0.80,
        marketPrice: 0.50,
        askPrice: 0.51,
        metrics: passingMetrics(patch),
        notionalPusd: 1_000,
      });
      expect(res.wSkill).toBe(0);
      expect(res.loggingOnly).toBe(true);
      expect(res.pPost).toBe(0.50);
      expect(res.proposal).toBeNull();
      expect(res.proposalRejectionReason).toBe('SKILL_GATE_LOCKED');
      expect(res.skillGateReasons).toContain(reason);
    }
  });

  it('applies exact Bayesian logit-pool shrinkage and selects post-only vs taker and cost caps', () => {
    // bssOos = 0.10, tau = 0.10 => w_skill = 0.5 capped at wMax = 0.35
    const metrics = passingMetrics({ bssOos: 0.10 });
    const gate = evaluateSkillGate(metrics);
    expect(gate.wSkill).toBeCloseTo(0.35, 8);

    const expectedPost = sigmoid(logit(0.50) + 0.35 * (logit(0.80) - logit(0.50)));
    // Ask = 0.575, sigmaPost = 0.01 -> edgeCons = expectedPost (~0.6190) - 0.01645 - 0.575 = ~0.0275 (< 0.03 rejected)
    const lowEdge = computeShrunkPosterior({
      receipt,
      pCal: 0.80,
      marketPrice: 0.50,
      askPrice: 0.575,
      sigmaPost: 0.01,
      metrics,
      notionalPusd: 2_000,
    });
    expect(lowEdge.pPost).toBeCloseTo(expectedPost, 8);
    expect(lowEdge.proposal).toBeNull();
    expect(lowEdge.proposalRejectionReason).toBe('INSUFFICIENT_CONSERVATIVE_EDGE');

    // Post-only band: 300 bps <= netEdgeAfterTaker < 450 bps on 0.01 tick grid
    const postOnly = computeShrunkPosterior({
      receipt,
      pCal: 0.80,
      marketPrice: 0.50,
      askPrice: 0.56,
      bestBid: 0.54,
      sigmaPost: 0.01,
      takerFeePerShare: 0.002,
      metrics,
      notionalPusd: 2_000,
      inferenceCostPusd: 1.5, // 0.075% <= 0.15%
    });
    expect(postOnly.proposal?.executionStyle).toBe('post-only-improve-1tick');
    expect(postOnly.proposal?.limitPrice).toBeCloseTo(0.55, 6);

    // Taker band: netEdgeAfterTaker >= 450 bps
    const taker = computeShrunkPosterior({
      receipt,
      pCal: 0.80,
      marketPrice: 0.50,
      askPrice: 0.54,
      sigmaPost: 0.01,
      takerFeePerShare: 0.005,
      metrics,
      notionalPusd: 2_000,
      inferenceCostPusd: 2.0,
    });
    expect(taker.proposal?.executionStyle).toBe('taker');
    expect(taker.proposal?.limitPrice).toBe(0.54);

    // Extreme pinning filter: marketPrice > 0.90 blocked
    const pinned = computeShrunkPosterior({
      receipt,
      pCal: 0.99,
      marketPrice: 0.92,
      askPrice: 0.92,
      metrics,
      notionalPusd: 2_000,
    });
    expect(pinned.proposal).toBeNull();
    expect(pinned.proposalRejectionReason).toBe('MARKET_PRICE_OUTSIDE_BAND');

    // Inference API cost > 0.15% of notional blocked
    const overCost = computeShrunkPosterior({
      receipt,
      pCal: 0.80,
      marketPrice: 0.50,
      askPrice: 0.54,
      sigmaPost: 0.01,
      metrics,
      notionalPusd: 1_000,
      inferenceCostPusd: 2.0, // 0.20% > 0.15%
    });
    expect(overCost.proposal).toBeNull();
    expect(overCost.proposalRejectionReason).toBe('INFERENCE_COST_CAP_EXCEEDED');
  });
});

describe('Strategy 4 — Host Whitelist Pre-Screen, 3rd Arbiter Split Resolution & Market-Blind Ceiling', () => {
  const CHECK: MarketCheck = {
    key: 'fed-cut',
    allowedSourceHosts: ['federalreserve.gov'],
    requiredTerms: ['fomc lowers target range'],
    forbiddenTerms: ['rumor'],
    requiredNumbers: [{ value: 4.25, tolerance: 0.01 }],
  };

  it('short-circuits unwhitelisted sourceHost or spoofed URL host before invoking any stream', async () => {
    const term = vi.fn(() => ({ matches: true, confidence: 1, reason: 'ok' }));
    const numeric = vi.fn(() => ({ matches: true, confidence: 1, reason: 'ok' }));
    const arbiter = vi.fn(() => ({ matches: true, confidence: 1, reason: 'ok' }));

    const badHostRes = await verifyBulletin(
      { id: 'b1', title: 'FOMC', body: '4.25', sourceHost: 'spoof.example.org', publishedAtMs: BASE_NOW },
      CHECK,
      { term, numeric, arbiter },
      { ...NEWS_DEFAULT_CONFIG, requireArbiterOnSplit: true },
      () => BASE_NOW,
    );
    expect(badHostRes).toEqual({ confirmed: false, elapsedMs: 0, reason: 'unwhitelisted-source-host' });
    expect(term).not.toHaveBeenCalled();
    expect(numeric).not.toHaveBeenCalled();
    expect(arbiter).not.toHaveBeenCalled();

    const badUrlRes = await verifyBulletin(
      {
        id: 'b2',
        title: 'FOMC',
        body: '4.25',
        sourceHost: 'www.federalreserve.gov',
        url: 'https://phish.attacker.tld/release',
        publishedAtMs: BASE_NOW,
      },
      CHECK,
      { term, numeric, arbiter },
      NEWS_DEFAULT_CONFIG,
      () => BASE_NOW,
    );
    expect(badUrlRes.confirmed).toBe(false);
    expect(badUrlRes.reason).toBe('unwhitelisted-source-host');
    expect(term).not.toHaveBeenCalled();
  });

  it('resolves 1-of-2 split via 3rd arbiter inside dualVerifyWindowMs when opted in', async () => {
    let now = BASE_NOW;
    const bulletin: Bulletin = {
      id: 'b-split',
      title: 'FOMC lowers target range to four and a quarter percent',
      body: 'Official release',
      sourceHost: 'https://www.federalreserve.gov',
      publishedAtMs: BASE_NOW - 100,
    };
    const splitStreams: NewsStreams = {
      term: () => {
        now += 250;
        return { matches: true, confidence: 1, reason: '1/1 terms' };
      },
      numeric: () => ({ matches: false, confidence: 0, reason: 'spelled out' }),
      arbiter: vi.fn(() => {
        now += 300;
        return { matches: true, confidence: 1, reason: 'semantic-arbiter-confirmed' };
      }),
    };

    // Default requireArbiterOnSplit = false -> strict 2-stream consensus rejects without calling arbiter
    const strictRes = await verifyBulletin(bulletin, CHECK, splitStreams, NEWS_DEFAULT_CONFIG, () => now);
    expect(strictRes.confirmed).toBe(false);
    expect(splitStreams.arbiter).not.toHaveBeenCalled();

    // Opted in -> 250ms + 300ms = 550ms <= 800ms window -> confirmed!
    now = BASE_NOW;
    const confirmedRes = await verifyBulletin(
      bulletin,
      CHECK,
      splitStreams,
      { ...NEWS_DEFAULT_CONFIG, requireArbiterOnSplit: true },
      () => now,
    );
    expect(confirmedRes.confirmed).toBe(true);
    expect(confirmedRes.elapsedMs).toBe(550);
    expect(splitStreams.arbiter).toHaveBeenCalledTimes(1);

    // Budget exceeded during arbiter (> 800ms) -> rejected!
    now = BASE_NOW;
    const slowArbiterStreams: NewsStreams = {
      ...splitStreams,
      arbiter: () => {
        now += 650; // 250 + 650 = 900ms > 800ms
        return { matches: true, confidence: 1, reason: 'too-late' };
      },
    };
    const lateRes = await verifyBulletin(
      bulletin,
      CHECK,
      slowArbiterStreams,
      { ...NEWS_DEFAULT_CONFIG, requireArbiterOnSplit: true },
      () => now,
    );
    expect(lateRes.confirmed).toBe(false);
    expect(lateRes.reason).toContain('arbiter exceeded window');
  });

  it('caps Strategy 4 ladder sweep p_max at sealed Market-Blind posterior p_post(E) - theta_safety', async () => {
    const mkMarket = (idx: number, ask: number): GammaMarket => ({
      id: `m-${idx}`,
      question: `Cut leg ${idx}?`,
      conditionId: `c-${idx}`,
      slug: `cut-${idx}`,
      outcomes: ['Yes', 'No'],
      outcomePrices: [ask.toFixed(2), (1 - ask).toFixed(2)],
      volume: 100_000,
      liquidity: 40_000,
      endDate: new Date(BASE_NOW + idx * 3_600_000).toISOString(),
      active: true,
      closed: false,
      tokens: [],
      yesTokenId: `yes-${idx}`,
      noTokenId: `no-${idx}`,
      yesPrice: ask,
    });

    const event: GammaEvent = {
      id: 'evt-mb',
      title: 'Fed cut ladder',
      slug: 'fed-cut',
      // Leg 1 ask 0.65 (<= 0.85 eligible), Leg 2 ask 0.91 (> 0.85 filtered out by p_post - theta_safety!)
      markets: [mkMarket(1, 0.65), mkMarket(2, 0.91)],
    };
    const books: Record<string, RawOrderBook> = {
      'yes-1': { bids: [{ price: '0.63', size: '500' }], asks: [{ price: '0.65', size: '500' }], timestamp: BASE_NOW },
      'yes-2': { bids: [{ price: '0.89', size: '500' }], asks: [{ price: '0.91', size: '500' }], timestamp: BASE_NOW },
    };
    const bulletins: Bulletin[] = [{
      id: 'b-live',
      title: 'FOMC lowers target range to 4.25 percent',
      body: 'Official statement',
      sourceHost: 'federalreserve.gov',
      publishedAtMs: BASE_NOW - 200,
    }];
    const placed: Array<{ tokenId: string; price: number }> = [];
    const sealed = commitMarketBlindForecast({
      modelVersionId: 'opus-5.5-mb-v1',
      stateVariant: 'blind-v1',
      questionId: 'evt-mb',
      category: 'macro',
      pRaw: 0.90,
      loggedAtMs: BASE_NOW - 500,
    });

    const deps: PrimarySourceNewsLatencyDeps = {
      clob: {
        getOrderBook: vi.fn(async (id: string) => books[id]!),
        getPrice: vi.fn(async () => 0.63),
        getMidPrice: vi.fn(async () => 0.64),
      } as unknown as ClobClient,
      orderManager: {
        placeOrder: vi.fn(async (p: { tokenId: string; price: string; size: string }) => {
          placed.push({ tokenId: p.tokenId, price: parseFloat(p.price) });
          return { id: `o-${placed.length}`, filled: true, fillPrice: p.price, filledSize: p.size };
        }),
        cancelOrder: vi.fn(async () => undefined),
        cancelAllOrders: vi.fn(async () => undefined),
        getOpenOrders: vi.fn(async () => []),
      } as unknown as OrderManager,
      eventBus: { emit: vi.fn() } as unknown as EventBus,
      gamma: {
        getTrending: vi.fn(async () => []),
        getEvents: vi.fn(async () => [event]),
        getMarket: vi.fn(async () => null),
      } as unknown as GammaClient,
      feeResolver: { resolve: vi.fn(async () => null) },
      bulletins: recordedBulletinSource(bulletins, () => BASE_NOW),
      arbitrationChecks: arbitrationChecksFromTable({ 'fed-cut': CHECK }),
      clockOffset: () => 10,
      clock: () => BASE_NOW,
      // p_post = 0.88, theta_safety = 0.03 => p_max = 0.85
      marketBlindEvaluator: async () => ({ receipt: sealed, pPost: 0.88, wSkill: 0.25, thetaSafety: 0.03 }),
    };

    const strategy = new PrimarySourceNewsLatencyStrategy(deps, {
      shadowMode: false,
      shadowMinDetections: 0,
      clusterCapitalPusd: 4_000,
    });
    await strategy.execute();

    // Only yes-1 (ask 0.65 <= 0.85) is swept, and its IOC limit price is capped at 0.85 instead of 0.97!
    expect(placed).toEqual([{ tokenId: 'yes-1', price: 0.85 }]);
  });

  it('suppresses Strategy 4 live orders when Market-Blind posterior is logging-only (wSkill=0) or receipt is forged', async () => {
    const market: GammaMarket = {
      id: 'm-1',
      question: 'Cut leg 1?',
      conditionId: 'c-1',
      slug: 'cut-1',
      outcomes: ['Yes', 'No'],
      outcomePrices: ['0.65', '0.35'],
      volume: 100_000,
      liquidity: 40_000,
      endDate: new Date(BASE_NOW + 3_600_000).toISOString(),
      active: true,
      closed: false,
      tokens: [],
      yesTokenId: 'yes-1',
      noTokenId: 'no-1',
      yesPrice: 0.65,
    };
    const event: GammaEvent = { id: 'evt-gate', title: 'Fed cut', slug: 'fed-cut', markets: [market] };
    const book: RawOrderBook = { bids: [{ price: '0.63', size: '500' }], asks: [{ price: '0.65', size: '500' }], timestamp: BASE_NOW };
    const bulletins: Bulletin[] = [{
      id: 'b-gate',
      title: 'FOMC lowers target range to 4.25 percent',
      body: 'Official statement',
      sourceHost: 'federalreserve.gov',
      publishedAtMs: BASE_NOW - 100,
    }];
    const sealed = commitMarketBlindForecast({
      modelVersionId: 'opus-5.5-mb-v1',
      stateVariant: 'blind-v1',
      questionId: 'evt-gate',
      category: 'macro',
      pRaw: 0.92,
      loggedAtMs: BASE_NOW - 400,
    });
    const placed: string[] = [];
    const baseDeps = (evaluator: PrimarySourceNewsLatencyDeps['marketBlindEvaluator']): PrimarySourceNewsLatencyDeps => ({
      clob: { getOrderBook: async () => book, getPrice: async () => 0.63, getMidPrice: async () => 0.64 } as unknown as ClobClient,
      orderManager: {
        placeOrder: async (p: { tokenId: string; price: string; size: string }) => {
          placed.push(p.tokenId);
          return { id: 'o1', filled: true, fillPrice: p.price, filledSize: p.size };
        },
        cancelOrder: async () => undefined,
        cancelAllOrders: async () => undefined,
        getOpenOrders: async () => [],
      } as unknown as OrderManager,
      eventBus: { emit: () => {} } as unknown as EventBus,
      gamma: { getTrending: async () => [], getEvents: async () => [event], getMarket: async () => null } as unknown as GammaClient,
      feeResolver: { resolve: async () => null },
      bulletins: recordedBulletinSource(bulletins, () => BASE_NOW),
      arbitrationChecks: arbitrationChecksFromTable({ 'fed-cut': CHECK }),
      clockOffset: () => 5,
      clock: () => BASE_NOW,
      marketBlindEvaluator: evaluator,
    });

    // 1. Logging-only (wSkill = 0): records shadow detection, places 0 live orders
    const loggingStrat = new PrimarySourceNewsLatencyStrategy(
      baseDeps(async () => ({ receipt: sealed, pPost: 0.90, wSkill: 0 })),
      { shadowMode: false, shadowMinDetections: 0, clusterCapitalPusd: 2_000 },
    );
    await loggingStrat.execute();
    expect(loggingStrat.book.shadowTally().detections).toBe(1);
    expect(placed).toHaveLength(0);

    // 2. Forged/unsealed receipt: rejected fail-closed before ladder build or order placement
    const forgedStrat = new PrimarySourceNewsLatencyStrategy(
      baseDeps(async () => ({ receipt: { ...sealed }, pPost: 0.90, wSkill: 0.3 })),
      { shadowMode: false, shadowMinDetections: 0, clusterCapitalPusd: 2_000 },
    );
    await forgedStrat.execute();
    expect(forgedStrat.book.shadowTally().detections).toBe(0);
    expect(placed).toHaveLength(0);
  });

  it('handles allowArbiterTiebreak alias, arbiter errors, and ledger resolution filtering', async () => {
    const bulletin: Bulletin = {
      id: 'b-err',
      title: 'FOMC lowers target range',
      body: 'No digits',
      sourceHost: 'federalreserve.gov',
      publishedAtMs: BASE_NOW - 50,
    };
    const throwingArbiterRes = await verifyBulletin(
      bulletin,
      CHECK,
      {
        term: () => ({ matches: true, confidence: 1, reason: 'ok' }),
        numeric: () => ({ matches: false, confidence: 0, reason: 'missing' }),
        arbiter: () => {
          throw new Error('arbiter timeout');
        },
      },
      { ...NEWS_DEFAULT_CONFIG, allowArbiterTiebreak: true },
      () => BASE_NOW,
    );
    expect(throwingArbiterRes.confirmed).toBe(false);
    expect(throwingArbiterRes.reason).toContain('arbiter error');

    const ledger = new MarketBlindProspectiveLedger();
    const r = ledger.commitForecast({
      modelVersionId: 'm1',
      stateVariant: 'v1',
      questionId: 'q1',
      category: 'geopolitics',
      pRaw: 0.6,
      loggedAtMs: BASE_NOW,
    });
    const sample = ledger.recordResolution({
      receipt: r,
      marketPriceAtCommit: 0.5,
      marketObservedAtMs: BASE_NOW + 10,
      outcome: 1,
      resolvedAtMs: BASE_NOW + 1_000,
    });
    expect(sample.outcome).toBe(1);
    expect(ledger.entries()).toHaveLength(1);
    expect(ledger.resolvedSamples('geopolitics')).toHaveLength(1);
    expect(ledger.resolvedSamples('crypto')).toHaveLength(0);
    expect(ledger.resolvedSamples()).toHaveLength(1);
    expect(evaluateCalibrationMetrics([]).resolvedCount).toBe(0);
  });

  it('validates boundary inputs across sanitizer, ledger, calibrators, posterior, and detector', async () => {
    // Circular metadata + mid-redaction slice safety + invalid config/cutoff guards
    const cyc: Record<string, unknown> = { tag: 'ok' };
    cyc['self'] = cyc;
    const strippedCyc = stripForbiddenMarketKeys([cyc]) as Array<Record<string, unknown>>;
    expect(strippedCyc[0]?.['self']).toBe('[CIRCULAR]');

    const midCut = sanitizeMarketBlindContext(
      { documents: [{ id: 'c1', title: '', content: 'Prefix text Polymarket 55%' }] },
      { maxDocumentChars: 20, maxTotalContextChars: 40 },
    );
    expect(midCut.documents[0]?.content.includes('[REDACTED_')).toBe(false);

    expect(() => sanitizeMarketBlindContext({ documents: [] }, { maxDocumentChars: 0 })).toThrow(/Character caps/);
    expect(() =>
      sanitizeMarketBlindContext({ documents: [], eventResolutionOrCutoffMs: 10 }, { modelKnowledgeCutoffMs: -5 }),
    ).toThrow(/modelKnowledgeCutoffMs/);
    expect(() =>
      sanitizeMarketBlindContext(
        { documents: [], eventResolutionOrCutoffMs: Number.NaN },
        { modelKnowledgeCutoffMs: 100 },
      ),
    ).toThrow(/eventResolutionOrCutoffMs/);

    // Ledger boundary validations & cross-ledger isolation
    expect(() =>
      commitMarketBlindForecast({
        modelVersionId: ' ',
        stateVariant: 'v1',
        questionId: 'q1',
        category: 'macro',
        pRaw: 0.5,
        loggedAtMs: BASE_NOW,
      }),
    ).toThrow(/modelVersionId/);
    expect(() =>
      commitMarketBlindForecast({
        modelVersionId: 'm1',
        stateVariant: 'v1',
        questionId: 'q1',
        category: 'macro',
        pRaw: 1.0,
        loggedAtMs: BASE_NOW,
      }),
    ).toThrow(/pRaw/);
    expect(() =>
      commitMarketBlindForecast({
        modelVersionId: 'm1',
        stateVariant: 'v1',
        questionId: 'q1',
        category: 'macro',
        pRaw: 0.5,
        loggedAtMs: 0,
      }),
    ).toThrow(/loggedAtMs/);

    const orphanReceipt = commitMarketBlindForecast({
      modelVersionId: 'm1',
      stateVariant: 'v1',
      questionId: 'q1',
      category: 'macro',
      pRaw: 0.5,
      loggedAtMs: BASE_NOW,
    });
    const otherLedger = new MarketBlindProspectiveLedger();
    await expect(otherLedger.readLiveMarketAfterCommit(orphanReceipt, () => 0.5)).rejects.toThrow(/not recorded/);
    expect(() =>
      otherLedger.recordResolution({
        receipt: orphanReceipt,
        marketPriceAtCommit: 0.5,
        marketObservedAtMs: BASE_NOW,
        outcome: 0,
        resolvedAtMs: BASE_NOW,
      }),
    ).toThrow(/not recorded/);

    const l2 = new MarketBlindProspectiveLedger();
    const r2 = l2.commitForecast({
      modelVersionId: 'm1',
      stateVariant: 'v1',
      questionId: 'q2',
      category: 'macro',
      pRaw: 0.5,
      loggedAtMs: BASE_NOW,
    });
    expect(() =>
      l2.recordResolution({
        receipt: r2,
        marketPriceAtCommit: 0.5,
        marketObservedAtMs: BASE_NOW + 10,
        outcome: 0,
        resolvedAtMs: BASE_NOW - 10,
      }),
    ).toThrow(/precedes forecast commit/);

    // Calibrator duplicate x-ties + invalid input guards
    const tiedIso = fitIsotonicCalibrator([
      { pRaw: 0.25, outcome: 0 },
      { pRaw: 0.25, outcome: 1 },
      { pRaw: 0.60, outcome: 1 },
    ]);
    expect(predictIsotonic(tiedIso, 0.25)).toBeCloseTo(0.5, 6);
    expect(() => fitIsotonicCalibrator([])).toThrow(/at least one sample/);
    expect(() => fitIsotonicCalibrator([{ pRaw: 1.5, outcome: 1 }])).toThrow(/Invalid calibration sample/);
    expect(() => calibrateLogitLinear(0.5, Number.NaN, 0)).toThrow(/finite/);
    expect(() => sigmoid(Number.NaN)).toThrow(/finite/);
    expect(() => logit(Number.POSITIVE_INFINITY)).toThrow(/finite/);
    expect(() => evaluateCalibrationMetrics([{ pCal: -0.1, pMarket: 0.5, outcome: 1 }])).toThrow(/Invalid OOS/);

    // Posterior boundary validations + post-only without bestBid
    expect(() =>
      computeShrunkPosterior({
        receipt: orphanReceipt,
        pCal: 0.8,
        marketPrice: 0.5,
        marketObservedAtMs: BASE_NOW - 1,
        metrics: passingMetrics(),
      }),
    ).toThrow(/precedes forecast commit/);
    expect(() =>
      computeShrunkPosterior({
        receipt: orphanReceipt,
        pCal: 0.8,
        marketPrice: 1.2,
        metrics: passingMetrics(),
      }),
    ).toThrow(/marketPrice/);
    expect(() =>
      computeShrunkPosterior({
        receipt: orphanReceipt,
        pCal: 0.8,
        marketPrice: 0.5,
        sigmaPost: -0.01,
        metrics: passingMetrics(),
      }),
    ).toThrow(/sigmaPost/);

    const noBidPostOnly = computeShrunkPosterior({
      receipt: orphanReceipt,
      pCal: 0.80,
      marketPrice: 0.50,
      askPrice: 0.56,
      sigmaPost: 0.01,
      takerFeePerShare: 0.002,
      metrics: passingMetrics({ bssOos: 0.10 }),
      notionalPusd: 2_000,
    });
    expect(noBidPostOnly.proposal?.limitPrice).toBeCloseTo(0.55, 6);

    // Detector malformed URL, userinfo/protocol-relative URL bypasses, forbidden-term veto before arbiter, and >800ms primary window
    const malformedUrlRes = await verifyBulletin(
      { id: 'b-u', title: 'FOMC', body: '4.25', sourceHost: 'federalreserve.gov', url: 'http://[invalid', publishedAtMs: BASE_NOW },
      CHECK,
      { term: () => ({ matches: true, confidence: 1, reason: 'ok' }), numeric: () => ({ matches: true, confidence: 1, reason: 'ok' }) },
      NEWS_DEFAULT_CONFIG,
      () => BASE_NOW,
    );
    expect(malformedUrlRes.reason).toBe('unwhitelisted-source-host');

    const userinfoBypassRes = await verifyBulletin(
      { id: 'b-ui', title: 'FOMC', body: '4.25', sourceHost: 'federalreserve.gov@attacker.tld', url: '//attacker.tld/release', publishedAtMs: BASE_NOW },
      CHECK,
      { term: () => ({ matches: true, confidence: 1, reason: 'ok' }), numeric: () => ({ matches: true, confidence: 1, reason: 'ok' }) },
      NEWS_DEFAULT_CONFIG,
      () => BASE_NOW,
    );
    expect(userinfoBypassRes.reason).toBe('unwhitelisted-source-host');

    const arbiterFn = vi.fn(() => ({ matches: true, confidence: 1, reason: 'arbiter-override' }));
    const vetoRes = await verifyBulletin(
      { id: 'b-veto', title: 'FOMC lowers target range to 4.25 rumor', body: '', sourceHost: 'federalreserve.gov', publishedAtMs: BASE_NOW },
      CHECK,
      { term: () => ({ matches: false, confidence: 0, reason: 'veto' }), numeric: () => ({ matches: true, confidence: 1, reason: '4.25' }), arbiter: arbiterFn },
      { ...NEWS_DEFAULT_CONFIG, requireArbiterOnSplit: true },
      () => BASE_NOW,
    );
    expect(vetoRes.confirmed).toBe(false);
    expect(vetoRes.reason).toContain('forbidden-term-veto');
    expect(arbiterFn).not.toHaveBeenCalled();

    // Ledger duplicate resolution & NaN timestamp rejection
    const dupLedger = new MarketBlindProspectiveLedger();
    const dupReceipt = dupLedger.commitForecast({
      modelVersionId: 'm1', stateVariant: 'v1', questionId: 'qd', category: 'macro', pRaw: 0.6, loggedAtMs: BASE_NOW,
    });
    expect(() =>
      dupLedger.recordResolution({ receipt: dupReceipt, marketPriceAtCommit: 0.5, marketObservedAtMs: Number.NaN, outcome: 1, resolvedAtMs: BASE_NOW + 10 }),
    ).toThrow(/finite timestamps/);
    dupLedger.recordResolution({ receipt: dupReceipt, marketPriceAtCommit: 0.5, marketObservedAtMs: BASE_NOW + 5, outcome: 1, resolvedAtMs: BASE_NOW + 10 });
    expect(() =>
      dupLedger.recordResolution({ receipt: dupReceipt, marketPriceAtCommit: 0.5, marketObservedAtMs: BASE_NOW + 5, outcome: 0, resolvedAtMs: BASE_NOW + 20 }),
    ).toThrow(/already recorded/);

    const streamErrRes = await verifyBulletin(
      { id: 'b-se', title: 'FOMC', body: '4.25', sourceHost: 'federalreserve.gov', publishedAtMs: BASE_NOW },
      CHECK,
      { term: () => { throw new Error('boom'); }, numeric: () => ({ matches: true, confidence: 1, reason: 'ok' }) },
      NEWS_DEFAULT_CONFIG,
      () => BASE_NOW,
    );
    expect(streamErrRes.confirmed).toBe(false);
    expect(streamErrRes.reason).toContain('stream error');

    let slowClock = BASE_NOW;
    const slowPrimaryRes = await verifyBulletin(
      { id: 'b-sp', title: 'FOMC', body: '4.25', sourceHost: 'federalreserve.gov', publishedAtMs: BASE_NOW },
      CHECK,
      {
        term: () => { slowClock += 900; return { matches: true, confidence: 1, reason: 'ok' }; },
        numeric: () => ({ matches: true, confidence: 1, reason: 'ok' }),
      },
      NEWS_DEFAULT_CONFIG,
      () => slowClock,
    );
    expect(slowPrimaryRes.confirmed).toBe(false);
    expect(slowPrimaryRes.reason).toContain('streams took 900 ms');
  });
});
