import { describe, expect, it, vi } from 'vitest';
import { ethers } from 'ethers';
import type { ClobClient, RawOrderBook } from '../../src/desk/polymarket/clob-client';
import type { EventBus } from '../../src/desk/events/event-bus';
import type { GammaClient, GammaEvent, GammaMarket } from '../../src/desk/polymarket/gamma-client';
import type { OrderManager } from '../../src/desk/polymarket/order-manager';
import { createPolyKillSwitch } from '../../src/desk/risk/poly-kill-switch';
import { GnosisCtfSettlementRelayer } from '../../src/desk/polymarket/gnosis-ctf-settlement-relayer';
import {
  POLY_1271_SIGNATURE_TYPE,
  POLYGON_CHAIN_ID,
  PUSD_COLLATERAL_ADDRESS,
  V1_CTF_EXCHANGE_ADDRESS,
  ZERO_BUILDER_CODE,
  buildClobV2TypedData,
  EngineRestartCooldown,
} from '../../src/desk/polymarket/clob-v2-order-surface';
import {
  FiveMinuteCryptoExclusionError,
  assertNotFiveMinuteCryptoMarket,
  isFiveMinuteCryptoMarket,
} from '../../src/desk/polymarket/five-minute-crypto-guard';
import {
  LiquidityRegimeMachine,
  createCancelMarketOrdersTransport,
} from '../../src/desk/polymarket/liquidity-regime-machine';
import { ClobV2HeartbeatService } from '../../src/desk/polymarket/clob-v2-heartbeat-service';
import { ClobV2OrderScoringClient } from '../../src/desk/polymarket/clob-v2-order-scoring-client';
import {
  CTF_ADAPTER_IFACE,
  CtfEthCallPreflight,
  NEGRISK_ADAPTER_IFACE,
  buildIndexSetFromSlots,
  executeRedemptionWithPreflight,
  toMarketBytes32,
  validateNegRiskIndexSet,
} from '../../src/desk/polymarket/ctf-eth-call-preflight';
import {
  Poly1271IsolationError,
  Poly1271SessionSigner,
} from '../../src/desk/polymarket/poly1271-session-signer';
import {
  ERC1155_APPROVAL_IFACE,
  ERC20_APPROVAL_IFACE,
  MAX_SAFE_BOUNDED_APPROVAL_PUSD,
  runPusdBoundedApproval,
} from '../../src/desk/polymarket/pusd-bounded-approval-runner';
import {
  formatApprovalPlanText,
  parsePolyApproveCliFlags,
  runPolyApproveCli,
} from '../../scripts/poly-approve-pusd';
import { ToxicityAwareMarketMakerStrategy } from '../../src/desk/strategies/polymarket/quant-alpha/toxicity-aware-market-maker';
import { NegRiskBundleArbitrageStrategy } from '../../src/desk/strategies/polymarket/quant-alpha/negrisk-bundle-arbitrage';
import { BacktestOrderManager } from '../../src/desk/backtesting/backtest-order-manager';

const EXCHANGE_V3 = '0xC5d563A36AE78145C45a50134d48A1215220f80a';
const DEPOSIT_WALLET = '0x2222222222222222222222222222222222222222';
const SESSION_KEY = `0x${'33'.repeat(32)}`;
const OWNER_KEY = `0x${'44'.repeat(32)}`;
const FUTURE_ISO = new Date(Date.now() + 7 * 86_400_000).toISOString();

function book(bid: number, ask: number, size = 500): RawOrderBook {
  return {
    bids: [{ price: bid.toFixed(2), size: String(size) }],
    asks: [{ price: ask.toFixed(2), size: String(size) }],
    timestamp: Date.now(),
  };
}

function makeGammaMarket(overrides: Partial<GammaMarket> = {}): GammaMarket {
  return {
    id: 'm-1',
    question: 'Will the central bank hold policy rates in Q4?',
    conditionId: 'cond-macro-1',
    slug: 'cb-hold-rates-q4',
    outcomes: ['Yes', 'No'],
    outcomePrices: ['0.48', '0.48'],
    volume: 200_000,
    liquidity: 50_000,
    endDate: FUTURE_ISO,
    active: true,
    closed: false,
    tokens: [],
    yesTokenId: 'yes-m1',
    noTokenId: 'no-m1',
    yesPrice: 0.48,
    ...overrides,
  };
}

