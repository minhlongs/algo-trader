import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ethers } from 'ethers';
import { createPolyKillSwitch } from '../../src/desk/risk/poly-kill-switch';
import { ClobV2HeartbeatService } from '../../src/desk/polymarket/clob-v2-heartbeat-service';
import { ClobV2OrderScoringClient } from '../../src/desk/polymarket/clob-v2-order-scoring-client';
import { CtfEthCallPreflight, toMarketBytes32 } from '../../src/desk/polymarket/ctf-eth-call-preflight';
import { Poly1271IsolationError, Poly1271SessionSigner } from '../../src/desk/polymarket/poly1271-session-signer';
import { buildPusdBoundedApprovalPlan, runPusdBoundedApproval } from '../../src/desk/polymarket/pusd-bounded-approval-runner';
import { startGhostGuardWebhookServer } from '../../src/desk/polymarket/ghost-guard-webhook-bridge';
import { startGhostGuardDrillRpcServer, verifyFillAgainstJsonRpc } from '../../src/desk/polymarket/ghost-guard-drill-rpc';
import { readPolyBookWalDirectory, replayPolyBookWalRecords } from '../../src/desk/polymarket/l2/poly-book-wal-bridge';
import { encodePolyBookWalRecord } from '../../src/desk/polymarket/l2/poly-book-wal-codec';
import { PolyBookWalCorruptionError, encodePolyBookWalFrame, scanPolyBookWalFrames } from '../../src/desk/polymarket/l2/poly-book-wal-crc32c';
import { settleOrRecordBundle } from '../../src/desk/strategies/polymarket/quant-alpha/negrisk-bundle-arbitrage-settlement';
import { BundleBook } from '../../src/desk/strategies/polymarket/quant-alpha/negrisk-bundle-arbitrage-state';
import { DEFAULT_CONFIG as NEGRISK_CFG } from '../../src/desk/strategies/polymarket/quant-alpha/negrisk-bundle-arbitrage-types';
import { V1_CTF_EXCHANGE_ADDRESS, PUSD_COLLATERAL_ADDRESS } from '../../src/desk/polymarket/clob-v2-venue-constants';
import { LiquidityRegimeMachine } from '../../src/desk/polymarket/liquidity-regime-machine';
import { classifyFiveMinuteExclusion } from '../../src/desk/polymarket/five-minute-crypto-guard';
import { decodePolyBookWalRecord } from '../../src/desk/polymarket/l2/poly-book-wal-codec';
import { PolyLockupKellyAllocator } from '../../src/desk/portfolio/poly-lockup-kelly-allocator';
import { fetchGitHubWatchlistStates } from '../../src/desk/governance/poly-repo-watchlist-monitor';
import { createNegRiskBundleArbitrageTick, NegRiskBundleArbitrageStrategy } from '../../src/desk/strategies/polymarket/quant-alpha/negrisk-bundle-arbitrage';
import { createToxicityAwareMarketMakerTick, ToxicityAwareMarketMakerStrategy } from '../../src/desk/strategies/polymarket/quant-alpha/toxicity-aware-market-maker';
import { createPrimarySourceNewsLatencyTick, PrimarySourceNewsLatencyStrategy, arbitrationChecksFromTable, recordedBulletinSource } from '../../src/desk/strategies/polymarket/quant-alpha/primary-source-news-latency';
import { bulletinFromNewsItem, noArbitrationChecks, numericStream, termStream, unknownClockOffset } from '../../src/desk/strategies/polymarket/quant-alpha/primary-source-news-latency-sources';
import { commitMarketBlindForecast } from '../../src/desk/polymarket/market-blind/market-blind-prospective-ledger';
import { sanitizeMarketBlindContext } from '../../src/desk/polymarket/market-blind/market-blind-sanitizer';
import WebSocket, { WebSocketServer } from 'ws';
import { OrderBookStream } from '../../src/desk/polymarket/orderbook-stream';
import {
  buildChunkedSubscribePayloads,
  buildSubscribePayload,
  chunkAssetIdsForWsSubscribe,
  mergeAndBuildPricePayload,
  parseWsMessage,
  resolveAuthoritativeTickSizeMicro,
} from '../../src/desk/polymarket/orderbook-stream-parse';
import { handleDisconnect, scheduleReconnect } from '../../src/desk/polymarket/orderbook-stream-reconnect';
import { setupWebSocketHandlers } from '../../src/desk/polymarket/orderbook-stream-ws';

const EXCH_V3 = '0xC5d563A36AE78145C45a50134d48A1215220f80a';
const DEPOSIT = '0x2222222222222222222222222222222222222222';
const SESS_KEY = `0x${'33'.repeat(32)}`;