function makeNegRiskEvent(overrides: Partial<GammaEvent> = {}): GammaEvent {
  return {
    id: 'evt-macro-4way',
    title: 'Exhaustive 4-way parliamentary election',
    slug: 'parliamentary-election-4way',
    markets: [1, 2, 3, 4].map((idx) =>
      makeGammaMarket({
        id: `m-${idx}`,
        conditionId: `cond-${idx}`,
        slug: `party-${idx}`,
        question: `Party ${idx} wins majority?`,
        groupItemTitle: `Party ${idx}`,
        negRisk: true,
        yesTokenId: `tok-${idx}`,
        noTokenId: `no-${idx}`,
        yesPrice: 0.22,
      }),
    ),
    ...overrides,
  };
}

describe('1. Hard 5-Minute Crypto & Short-Horizon Binary Contract Exclusion', () => {
  it('excludes 5m crypto slugs, 5-minute tickers, and 5-minute binary settlement contracts while allowing normal markets', () => {
    expect(isFiveMinuteCryptoMarket({ slug: 'btc-updown-5m-1700000000' })).toBe(true);
    expect(isFiveMinuteCryptoMarket({ question: 'Will Ethereum go up or down in the next 5 minutes?' })).toBe(true);
    expect(isFiveMinuteCryptoMarket({ title: 'SOL 5-minute price action', slug: 'sol-5m' })).toBe(true);
    expect(isFiveMinuteCryptoMarket({ question: 'XRP 5 min candle green?' })).toBe(true);
    expect(isFiveMinuteCryptoMarket({ question: 'DOGE 300s binary settlement' })).toBe(true);
    expect(isFiveMinuteCryptoMarket({ question: '5-minute binary contract on index' })).toBe(true);
    expect(isFiveMinuteCryptoMarket({ slug: 'plain-slug', durationSeconds: 300 })).toBe(true);
    expect(
      isFiveMinuteCryptoMarket({
        slug: 'multi-market-series',
        markets: [{ slug: 'eth-updown-5m' }],
      }),
    ).toBe(true);

    // Must never false-positive on normal markets, candidate #5, or long-dated crypto
    expect(isFiveMinuteCryptoMarket({ slug: 'm-5', question: 'Candidate 5 wins?' })).toBe(false);
    expect(isFiveMinuteCryptoMarket({ slug: 'btc-150k-2026', question: 'Will Bitcoin hit $150,000 in 2026?' })).toBe(false);
    expect(isFiveMinuteCryptoMarket(makeGammaMarket())).toBe(false);

    expect(() => assertNotFiveMinuteCryptoMarket({ slug: 'btc-updown-5m' })).toThrow(
      FiveMinuteCryptoExclusionError,
    );
  });

  it('blocks 5-minute contracts in both ToxicityAwareMarketMakerStrategy and NegRiskBundleArbitrageStrategy', async () => {
    const getOrderBook = vi.fn(async () => book(0.48, 0.52));
    const placeOrder = vi.fn(async () => ({ id: 'ord-1', filled: true }));
    const clob = { getOrderBook, getPrice: async () => 0.48, getMidPrice: async () => 0.5 } as unknown as ClobClient;
    const orderManager = {
      placeOrder,
      cancelOrder: async () => undefined,
      cancelAllOrders: async () => undefined,
      getOpenOrders: async () => [],
    } as unknown as OrderManager;
    const eventBus = { emit: vi.fn() } as unknown as EventBus;

    const fiveMinMarket = makeGammaMarket({ slug: 'btc-updown-5m', question: 'BTC 5m up or down?' });
    const fiveMinEvent = makeNegRiskEvent({
      slug: 'crypto-5m-bundle',
      title: 'SOL 5-minute multi-bucket',
    });

    const gamma: GammaClient = {
      getMarkets: async () => [fiveMinMarket],
      getMarket: async () => fiveMinMarket,
      getMarketGroup: async () => null,
      searchMarkets: async () => [fiveMinMarket],
      getTrending: async () => [fiveMinMarket],
      getEvents: async () => [fiveMinEvent],
    };

    const mm = new ToxicityAwareMarketMakerStrategy({ clob, gamma, orderManager, eventBus });
    await mm.execute();
    expect(placeOrder).not.toHaveBeenCalled();
    expect(getOrderBook).not.toHaveBeenCalled();
    expect(mm.getRegimeTelemetry().excludedFiveMinuteMarkets).toBe(1);

    const nr = new NegRiskBundleArbitrageStrategy(
      { clob, gamma, orderManager, eventBus },
      { legNotionalPusd: 1_500 },
    );
    await nr.execute();
    expect(placeOrder).not.toHaveBeenCalled();
    expect(nr.getPreflightTelemetry().excludedFiveMinuteEvents).toBe(1);
  });
});

describe('2. Strategy 7 — 5-State Liquidity Regime Machine & Strategy 3 Wiring', () => {
  it('enforces priority hierarchy HALTED > REDUCE_ONLY > EVENT > TRENDING > QUIET and 5-min halt lock', () => {
    const machine = new LiquidityRegimeMachine();
    const t0 = 1_000_000;

    // Calm -> QUIET
    const quiet = machine.evaluate({ marketId: 'm1', nowMs: t0 });
    expect(quiet.state).toBe('QUIET');
    expect(quiet.sizeMultiplier).toBe(1.0);
    expect(quiet.spreadMultiplier).toBe(1.0);
    expect(quiet.optimizeIncentiveSpread).toBe(true);

    // TRENDING triggers (VPIN > 0.65, fills/min > 3, lambda > 2x baseline)
    const trending = machine.evaluate({
      marketId: 'm1',
      nowMs: t0 + 1_000,
      vpin: 0.72,
      kyleLambda: 0.05,
      baselineKyleLambda: 0.02,
    });
    expect(trending.state).toBe('TRENDING');
    expect(trending.sizeMultiplier).toBe(0.5);
    expect(trending.spreadMultiplier).toBe(2.0);

    // REDUCE_ONLY overrides TRENDING (<= 2h allows close/merge; <= 30m withdraws all quotes)
    const reduceCloseOnly = machine.evaluate({
      marketId: 'm1',
      nowMs: t0 + 2_000,
      vpin: 0.8,
      timeToExpiryMs: 90 * 60_000,
    });
    expect(reduceCloseOnly.state).toBe('REDUCE_ONLY');
    expect(reduceCloseOnly.allowNewQuotes).toBe(false);
    expect(reduceCloseOnly.allowCloseOrMergeOnly).toBe(true);
    expect(reduceCloseOnly.withdrawAllQuotes).toBe(false);

    const reduceFullWithdraw = machine.evaluate({
      marketId: 'm1',
      nowMs: t0 + 3_000,
      timeToExpiryMs: 20 * 60_000,
    });
    expect(reduceFullWithdraw.state).toBe('REDUCE_ONLY');
    expect(reduceFullWithdraw.allowCloseOrMergeOnly).toBe(false);
    expect(reduceFullWithdraw.withdrawAllQuotes).toBe(true);

    // HALTED overrides everything and latches for 300,000 ms (5 minutes)
    const halted = machine.evaluate({
      marketId: 'm1',
      nowMs: t0 + 10_000,
      wsLagMs: 1_800,
      http425Active: true,
      ghostFillDetected: true,
      dailyLossPusd: 200,
      cancelAckP99Ms: 1_250,
    });
    expect(halted.state).toBe('HALTED');
    expect(halted.haltedUntilMs).toBe(t0 + 10_000 + 300_000);

    // Still locked in HALTED 4 minutes later even with calm inputs
    const stillHalted = machine.evaluate({ marketId: 'm1', nowMs: t0 + 250_000 });
    expect(stillHalted.state).toBe('HALTED');
    expect(stillHalted.reasons).toEqual(['halt-lock-active']);

    // Unlocks at t0 + 310_000
    const unlocked = machine.evaluate({ marketId: 'm1', nowMs: t0 + 310_000 });
    expect(unlocked.state).toBe('QUIET');

    // Rolling 1-minute API error count > 10 triggers HALTED
    for (let i = 0; i < 11; i++) machine.recordApiError(t0 + 400_000 + i * 100);
    expect(machine.evaluate({ marketId: 'm2', nowMs: t0 + 402_000 }).state).toBe('HALTED');
  });

  it('enforces EVENT hysteresis cooling-off (EVENT -> TRENDING -> QUIET) and DELETE /cancel-market-orders seam', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ canceled: ['ord-a', 'ord-b'] }), { status: 200 }));
    const cancelTransport = createCancelMarketOrdersTransport({
      host: 'https://clob.polymarket.com',
      fetchImpl: fetchMock as unknown as typeof fetch,
      headers: { 'X-Poly-Test': '1' },
    });
    const machine = new LiquidityRegimeMachine({
      config: { eventCooldownMs: 120_000 },
      cancelMarketOrders: cancelTransport,
    });

    const t0 = 5_000_000;
    const ev = await machine.evaluateAndEnforce({
      marketId: 'cond-ev',
      nowMs: t0,
      priceJump10sTicks: 4,
    });
    expect(ev.state).toBe('EVENT');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 60s later (< 120s cooldown): calm input stays EVENT
    const midCooldown = machine.evaluate({ marketId: 'cond-ev', nowMs: t0 + 60_000 });
    expect(midCooldown.state).toBe('EVENT');
    expect(midCooldown.reasons).toEqual(['event-hysteresis-cooldown']);

    // At 120s cooldown completion: steps down EVENT -> TRENDING (never jumps straight to QUIET)
    const stepDown = machine.evaluate({ marketId: 'cond-ev', nowMs: t0 + 120_000 });
    expect(stepDown.state).toBe('TRENDING');
    expect(stepDown.reasons).toEqual(['event-stepdown-to-trending']);
    expect(stepDown.sizeMultiplier).toBe(0.5);
    expect(stepDown.spreadMultiplier).toBe(2.0);

    // Next calm observation completes TRENDING -> QUIET
    const calmAgain = machine.evaluate({ marketId: 'cond-ev', nowMs: t0 + 125_000 });
    expect(calmAgain.state).toBe('QUIET');
  });

  it('scales Strategy 3 notional 0.5x & widens spread 2x in TRENDING, cancels in EVENT, and runs merge preflight >= 20 pUSD', async () => {
    const placed: Array<{ tokenId: string; price: number; size: number }> = [];
    const cancelAllOrders = vi.fn(async () => undefined);
    const onMergePair = vi.fn(async () => ({ merged: true }));
    const rpcCall = vi.fn(async () => '0x');
    const ctfPreflight = new CtfEthCallPreflight({ rpcCall });

    const m1 = makeGammaMarket({ id: 'm-trend', conditionId: 'cond-trend', yesTokenId: 'yes-t', noTokenId: 'no-t' });
    const books: Record<string, RawOrderBook> = {
      'yes-t': book(0.48, 0.52, 500),
      'no-t': book(0.48, 0.52, 500),
    };
    const deps = {
      clob: {
        getOrderBook: async (id: string) => books[id] ?? book(0.48, 0.52),
        getPrice: async () => 0.48,
        getMidPrice: async () => 0.5,
      } as unknown as ClobClient,
      gamma: {
        getTrending: async () => [m1],
      } as unknown as GammaClient,
      orderManager: {
        placeOrder: async (p: { tokenId: string; price: string; size: string }) => {
          placed.push({ tokenId: p.tokenId, price: parseFloat(p.price), size: parseFloat(p.size) });
          return { id: `o-${placed.length}`, filled: true };
        },
        cancelOrder: async () => undefined,
        cancelAllOrders,
        getOpenOrders: async () => [],
      } as unknown as OrderManager,
      eventBus: { emit: vi.fn() } as unknown as EventBus,
      ctfPreflight,
      onMergePair,
    };

    const mm = new ToxicityAwareMarketMakerStrategy(deps, {
      legNotionalPusd: 40, // in TRENDING -> 0.5x = 20 pUSD per leg (~43 shares at 0.46 >= 20 pUSD merge threshold!)
      skuCapShares: 200,
      cooldownMs: 0,
    });

    // Push TRENDING observation: VPIN = 0.72 > 0.65
    mm.updateRegimeObservation('cond-trend', { vpin: 0.72 });
    await mm.execute();

    // Base touch bid = 0.48, mid = 0.50 -> base half-spread = 0.02 -> 2x half-spread = 0.04 -> bid = 0.46!
    // Scaled notional = 0.5 * 40 = 20 pUSD -> floor(20 / 0.46) = 43 shares (vs floor(40 / 0.48) = 83 in QUIET)
    expect(placed).toHaveLength(2);
    expect(placed[0]).toEqual({ tokenId: 'yes-t', price: 0.46, size: 43 });
    expect(placed[1]).toEqual({ tokenId: 'no-t', price: 0.46, size: 43 });

    // Matched 43 YES + 43 NO shares >= 20 pUSD triggered eth_call mergePositions preflight + onMergePair!
    expect(rpcCall).toHaveBeenCalledTimes(1);
    expect(onMergePair).toHaveBeenCalledWith(
      expect.objectContaining({
        conditionId: 'cond-trend',
        matchedShares: 43,
        mergeableCollateralPusd: 43,
        mergeEligible: true,
      }),
    );
    expect(mm.getPositionCount()).toBe(0);

    // Push EVENT observation: cancels resting token orders and places zero new legs
    placed.length = 0;
    mm.updateRegimeObservation('cond-trend', { vpin: 0.2, inScheduledCatalystWindow: true });
    await mm.execute();
    expect(placed).toHaveLength(0);
    expect(cancelAllOrders).toHaveBeenCalledWith('yes-t');
    expect(cancelAllOrders).toHaveBeenCalledWith('no-t');
    expect(mm.getRegimeTelemetry().regime.markets['cond-trend']?.state).toBe('EVENT');

    // Even when an open position already exists (`hasPosition === true`), a sudden HALTED
    // observation still cancels resting quotes immediately before skipping new entries!
    cancelAllOrders.mockClear();
    const mOpen = makeGammaMarket({ id: 'm-open', conditionId: 'cond-open', yesTokenId: 'yes-o', noTokenId: 'no-o' });
    const mmOpen = new ToxicityAwareMarketMakerStrategy(
      {
        ...deps,
        gamma: { getTrending: async () => [mOpen] } as unknown as GammaClient,
        onMergePair: undefined, // keep open positions unmerged after 1st pass
      },
      { legNotionalPusd: 20, cooldownMs: 0 },
    );
    await mmOpen.execute();
    expect(mmOpen.getPositionCount()).toBe(2);
    mmOpen.updateRegimeObservation('cond-open', { ghostFillDetected: true });
    await mmOpen.execute();
    expect(cancelAllOrders).toHaveBeenCalledWith('yes-o');
    expect(cancelAllOrders).toHaveBeenCalledWith('no-o');
    expect(mmOpen.getRegimeTelemetry().regime.markets['cond-open']?.state).toBe('HALTED');
  });
});