describe('Polymarket vNext Deep Branch & Edge-Case Coverage', () => {
  const dirs: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    while (dirs.length > 0) {
      const d = dirs.pop();
      if (d) rmSync(d, { recursive: true, force: true });
    }
  });

  it('covers ClobV2OrderScoringClient error/malformed/batch/425/submit branches and ClobV2HeartbeatService overlap/validation', async () => {
    expect(() => new ClobV2HeartbeatService({ intervalMs: 0 })).toThrow(/intervalMs/);
    expect(() => new ClobV2HeartbeatService({ maxMissedHeartbeats: 0 })).toThrow(/maxMissedHeartbeats/);

    // Overlapping beatOnce() calls: 1st tick is superseded by 2nd tick; non-JSON 200 ACK & heartbeatID camelCase
    let resolveFirst: ((r: Response) => void) | undefined;
    const fetchSeq = vi
      .fn()
      .mockImplementationOnce(() => new Promise<Response>((res) => { resolveFirst = res; }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ heartbeatID: 'hb-camel' }), { status: 200 }))
      .mockResolvedValueOnce(new Response('plain-ok', { status: 200 }))
      .mockResolvedValueOnce(new Response('bad-gw', { status: 502 }));

    const hb = new ClobV2HeartbeatService({
      fetchImpl: fetchSeq as unknown as typeof fetch,
      getHeaders: () => ({ 'X-Auth': '1' }),
    });
    const p1 = hb.beatOnce();
    const p2 = hb.beatOnce();
    await Promise.resolve();
    resolveFirst?.(new Response(JSON.stringify({ heartbeat_id: 'stale' }), { status: 200 }));
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.error).toBe('superseded-heartbeat-tick');
    expect(r2.ok).toBe(true);
    expect(r2.heartbeatId).toBe('hb-camel');

    const r3 = await hb.beatOnce();
    expect(r3.ok).toBe(true);
    const r4 = await hb.beatOnce();
    expect(r4.ok).toBe(false);
    expect(r4.error).toBe('http 502');

    // OrderScoringClient empty id, HTTP 500, malformed JSON, network throw, batch empty/425/500/throw, classifySubmitAndRecordCooldown
    const scoreFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('err', { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ scoring: 'not-bool' }), { status: 200 }))
      .mockRejectedValueOnce(new Error('net-down'))
      .mockResolvedValueOnce(new Response('restarting', { status: 425 }))
      .mockResolvedValueOnce(new Response('err', { status: 503 }))
      .mockRejectedValueOnce('string-err');

    const sc = new ClobV2OrderScoringClient({
      fetchImpl: scoreFetch as unknown as typeof fetch,
      getHeaders: async () => ({ 'X-Dyn': '1' }),
    });
    expect((await sc.checkOrderScoring('   ')).ok).toBe(false);
    expect((await sc.checkOrderScoring('o1')).error).toBe('http 500');
    expect((await sc.checkOrderScoring('o2')).error).toBe('malformed order-scoring payload');
    expect((await sc.checkOrderScoring('o3')).error).toBe('net-down');

    expect((await sc.checkOrdersScoringBatch(['  '])).scores).toEqual({});
    const b425 = await sc.checkOrdersScoringBatch(['o1']);
    expect(b425.engineRestarting).toBe(true);
    expect((await sc.checkOrdersScoringBatch(['o1'])).error).toBe('http 503');
    expect((await sc.checkOrdersScoringBatch(['o1'])).error).toBe('string-err');

    const sub425 = sc.classifySubmitAndRecordCooldown(425, 'restarting', 90_000);
    expect(sub425.kind).toBe('engine-restarting');
    expect(sc.cooldown.requiresPostOnly(90_050)).toBe(true);
  });

  it('covers Poly1271SessionSigner remote signer, mismatch/collateral/missing errors, CtfEthCallPreflight dry-run/unconfigured, and pUSD runner edges', async () => {
    const sessWallet = new ethers.Wallet(SESS_KEY);
    const wrongWallet = ethers.Wallet.createRandom();

    expect(
      () => new Poly1271SessionSigner({ depositWalletAddress: DEPOSIT, verifyingContract: EXCH_V3, runtimeEnv: {} }),
    ).toThrow(/MISSING_SESSION_SIGNER/);

    expect(
      () =>
        new Poly1271SessionSigner({
          depositWalletAddress: DEPOSIT,
          verifyingContract: EXCH_V3,
          sessionPrivateKey: SESS_KEY,
          collateralToken: DEPOSIT,
          runtimeEnv: {},
        }),
    ).toThrow(/INVALID_COLLATERAL_TOKEN/);

    // Remote EIP-712 signer valid + signature recovery mismatch when wrong key signs
    const remoteOk = new Poly1271SessionSigner({
      depositWalletAddress: DEPOSIT,
      verifyingContract: EXCH_V3,
      sessionSignerAddress: sessWallet.address,
      collateralToken: PUSD_COLLATERAL_ADDRESS,
      runtimeEnv: {},
      remoteSignTypedData: (domain, types, val) => sessWallet.signTypedData(domain, types, val),
    });
    const okOrder = await remoteOk.signOrder({
      tokenId: '12345', side: 'SELL', price: 0.55, size: 20, orderType: 'GTC', tickSize: 0.01, postOnly: true,
    });
    expect(okOrder.signer).toBe(sessWallet.address);

    await expect(
      remoteOk.signOrder(
        { tokenId: '12345', side: 'BUY', price: 0.55, size: 20, orderType: 'GTC', tickSize: 0.01, postOnly: false },
        true,
      ),
    ).rejects.toThrow(Poly1271IsolationError);

    const remoteBad = new Poly1271SessionSigner({
      depositWalletAddress: DEPOSIT,
      verifyingContract: EXCH_V3,
      sessionSignerAddress: sessWallet.address,
      runtimeEnv: {},
      remoteSignTypedData: (domain, types, val) => wrongWallet.signTypedData(domain, types, val),
    });
    await expect(
      remoteBad.signOrder({
        tokenId: '12345', side: 'BUY', price: 0.45, size: 20, orderType: 'GTC', tickSize: 0.01, postOnly: true,
      }),
    ).rejects.toThrow(/SIGNATURE_RECOVERY_MISMATCH/);

    // CtfEthCallPreflight dryRun, unconfigured, RPC throw, and validation branches
    const dryPre = new CtfEthCallPreflight({ dryRun: true });
    expect((await dryPre.simulateMergePositions({ conditionId: toMarketBytes32('c1'), amountRaw: 10n })).mode).toBe('dry-run');
    expect((await dryPre.simulateConvertPositions({ marketId: 'bad', indexSet: 1n, amountRaw: 10n, outcomeCount: 2 })).reason).toBe('invalid-market-bytes32');
    expect((await dryPre.simulateConvertPositions({ marketId: toMarketBytes32('m1'), indexSet: 1n, amountRaw: 0n, outcomeCount: 2 })).reason).toBe('non-positive-amount');
    expect((await dryPre.simulateConvertPositions({ marketId: toMarketBytes32('m1'), indexSet: 1n, amountRaw: 10n, availableRaw: 5n, outcomeCount: 2 })).reason).toBe('insufficient-held-balance');
    expect((await dryPre.simulateMergeOrSplit({ op: 'splitPosition', conditionId: 'bad', amountRaw: 10n })).reason).toBe('invalid-condition-bytes32');
    expect((await dryPre.simulateMergeOrSplit({ op: 'splitPosition', conditionId: toMarketBytes32('c1'), amountRaw: 0n })).reason).toBe('non-positive-amount');
    expect((await dryPre.simulateMergeOrSplit({ op: 'splitPosition', conditionId: toMarketBytes32('c1'), amountRaw: 10n, partition: [1n] })).reason).toBe('invalid-partition');
    expect((await dryPre.simulateMergeOrSplit({ op: 'splitPosition', conditionId: toMarketBytes32('c1'), amountRaw: 10n, parentCollectionId: 'bad' })).reason).toBe('invalid-parent-collection');
    expect((await dryPre.simulateRedeemPositions({ conditionId: 'bad', indexSets: [1n] })).reason).toBe('invalid-condition-bytes32');
    expect((await dryPre.simulateRedeemPositions({ conditionId: toMarketBytes32('c1'), indexSets: [] })).reason).toBe('empty-index-sets');
    expect((await dryPre.simulateRedeemPositions({ conditionId: toMarketBytes32('c1'), indexSets: [4n], outcomeCount: 2 })).reason).toBe('index-set-out-of-bounds');

    const unconfPre = new CtfEthCallPreflight();
    expect((await unconfPre.simulateMergePositions({ conditionId: toMarketBytes32('c1'), amountRaw: 10n })).mode).toBe('unconfigured');

    const throwPre = new CtfEthCallPreflight({ rpcCall: async () => { throw new Error('rpc-timeout'); } });
    expect((await throwPre.simulateMergePositions({ conditionId: toMarketBytes32('c1'), amountRaw: 10n })).reason).toBe('rpc-timeout');

    // pUSD approval retired V1 check & deduped operator check
    expect(() => buildPusdBoundedApprovalPlan({ amountPusd: 100, exchangeV3Address: V1_CTF_EXCHANGE_ADDRESS })).toThrow(/retired V1/);
    const dedupPlan = buildPusdBoundedApprovalPlan({
      amountPusd: 100, exchangeV3Address: EXCH_V3, negRiskAdapterAddress: EXCH_V3,
    });
    expect(dedupPlan.transactions).toHaveLength(2);
    expect((await runPusdBoundedApproval({ amountPusd: 100, exchangeV3Address: EXCH_V3 })).mode).toBe('dry-run');
  });

  it('covers GhostGuard HTTP CSRF/Host/413/404/405 guards, RPC batch/timeout/real verdicts, WAL skip-corruption, and NegRisk negRiskMarketId preflight', async () => {
    const ks = createPolyKillSwitch({ cancelAll: async () => ({ ok: true, status: 200 }) });
    const wh = await startGhostGuardWebhookServer({ killSwitch: ks });
    try {
      const base = wh.url.replace('/ghost-alert', '');
      expect((await fetch(`${base}/health`)).status).toBe(200);
      expect((await fetch(wh.url, { method: 'PUT' })).status).toBe(405);
      expect((await fetch(`${base}/wrong-path`, { method: 'POST' })).status).toBe(404);
      expect((await fetch(wh.url, { method: 'POST', headers: { origin: 'https://evil.example' }, body: '{}' })).status).toBe(403);
      const res413 = await fetch(wh.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'x'.repeat(270_000),
      }).catch(() => new Response(null, { status: 413 }));
      expect(res413.status).toBe(413);
    } finally {
      await wh.close();
    }

    const rpc = await startGhostGuardDrillRpcServer();
    try {
      const missingVerdict = await verifyFillAgainstJsonRpc(rpc.url, `0x${'aa'.repeat(32)}`);
      expect(missingVerdict.verdict).toBe('Timeout');

      const batchResp = await fetch(rpc.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify([
          { jsonrpc: '2.0', id: 1, method: 'net_version', params: [] },
          { jsonrpc: '2.0', id: 2, method: 'eth_blockNumber', params: [] },
          { jsonrpc: '2.0', id: 3, method: 'unknown_method', params: [] },
        ]),
      });
      expect(batchResp.status).toBe(200);
      expect((await fetch(rpc.url, { method: 'POST', body: '{bad' })).status).toBe(400);
    } finally {
      await rpc.close();
    }

    // WAL skip corruption mode + CRC32C edge cases + Checkpoint/Ingest replay
    const walDir = mkdtempSync(join(tmpdir(), 'wal-cov-'));
    dirs.push(walDir);
    const validFrame = encodePolyBookWalFrame(
      encodePolyBookWalRecord({
        tag: 'Checkpoint',
        assetId: 'tok-cp',
        checkpointTimestampUs: 1_700_000_000_000_000,
        bids: [{ price: '0.4500', size: '100.000000' }],
        asks: [{ price: '0.5500', size: '100.000000' }],
        provenance: { recvTimestampUs: 1_700_000_000_000_000, exchangeTimestampUs: 1_700_000_000_000_000, source: 'RestSnapshot', sequence: 10 },
      }),
    );
    const badTail = new Uint8Array(validFrame.length + 16);
    badTail.set(validFrame, 0);
    badTail[validFrame.length + 8] = 0xff; // zero len followed by non-zero byte -> counted as corrupt in skip mode
    writeFileSync(join(walDir, 'segment_000001.wal'), badTail);

    const skipped = await readPolyBookWalDirectory(walDir, { onCorruption: 'skip', mode: 'exchange_time' });
    expect(skipped.continuity.validFrames).toBe(1);
    expect(skipped.continuity.corruptFrames).toBe(1);

    expect(() => scanPolyBookWalFrames(badTail, 1, { isLastSegment: false })).toThrow(PolyBookWalCorruptionError);

    const resetReplay = replayPolyBookWalRecords([
      {
        tag: 'Ingest', kind: 'SequenceGap', assetId: 'tok-cp', expectedSequence: 11, observedSequence: 13,
        provenance: { recvTimestampUs: 100, exchangeTimestampUs: 100, source: 'WebSocket' },
      },
      {
        tag: 'Ingest', kind: 'BookMismatch', assetId: 'tok-cp',
        provenance: { recvTimestampUs: 101, exchangeTimestampUs: 101, source: 'WebSocket' },
      },
      {
        tag: 'Ingest', kind: 'SourceReset', assetId: 'tok-cp',
        provenance: { recvTimestampUs: 102, exchangeTimestampUs: 102, source: 'WebSocket' },
      },
    ]);
    expect(resetReplay.continuity.sequenceGaps).toBe(1);
    expect(resetReplay.continuity.bookMismatches).toBe(1);
    expect(resetReplay.continuity.sourceResets).toBe(1);

    // NegRisk explicit negRiskMarketId valid & invalid bytes32 preflight branches + LiquidityRegimeMachine cancel retry
    const machine = new LiquidityRegimeMachine({
      cancelMarketOrders: async () => ({ ok: false, status: 500, canceledOrderIds: [], error: 'fail' }),
    });
    await machine.evaluateAndEnforce({ marketId: 'm-err', nowMs: 1_000, priceJump10sTicks: 5 });
    expect(machine.getTelemetry(1_000).rollingApiErrorsLastMinute).toBe(1);
    expect(machine.getDecision('m-err')?.state).toBe('EVENT');

    const bBook = new BundleBook();
    const quote = {
      eventId: 'ev-nr',
      legs: [
        { tokenId: 't1', conditionId: 'c1', outcome: 'A', askPrice: 0.4, bestBidPrice: 0.38, displayedShares: 100, executableShares: 100, takerFeePerShare: 0, thin: false },
        { tokenId: 't2', conditionId: 'c2', outcome: 'B', askPrice: 0.4, bestBidPrice: 0.38, displayedShares: 100, executableShares: 100, takerFeePerShare: 0, thin: false },
      ],
      sumAsk: 0.8, takerFeesPerBundle: 0, netEdgePusd: 0.15, convertibleShares: 50, makerOptimisationApplies: false,
    };
    bBook.open(quote, 1_000);
    bBook.recordFill('ev-nr', { tokenId: 't1', conditionId: 'c1', price: 0.4, quantity: 50, orderId: 'o1', aggressive: true, atMs: 1_000 });
    bBook.recordFill('ev-nr', { tokenId: 't2', conditionId: 'c2', price: 0.4, quantity: 50, orderId: 'o2', aggressive: true, atMs: 1_000 });

    const stats = { preflightPassed: 0, preflightBlocked: 0, excludedFiveMinuteEvents: 0 };
    await settleOrRecordBundle({
      event: {
        id: 'ev-nr', title: 'NR', slug: 'nr', negRiskMarketId: 'not-bytes32',
        markets: [
          { id: 'm1', question: 'A', conditionId: 'c1', slug: 'a', outcomes: ['Yes', 'No'], outcomePrices: ['0.4', '0.6'], volume: 1000, liquidity: 500, endDate: '2026-12-30T00:00:00Z', active: true, closed: false, tokens: [], yesTokenId: 't1', yesPrice: 0.4 },
          { id: 'm2', question: 'B', conditionId: 'c2', slug: 'b', outcomes: ['Yes', 'No'], outcomePrices: ['0.4', '0.6'], volume: 1000, liquidity: 500, endDate: '2026-12-30T00:00:00Z', active: true, closed: false, tokens: [], yesTokenId: 't2', yesPrice: 0.4 },
        ],
      },
      nowMs: 1_000,
      totalOutcomeCount: 2,
      book: bBook,
      cfg: NEGRISK_CFG,
      orderManager: { placeOrder: async () => ({ id: '1' }), cancelOrder: async () => {}, cancelAllOrders: async () => {}, getOpenOrders: async () => [] },
      strategyName: 'negrisk-bundle-arbitrage',
      positions: [],
      emitTrade: () => {},
      ctfPreflight: new CtfEthCallPreflight({ dryRun: true }),
      stats,
    });
    expect(stats.preflightBlocked).toBe(1);

    const bBook2 = new BundleBook();
    bBook2.open(quote, 2_000);
    bBook2.recordFill('ev-nr', { tokenId: 't1', conditionId: 'c1', price: 0.4, quantity: 50, orderId: 'o1', aggressive: true, atMs: 2_000 });
    bBook2.recordFill('ev-nr', { tokenId: 't2', conditionId: 'c2', price: 0.4, quantity: 50, orderId: 'o2', aggressive: true, atMs: 2_000 });
    await settleOrRecordBundle({
      event: {
        id: 'ev-nr', title: 'NR', slug: 'nr', negRiskMarketId: toMarketBytes32('ev-nr'),
        markets: [
          { id: 'm1', question: 'A', conditionId: 'c1', slug: 'a', outcomes: ['Yes', 'No'], outcomePrices: ['0.4', '0.6'], volume: 1000, liquidity: 500, endDate: '2026-12-30T00:00:00Z', active: true, closed: false, tokens: [], yesTokenId: 't1', yesPrice: 0.4 },
          { id: 'm2', question: 'B', conditionId: 'c2', slug: 'b', outcomes: ['Yes', 'No'], outcomePrices: ['0.4', '0.6'], volume: 1000, liquidity: 500, endDate: '2026-12-30T00:00:00Z', active: true, closed: false, tokens: [], yesTokenId: 't2', yesPrice: 0.4 },
        ],
      },
      nowMs: 2_000,
      totalOutcomeCount: 2,
      book: bBook2,
      cfg: NEGRISK_CFG,
      orderManager: { placeOrder: async () => ({ id: '1' }), cancelOrder: async () => {}, cancelAllOrders: async () => {}, getOpenOrders: async () => [] },
      strategyName: 'negrisk-bundle-arbitrage',
      positions: [],
      emitTrade: () => {},
      ctfPreflight: new CtfEthCallPreflight({ dryRun: true }),
      stats,
    });
    expect(stats.preflightPassed).toBe(1);

    // Additional WAL Trade + Validation record roundtrip, 5m tags/null guard, Watchlist invalid slug/catch, and Kelly allocator branches
    const tradeRec = encodePolyBookWalRecord({
      tag: 'Trade',
      assetId: 'tok-tr',
      priceRaw: 5_500,
      price: '0.5500',
      sizeRaw: 10_000_000n,
      size: '10.000000',
      side: 'Ask',
      tradeId: 'tr-1',
      fidelity: 'Full',
      provenance: { recvTimestampUs: 500, exchangeTimestampUs: 500, source: 'WebSocket', sourceEventId: 'e1', sourceSessionId: 's1' },
    });
    expect(decodePolyBookWalRecord(tradeRec)).toMatchObject({ tag: 'Trade', assetId: 'tok-tr', fidelity: 'Full' });

    const valRec = encodePolyBookWalRecord({
      tag: 'Validation',
      assetId: 'tok-val',
      mode: 'exchange_time',
      replayTimestampUs: 600,
      referenceTimestampUs: 600,
      matched: false,
      mismatchSummary: '1 tick diff',
      persistedAtUs: 605,
    });
    expect(decodePolyBookWalRecord(valRec)).toMatchObject({ tag: 'Validation', matched: false });
    expect(() => decodePolyBookWalRecord(new Uint8Array(0))).toThrow(PolyBookWalCorruptionError);
    expect(() => decodePolyBookWalRecord(new Uint8Array([2]))).toThrow(/drain the WAL/);

    expect(classifyFiveMinuteExclusion(null)).toBeNull();
    expect(classifyFiveMinuteExclusion({ tags: ['btc-updown-5m', 'crypto'] })).toBe('updown-5m-contract');

    const badWatch = await fetchGitHubWatchlistStates(
      [
        { slug: 'invalid slug without slash', category: 'clob-sdk', criticalImpact: 'x' },
        { slug: 'org/repo', category: 'clob-sdk', criticalImpact: 'x' },
      ],
      (async () => { throw new Error('offline'); }) as unknown as typeof fetch,
      100,
    );
    expect(badWatch.get('invalid slug without slash')?.headSha).toBeNull();
    expect(badWatch.get('org/repo')?.headSha).toBeNull();

    expect(() => new PolyLockupKellyAllocator({ cadenceMs: 0 })).toThrow(RangeError);
    const alloc = new PolyLockupKellyAllocator({ cadenceMs: 60_000 });
    expect(alloc.getLastLimitsTable()).toBeNull();
    expect(alloc.isRebalanceDue(Number.NaN)).toBe(true);
    expect(() =>
      alloc.allocate({
        nowMs: 1_000, navPusd: 10_000, disputedLockedPusd: 0, portfolioDrawdownPct: 0,
        scenarioProbabilities: [0.5, 0.5], candidates: [], solverConfig: { maxClusterLoss: 1.5 },
      }),
    ).toThrow(RangeError);

    // Strategy tick factories, sanitizer malformed sourceUrl + >128 doc cap, Strategy 4 receipt/parameter mismatches, and Strategy 3/2 error recovery
    const manyDocs = Array.from({ length: 132 }, (_, i) => ({
      id: `d-${i}`, title: 'T', content: 'C', sourceUrl: 'not a valid url?yesPrice=0.9#frag',
    }));
    const sanMany = sanitizeMarketBlindContext({ documents: manyDocs }, { maxTotalContextChars: 50_000 });
    expect(sanMany.documents).toHaveLength(128);
    expect(sanMany.droppedDocuments).toBe(4);

    const errClob = {
      getOrderBook: async () => { throw new Error('book-err'); },
      getPrice: async () => 0.5,
      getMidPrice: async () => 0.5,
    };
    const errGamma = {
      getMarkets: async () => [],
      getMarket: async () => null,
      getMarketGroup: async () => null,
      searchMarkets: async () => [],
      getTrending: async () => [{
        id: 'm1', question: 'Macro?', conditionId: 'c1', slug: 'm1', outcomes: ['Yes', 'No'], outcomePrices: ['0.5', '0.5'],
        volume: 200_000, liquidity: 50_000, endDate: '2026-12-30T00:00:00Z', active: true, closed: false, tokens: [],
        yesTokenId: 'y1', noTokenId: 'n1', yesPrice: 0.5,
      }],
      getEvents: async () => [{
        id: 'ev1', title: 'Macro Ev', slug: 'macro-ev',
        markets: [{
          id: 'm1', question: 'Macro?', conditionId: 'c1', slug: 'm1', outcomes: ['Yes', 'No'], outcomePrices: ['0.5', '0.5'],
          volume: 200_000, liquidity: 50_000, endDate: '2026-12-30T00:00:00Z', active: true, closed: false, negRisk: true, tokens: [],
          yesTokenId: 'y1', noTokenId: 'n1', yesPrice: 0.5,
        }],
      }],
    };
    const noopOm = {
      placeOrder: async () => { throw new Error('order-err'); },
      cancelOrder: async () => {},
      cancelAllOrders: async () => { throw new Error('cancel-err'); },
      getOpenOrders: async () => [],
    };
    const noopBus = { emit: () => {}, on: () => {}, off: () => {} };

    const mmTick = createToxicityAwareMarketMakerTick({
      clob: errClob as never, gamma: errGamma as never, orderManager: noopOm as never, eventBus: noopBus as never,
    });
    await mmTick();

    const localSigner = new Poly1271SessionSigner({
      depositWalletAddress: DEPOSIT, verifyingContract: EXCH_V3, sessionPrivateKey: SESS_KEY, runtimeEnv: {},
    });
    const nrStrat = new NegRiskBundleArbitrageStrategy({
      clob: errClob as never, gamma: errGamma as never, orderManager: noopOm as never, eventBus: noopBus as never,
      sessionSigner: localSigner,
    });
    expect(nrStrat.getSessionSigner()).toBe(localSigner);
    await createNegRiskBundleArbitrageTick({
      clob: errClob as never, gamma: errGamma as never, orderManager: noopOm as never, eventBus: noopBus as never,
    })();

    const wrongEventReceipt = commitMarketBlindForecast({
      modelVersionId: 'm1', stateVariant: 'v1', questionId: 'wrong-event', category: 'macro', pRaw: 0.7, loggedAtMs: 1_000,
    });
    const rightEventReceipt = commitMarketBlindForecast({
      modelVersionId: 'm1', stateVariant: 'v1', questionId: 'ev1', category: 'macro', pRaw: 0.7, loggedAtMs: 1_000,
    });
    const bulletins = [{ id: 'b1', title: 'FOMC hold', body: '4.5', sourceHost: 'federalreserve.gov', publishedAtMs: 900 }];
    const checks = arbitrationChecksFromTable({
      'macro-ev': { key: 'k', allowedSourceHosts: ['federalreserve.gov'], requiredTerms: ['fomc'], forbiddenTerms: [], requiredNumbers: [{ value: 4.5, tolerance: 0.1 }] },
    });

    // Receipt questionId mismatch & invalid pPost branches in PrimarySourceNewsLatencyStrategy
    const nlMismatch = new PrimarySourceNewsLatencyStrategy({
      clob: { getOrderBook: async () => ({ bids: [{ price: '0.4', size: '100' }], asks: [{ price: '0.5', size: '100' }], timestamp: 1_000 }), getPrice: async () => 0.4, getMidPrice: async () => 0.45 } as never,
      gamma: errGamma as never, orderManager: noopOm as never, eventBus: noopBus as never,
      bulletins: recordedBulletinSource(bulletins, () => 1_000), arbitrationChecks: checks, clock: () => 1_000, clockOffset: () => 5,
      marketBlindEvaluator: async () => ({ receipt: wrongEventReceipt, pPost: 0.8, wSkill: 0.2 }),
    });
    await nlMismatch.execute();

    const nlInvalidP = new PrimarySourceNewsLatencyStrategy({
      clob: { getOrderBook: async () => ({ bids: [{ price: '0.4', size: '100' }], asks: [{ price: '0.5', size: '100' }], timestamp: 1_000 }), getPrice: async () => 0.4, getMidPrice: async () => 0.45 } as never,
      gamma: errGamma as never, orderManager: noopOm as never, eventBus: noopBus as never,
      bulletins: recordedBulletinSource(bulletins, () => 1_000), arbitrationChecks: checks, clock: () => 1_000, clockOffset: () => 5,
      marketBlindEvaluator: async () => ({ receipt: rightEventReceipt, pPost: 1.5, wSkill: 0.2 }),
    });
    await nlInvalidP.execute();

    await createPrimarySourceNewsLatencyTick({
      clob: errClob as never, gamma: errGamma as never, orderManager: noopOm as never, eventBus: noopBus as never,
    })();
  });

  it('covers OrderBookStream parse/reconnect/ws/facade lifecycle and primary-source-news-latency-sources branches', async () => {
    // 1. orderbook-stream-parse pure branches
    const parsedEvents = parseWsMessage(
      JSON.stringify([
        { event_type: 'book', bids: [{ price: '0.4', size: '10' }] }, // missing tokenId -> skipped
        { event_type: 'book', asset_id: 't-book', data: { bids: [{ price: '0.42', size: '15' }], asks: [{ price: '0.45', size: '20' }] } },
        { type: 'price_change', market: 't-empty', bids: [], asks: [] }, // 0/0 -> skipped
        { event_type: 'trade', asset_id: 't-trade', price: '0.51', size: '100' },
        { event_type: 'tick_size_change', asset_id: 't-tick', new_tick_size: '0.001' },
        { event_type: 'tick_size_change', asset_id: 't-tick-bad', new_tick_size: 'nan' },
      ]),
    );
    expect(parsedEvents).toHaveLength(3);
    expect(parsedEvents[0]).toMatchObject({ tokenId: 't-book', bestBid: 0.42, bestAsk: 0.45 });
    expect(parsedEvents[1]).toMatchObject({ tokenId: 't-trade', lastTradePrice: 0.51, volume24h: 100 });
    expect(parsedEvents[2]).toMatchObject({ tokenId: 't-tick', tickSizeMicro: 1_000 });

    expect(mergeAndBuildPricePayload('t0', 0, 0, undefined)).toBeNull();
    const mergedPartial = mergeAndBuildPricePayload('t1', 0, 0.55, { bestBid: 0.50, bestAsk: 0.58 });
    expect(mergedPartial?.mergedBid).toBe(0.50);
    expect(mergedPartial?.mergedAsk).toBe(0.55);
    expect(mergedPartial?.payload.spreadBps).toBeGreaterThan(0);

    expect(JSON.parse(buildSubscribePayload('tok-sub')).assets_ids).toEqual(['tok-sub']);
    expect(chunkAssetIdsForWsSubscribe(['a', '', 'b', 'c'], 2)).toEqual([['a', 'b'], ['c']]);
    expect(chunkAssetIdsForWsSubscribe(['a'], Number.NaN)).toEqual([['a']]);
    expect(buildChunkedSubscribePayloads(['a', 'b', 'c'], 2)).toHaveLength(2);
    expect(resolveAuthoritativeTickSizeMicro(1_000, 10_000)).toBe(1_000);
    expect(resolveAuthoritativeTickSizeMicro(undefined, undefined)).toBe(10_000);

    // 2. orderbook-stream-reconnect & OrderBookStream facade over local WebSocketServer
    const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await new Promise<void>((res) => wss.once('listening', () => res()));
    const addr = wss.address();
    const wsPort = typeof addr === 'object' && addr !== null ? addr.port : 0;

    const receivedFrames: string[] = [];
    let firstFrameResolve: (() => void) | undefined;
    const firstFramePromise = new Promise<void>((res) => { firstFrameResolve = res; });
    wss.on('connection', (sock) => {
      sock.on('message', (d) => {
        receivedFrames.push(d.toString());
        firstFrameResolve?.();
      });
      sock.ping();
    });

    const busEvents: unknown[] = [];
    const customBus = {
      emitConnectionStatus: (p: unknown) => { busEvents.push(p); },
      emitPriceUpdate: (p: unknown) => { busEvents.push(p); },
    };

    const stream = new OrderBookStream(customBus as never);
    try {
      expect(stream.isConnected()).toBe(false);
      expect(stream.getTickSizeMicro('tok-a')).toBe(10_000);
      expect(stream.applyRestTickSize('tok-a', 0.01)).toBe(10_000);
      expect(stream.applyRestTickSize('tok-a', -1)).toBe(10_000);

      stream.subscribe(''); // ignored
      stream.subscribe('tok-a');
      stream.subscribe('tok-a'); // duplicate ignored
      expect(stream.getSubscribedTokens()).toEqual(['tok-a']);

      const clientWs = new WebSocket(`ws://127.0.0.1:${wsPort}`);
      stream.ws = clientWs;
      setupWebSocketHandlers(stream);
      await new Promise<void>((res) => stream.once('connected', () => res()));
      expect(stream.isConnected()).toBe(true);

      stream.subscribe('tok-b');
      stream.onMessage(JSON.stringify({ event_type: 'tick_size_change', asset_id: 'tok-a', new_tick_size: '0.0001' }));
      expect(stream.getTickSizeMicro('tok-a')).toBe(100);
      // Coarser REST poll never overwrites finer WS tick size
      expect(stream.applyRestTickSize('tok-a', 0.01)).toBe(100);

      stream.onMessage(JSON.stringify({ event_type: 'book', asset_id: 'tok-a', bids: [{ price: '0.48', size: '10' }], asks: [{ price: '0.52', size: '10' }] }));
      stream.onMessage(JSON.stringify({ event_type: 'book', asset_id: 'unsubscribed', bids: [{ price: '0.48', size: '10' }], asks: [{ price: '0.52', size: '10' }] }));
      stream.onMessage('{invalid-json');
      stream.processPriceEvent({ tokenId: 'tok-zero', bestBid: 0, bestAsk: 0 });
      stream.onError(new Error('ws-glitch'));
      stream.unsubscribe('tok-b');
      await firstFramePromise;

      // Reconnect backoff + max attempts + clearReconnectTimer
      stream.scheduleReconnect();
      expect(stream.reconnectAttempts).toBe(1);
      stream.clearReconnectTimer();

      stream.reconnectAttempts = 10;
      scheduleReconnect(stream as never); // exceeds MAX_RECONNECT_ATTEMPTS (10 -> 11)
      expect(stream.reconnectAttempts).toBe(11);

      stream.reconnectAttempts = 0;
      handleDisconnect(stream as never, 1006, Buffer.from('abnormal'));
      stream.clearReconnectTimer();

      stream.disconnect();
      expect(stream.closed).toBe(true);
      scheduleReconnect(stream as never); // no-op when closed
      stream.connect(); // no-op when closed
      expect(busEvents.length).toBeGreaterThan(0);
      expect(receivedFrames.length).toBeGreaterThan(0);
    } finally {
      stream.disconnect();
      await new Promise<void>((res) => wss.close(() => res()));
    }

    // 3. primary-source-news-latency-sources branches
    const mapped = bulletinFromNewsItem({
      title: 'BLS CPI Print 2.4%',
      description: undefined,
      source: 'bls.gov',
      publishedAt: 5_000,
    });
    expect(mapped.id).toContain('bls.gov:');
    expect(mapped.body).toBe('');
    expect(noArbitrationChecks({ id: 'e1', title: 'T', slug: 's', markets: [] })).toBeNull();
    expect(unknownClockOffset()).toBeNull();

    const emptyReqCheck = {
      key: 'k0',
      allowedSourceHosts: ['bls.gov'],
      requiredTerms: [],
      forbiddenTerms: ['rumor'],
      requiredNumbers: [],
    };
    expect(termStream({ ...mapped, sourceHost: 'evil.example' }, emptyReqCheck).matches).toBe(false);
    expect(termStream({ ...mapped, body: 'unconfirmed rumor' }, emptyReqCheck).matches).toBe(false);
    expect(termStream(mapped, emptyReqCheck)).toMatchObject({ matches: true, confidence: 1 });
    expect(numericStream({ ...mapped, sourceHost: 'evil.example' }, emptyReqCheck).matches).toBe(false);
    expect(numericStream(mapped, emptyReqCheck)).toMatchObject({ matches: true, confidence: 1 });
  });
});