describe('3. CLOB V2 Heartbeat Loop, Order-Scoring Client & HTTP 425 Post-Only Cooldown', () => {
  it('tracks heartbeat ACKs/latency and fires killSwitch on >= 2 consecutive missed heartbeats', async () => {
    let now = 10_000;
    const cancelAll = vi.fn(async () => ({ ok: true, status: 200, body: 'ok' }));
    const killSwitch = createPolyKillSwitch({ cancelAll, now: () => now });
    const cooldown = new EngineRestartCooldown();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ heartbeat_id: 'hb-101' }), { status: 200 }))
      .mockResolvedValueOnce(new Response('engine restarting', { status: 425 }))
      .mockRejectedValueOnce(new Error('socket hang up'));

    const hb = new ClobV2HeartbeatService({
      fetchImpl: fetchMock as unknown as typeof fetch,
      killSwitch,
      engineCooldown: cooldown,
      nowMs: () => {
        now += 12;
        return now;
      },
    });

    hb.start();
    expect(hb.getTelemetry().running).toBe(true);
    hb.stop();
    expect(hb.getTelemetry().running).toBe(false);

    const first = await hb.beatOnce();
    expect(first.ok).toBe(true);
    expect(first.heartbeatId).toBe('hb-101');
    expect(killSwitch.isFired()).toBe(false);

    // First miss (HTTP 425) -> notes engine restart cooldown, consecutiveMisses = 1 (no kill yet)
    const miss1 = await hb.beatOnce();
    expect(miss1.ok).toBe(false);
    expect(miss1.consecutiveMisses).toBe(1);
    expect(cooldown.requiresPostOnly(now)).toBe(true);
    expect(killSwitch.isFired()).toBe(false);

    // Second consecutive miss (~10s deadman) -> fires killSwitch('heartbeat-deadman-missed')
    const miss2 = await hb.beatOnce();
    expect(miss2.ok).toBe(false);
    expect(miss2.consecutiveMisses).toBe(2);
    expect(miss2.deadmanTriggered).toBe(true);
    expect(killSwitch.isFired()).toBe(true);
    expect(killSwitch.getAudit()[0]?.reason).toBe('heartbeat-deadman-missed');
  });

  it('verifies GET /order-scoring, batch POST /orders-scoring, and enforces 120s HTTP 425 post-only mode', async () => {
    let now = 50_000;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ scoring: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ 'ord-1': true, 'ord-2': false }), { status: 200 }))
      .mockResolvedValueOnce(new Response('restarting', { status: 425 }));

    const client = new ClobV2OrderScoringClient({
      fetchImpl: fetchMock as unknown as typeof fetch,
      nowMs: () => now,
    });

    const single = await client.checkOrderScoring('ord-1');
    expect(single.ok).toBe(true);
    expect(single.scoring).toBe(true);

    const batch = await client.checkOrdersScoringBatch(['ord-1', 'ord-2']);
    expect(batch.ok).toBe(true);
    expect(batch.scores).toEqual({ 'ord-1': true, 'ord-2': false });

    // HTTP 425 locks cooldown for 120,000 ms (2 minutes)
    const restartRes = await client.checkOrderScoring('ord-3');
    expect(restartRes.ok).toBe(false);
    expect(restartRes.engineRestarting).toBe(true);
    expect(restartRes.postOnlyRemainingMs).toBe(120_000);

    // Non-post-only order is rejected during the 2-minute window, post-only GTC is accepted
    const nonPostOnly = client.gateOrder(
      { tokenId: '101', side: 'BUY', price: 0.48, size: 10, orderType: 'GTC', tickSize: 0.01, postOnly: false },
      now + 60_000,
    );
    expect(nonPostOnly.ok).toBe(false);
    if (!nonPostOnly.ok) expect(nonPostOnly.code).toBe('post-only-required-while-engine-restarting');

    const postOnlyOk = client.gateOrder(
      { tokenId: '101', side: 'BUY', price: 0.48, size: 10, orderType: 'GTC', tickSize: 0.01, postOnly: true },
      now + 60_000,
    );
    expect(postOnlyOk.ok).toBe(true);

    // After 120,000 ms, non-post-only is allowed again
    const afterWindow = client.gateOrder(
      { tokenId: '101', side: 'BUY', price: 0.48, size: 10, orderType: 'GTC', tickSize: 0.01, postOnly: false },
      now + 120_001,
    );
    expect(afterWindow.ok).toBe(true);
  });
});

describe('4. Strategy 2 eth_call Preflight, Poly1271 Session Key Signer & pUSD Dry-Run CLI', () => {
  it('validates _indexSet bitmasks, encodes CTF/NegRisk ABI calldata, and gates Strategy 2 bundle conversion', async () => {
    expect(buildIndexSetFromSlots([0, 2], 4)).toBe(0b0101n);
    expect(validateNegRiskIndexSet(0n, 4).ok).toBe(false);
    expect(validateNegRiskIndexSet(16n, 4).ok).toBe(false);
    expect(validateNegRiskIndexSet(0b0101n, 4, [0, 1]).ok).toBe(false);
    expect(validateNegRiskIndexSet(0b1111n, 4, [0, 1, 2, 3]).ok).toBe(true);

    const calls: Array<{ to: string; data: string }> = [];
    let shouldRevert = false;
    const preflight = new CtfEthCallPreflight({
      fromAddress: DEPOSIT_WALLET,
      rpcCall: async (tx) => {
        calls.push({ to: tx.to, data: tx.data });
        if (shouldRevert) return '0x08c379a000000000000000000000000000000000000000000000000000000000';
        return '0x';
      },
    });

    const marketId = toMarketBytes32('evt-macro-4way');
    const okConv = await preflight.simulateConvertPositions({
      marketId,
      indexSet: 0b1111n,
      amountRaw: 120_000_000n,
      outcomeCount: 4,
      heldNoSlots: [0, 1, 2, 3],
    });
    expect(okConv.ok).toBe(true);
    const decodedConv = NEGRISK_ADAPTER_IFACE.decodeFunctionData('convertPositions', okConv.calldata);
    expect(decodedConv[0]).toBe(marketId);
    expect(decodedConv[1]).toBe(15n);
    expect(decodedConv[2]).toBe(120_000_000n);

    const okMerge = await preflight.simulateMergeOrSplit({
      op: 'mergePositions',
      conditionId: toMarketBytes32('cond-1'),
      amountRaw: 25_000_000n,
    });
    expect(okMerge.ok).toBe(true);
    expect(CTF_ADAPTER_IFACE.decodeFunctionData('mergePositions', okMerge.calldata)[4]).toBe(25_000_000n);

    // GnosisCtfSettlementRelayer redemption preflight helper
    const relayer = new GnosisCtfSettlementRelayer(DEPOSIT_WALLET);
    relayer.registerCondition({
      conditionId: 'cond-redeem-1',
      questionId: 'q-1',
      outcomeSlotCount: 2,
      payoutNumerators: [1, 0],
      payoutDenominator: 1,
      isResolved: true,
    });
    const redeemed = await executeRedemptionWithPreflight(relayer, preflight, {
      conditionId: 'cond-redeem-1',
      tokenId: 'tok-yes',
      indexSet: 1,
      shares: 50,
    });
    expect(redeemed.preflight.ok).toBe(true);
    expect(redeemed.redemption?.collateralAmountReceivedUsd).toBe(50);

    // Wire into NegRiskBundleArbitrageStrategy: passes when eth_call succeeds, blocks conversion on revert!
    const event = makeNegRiskEvent();
    const books: Record<string, RawOrderBook> = {
      'tok-1': book(0.20, 0.22, 400),
      'tok-2': book(0.20, 0.22, 400),
      'tok-3': book(0.20, 0.22, 400),
      'tok-4': book(0.20, 0.22, 400),
    };
    const makeStrategy = () => {
      const om = new BacktestOrderManager(10_000, {
        feeResolver: { resolve: async () => ({ exponent: 1, rate: 0.04, takerOnly: true, rebateRate: 0.25 }) },
      });
      const strat = new NegRiskBundleArbitrageStrategy(
        {
          clob: {
            getOrderBook: async (id: string) => books[id] ?? book(0.2, 0.22, 400),
            getPrice: async () => 0.22,
            getMidPrice: async () => 0.21,
          } as unknown as ClobClient,
          gamma: {
            getTrending: async () => [],
            getEvents: async () => [event],
          } as unknown as GammaClient,
          orderManager: om,
          eventBus: { emit: vi.fn() } as unknown as EventBus,
          feeResolver: { resolve: async () => ({ exponent: 1, rate: 0.04, takerOnly: true, rebateRate: 0.25 }) },
          ctfPreflight: preflight,
        },
        { legNotionalPusd: 1_500 },
      );
      return { strat, om };
    };

    const passRun = makeStrategy();
    await passRun.strat.execute();
    expect(passRun.strat.getPreflightTelemetry().preflightPassed).toBe(1);
    expect(passRun.strat.getBasketTelemetry().complete).toBe(1);
    expect(passRun.om.getCurrentEquity()).toBeGreaterThan(10_000);

    shouldRevert = true;
    const blockRun = makeStrategy();
    await blockRun.strat.execute();
    expect(blockRun.strat.getPreflightTelemetry().preflightBlocked).toBe(1);
    expect(blockRun.strat.getBasketTelemetry().complete).toBe(0);
    // Unconverted legs stay tracked as open positions rather than booking a phantom conversion
    expect(blockRun.strat.getPositionCount()).toBe(4);
  });

  it('enforces strict Poly1271 Deposit Wallet vs Session Key isolation and signs ExchangeV3 orders', async () => {
    expect(
      () =>
        new Poly1271SessionSigner({
          depositWalletAddress: DEPOSIT_WALLET,
          verifyingContract: EXCHANGE_V3,
          sessionPrivateKey: SESSION_KEY,
          ownerMasterPrivateKey: OWNER_KEY,
        }),
    ).toThrowError(Poly1271IsolationError);

    try {
      new Poly1271SessionSigner({
        depositWalletAddress: DEPOSIT_WALLET,
        verifyingContract: EXCHANGE_V3,
        sessionPrivateKey: SESSION_KEY,
        runtimeEnv: { POLY_OWNER_MASTER_PRIVATE_KEY: OWNER_KEY },
      });
      expect.unreachable('should have thrown MASTER_KEY_FORBIDDEN_IN_RUNTIME');
    } catch (err) {
      expect(err).toBeInstanceOf(Poly1271IsolationError);
      expect((err as Poly1271IsolationError).code).toBe('MASTER_KEY_FORBIDDEN_IN_RUNTIME');
    }

    // Rejects retired V1 CTF Exchange and identical Deposit Wallet / Session Key
    const sessionWallet = new ethers.Wallet(SESSION_KEY);
    expect(
      () =>
        new Poly1271SessionSigner({
          depositWalletAddress: sessionWallet.address,
          verifyingContract: EXCHANGE_V3,
          sessionPrivateKey: SESSION_KEY,
        }),
    ).toThrow(/SESSION_KEY_EQUALS_DEPOSIT_WALLET/);

    expect(
      () =>
        new Poly1271SessionSigner({
          depositWalletAddress: DEPOSIT_WALLET,
          verifyingContract: V1_CTF_EXCHANGE_ADDRESS,
          sessionPrivateKey: SESSION_KEY,
        }),
    ).toThrow(/INVALID_EXCHANGE_V3_CONTRACT/);

    const signer = new Poly1271SessionSigner({
      depositWalletAddress: DEPOSIT_WALLET,
      verifyingContract: EXCHANGE_V3,
      sessionPrivateKey: SESSION_KEY,
    });
    const intent = {
      tokenId: '9988776655',
      side: 'BUY' as const,
      price: 0.48,
      size: 25,
      orderType: 'GTC' as const,
      tickSize: 0.01,
      postOnly: true,
    };
    const signed = await signer.signOrder(intent);
    expect(signed.maker).toBe(ethers.getAddress(DEPOSIT_WALLET));
    expect(signed.signer).toBe(sessionWallet.address);
    expect(signed.signatureType).toBe(POLY_1271_SIGNATURE_TYPE);
    expect(signed.collateralToken).toBe(PUSD_COLLATERAL_ADDRESS);
    expect(signed.chainId).toBe(POLYGON_CHAIN_ID);
    expect(signed.order.builderCode).toBe(ZERO_BUILDER_CODE);

    const typed = buildClobV2TypedData(signed.order, {
      verifyingContract: EXCHANGE_V3,
      chainId: POLYGON_CHAIN_ID,
      signatureType: POLY_1271_SIGNATURE_TYPE,
    });
    const recovered = ethers.verifyTypedData(
      typed.domain,
      { Order: typed.types.Order },
      typed.message,
      signed.signature,
    );
    expect(recovered).toBe(sessionWallet.address);
  });

  it('generates bounded pUSD ERC-20 & PositionManager ERC-1155 calldata in --dry-run without private keys', async () => {
    const flags = parsePolyApproveCliFlags(['--amount-pusd', '2500', '--exchange', EXCHANGE_V3], {});
    expect(flags.dryRun).toBe(true);
    expect(flags.broadcast).toBe(false);
    expect(flags.amountPusd).toBe(2_500);

    const plan = await runPolyApproveCli(['--dry-run', '--amount-pusd', '2500', '--exchange', EXCHANGE_V3], {});
    expect(plan.mode).toBe('dry-run');
    expect(plan.chainId).toBe(137);
    expect(plan.collateralToken).toBe(PUSD_COLLATERAL_ADDRESS);
    expect(plan.boundedAmountRaw).toBe('2500000000');
    expect(plan.transactions).toHaveLength(4);
    expect(plan.broadcastReceipts).toHaveLength(0);

    const decodedApprove = ERC20_APPROVAL_IFACE.decodeFunctionData('approve', plan.transactions[0]!.data);
    expect(decodedApprove[0]).toBe(ethers.getAddress(EXCHANGE_V3));
    expect(decodedApprove[1]).toBe(2_500_000_000n);

    const decoded1155 = ERC1155_APPROVAL_IFACE.decodeFunctionData('setApprovalForAll', plan.transactions[2]!.data);
    expect(decoded1155[0]).toBe(ethers.getAddress(EXCHANGE_V3));
    expect(decoded1155[1]).toBe(true);

    const formatted = formatApprovalPlanText(plan);
    expect(formatted).toContain(PUSD_COLLATERAL_ADDRESS);
    expect(formatted).toContain('mode=dry-run');

    // Rejects unbounded/invalid amounts and missing credentials on --broadcast
    await expect(
      runPusdBoundedApproval({ amountPusd: MAX_SAFE_BOUNDED_APPROVAL_PUSD + 1, exchangeV3Address: EXCHANGE_V3 }),
    ).rejects.toThrow(/unlimited approvals forbidden/);

    await expect(
      runPusdBoundedApproval({ amountPusd: 1_000, exchangeV3Address: EXCHANGE_V3, broadcast: true }),
    ).rejects.toThrow(/Broadcast mode requires explicit rpcUrl and ownerPrivateKey/);

    const mockedBroadcast = await runPusdBoundedApproval({
      amountPusd: 1_000,
      exchangeV3Address: EXCHANGE_V3,
      broadcast: true,
      broadcastTx: async (tx) => ({ txHash: `0x${String(tx.step).padStart(64, '0')}` }),
    });
    expect(mockedBroadcast.mode).toBe('broadcast');
    expect(mockedBroadcast.broadcastReceipts).toHaveLength(4);

    // Rejects --broadcast without explicit --exchange / POLY_EXCHANGE_V3_ADDRESS and unknown flags
    expect(() => parsePolyApproveCliFlags(['--broadcast'], {})).toThrow(/requires explicit --exchange/);
    expect(() => parsePolyApproveCliFlags(['--unknown-flag'], {})).toThrow(/Unknown or unsupported/);

    // Custom 4-byte Solidity error selector on void CTF eth_call fails closed
    const customErrPreflight = new CtfEthCallPreflight({
      rpcCall: async () => '0xdeadbeef',
    });
    const customErrRes = await customErrPreflight.simulateMergePositions({
      conditionId: toMarketBytes32('cond-custom-err'),
      amountRaw: 10_000_000n,
    });
    expect(customErrRes.ok).toBe(false);
    expect(customErrRes.reason).toBe('eth-call-reverted');
  });
});
