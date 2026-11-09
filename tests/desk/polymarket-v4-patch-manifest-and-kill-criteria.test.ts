/**
 * Polymarket CLOB V2 WebSocket/HTTP2 Transport Hardening
 * and OOS Maker Reward Dilution & Markout Kill Criterion Verification Suite.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import WebSocket from 'ws';
import {
  buildChunkedSubscribePayloads,
  chunkAssetIdsForWsSubscribe,
  parseWsMessage,
  resolveAuthoritativeTickSizeMicro,
} from '../../src/desk/polymarket/orderbook-stream-parse';
import { OrderBookStream } from '../../src/desk/polymarket/orderbook-stream';
import {
  canonicalizePolymarketJsonBody,
  computePolymarketSignature,
  normalizePolymarketFeeRateResponse,
} from '../../src/desk/execution/polymarket-adapter-transport';
import {
  submitAndTrackOrder,
  submitOnlyOrder,
  type SubmissionHost,
} from '../../src/desk/execution/live-order-submission';
import { resetExecutionModeCache } from '../../src/desk/execution/execution-mode';
import { simulateMakerEpisode } from '../../src/desk/polymarket/polymarket-oos-maker-episode-simulator';
import { runPolymarketWalkForwardEvaluation } from '../../src/desk/polymarket/polymarket-oos-evaluator';
import type { PolymarketOrder } from '../../src/desk/execution/polymarket-signer';

describe('Chunked WebSocket Re-subscription', () => {
  it('chunks large token lists into <= 150 asset_ids per subscribe frame and falls back on non-finite chunkSize', () => {
    const tokenIds = Array.from({ length: 320 }, (_, i) => `token-${i + 1}`);
    const chunks = chunkAssetIdsForWsSubscribe(tokenIds, 150);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(150);
    expect(chunks[1]).toHaveLength(150);
    expect(chunks[2]).toHaveLength(20);

    const fallbackChunks = chunkAssetIdsForWsSubscribe(tokenIds, Number.NaN);
    expect(fallbackChunks).toHaveLength(3);

    const payloads = buildChunkedSubscribePayloads(tokenIds, 150);
    expect(payloads).toHaveLength(3);
    const parsed0 = JSON.parse(payloads[0]!) as {
      type: string;
      assets_ids: string[];
      channels: string[];
    };
    expect(parsed0.type).toBe('subscribe');
    expect(parsed0.assets_ids).toHaveLength(150);
    expect(parsed0.channels).toEqual(['price_change', 'trade', 'book', 'tick_size_change']);
  });

  it('OrderBookStream.onOpen sends chunked subscribe frames when >150 tokens are subscribed', () => {
    const stream = new OrderBookStream();
    for (let i = 0; i < 310; i++) {
      stream.subscribedTokenIds.add(`tok-${i}`);
    }
    const sendSpy = vi.fn();
    stream.ws = {
      readyState: WebSocket.OPEN,
      send: sendSpy,
      ping: vi.fn(),
      removeAllListeners: vi.fn(),
      close: vi.fn(),
    } as unknown as WebSocket;

    stream.onOpen();
    stream.stopHeartbeat();

    // 310 tokens chunked by 150 -> 3 frames (150 + 150 + 10) instead of 310 individual frames
    expect(sendSpy).toHaveBeenCalledTimes(3);
    const firstFrame = JSON.parse(sendSpy.mock.calls[0]![0] as string) as { assets_ids: string[] };
    const secondFrame = JSON.parse(sendSpy.mock.calls[1]![0] as string) as { assets_ids: string[] };
    const thirdFrame = JSON.parse(sendSpy.mock.calls[2]![0] as string) as { assets_ids: string[] };
    expect(firstFrame.assets_ids).toHaveLength(150);
    expect(secondFrame.assets_ids).toHaveLength(150);
    expect(thirdFrame.assets_ids).toHaveLength(10);
  });
});

describe('Monotonic Tick-Size Precision Guard', () => {
  it('parses tick_size_change WebSocket events into tickSizeMicro', () => {
    const raw = JSON.stringify({
      event_type: 'tick_size_change',
      asset_id: 'tok-extreme',
      new_tick_size: '0.001',
    });
    const events = parseWsMessage(raw);
    expect(events).toHaveLength(1);
    expect(events[0]!.tokenId).toBe('tok-extreme');
    expect(events[0]!.tickSizeMicro).toBe(1_000);
  });

  it('preserves finer WebSocket tickSizeMicro against coarser Gamma REST overwrites and invalid inputs', () => {
    const stream = new OrderBookStream();
    stream.subscribedTokenIds.add('tok-fine');

    // Initial Gamma REST poll sets standard 0.01 (10,000 micro)
    expect(stream.applyRestTickSize('tok-fine', 0.01)).toBe(10_000);
    expect(stream.getTickSizeMicro('tok-fine')).toBe(10_000);

    // Zero or negative REST tick size does not corrupt tickSizeMicro to 1 micro
    expect(stream.applyRestTickSize('tok-fine', 0)).toBe(10_000);
    expect(stream.applyRestTickSize('tok-fine', -0.01)).toBe(10_000);

    // WebSocket emits tick_size_change to 0.001 (1,000 micro)
    stream.onMessage(
      JSON.stringify({
        event_type: 'tick_size_change',
        asset_id: 'tok-fine',
        new_tick_size: '0.001',
      }),
    );
    expect(stream.getTickSizeMicro('tok-fine')).toBe(1_000);

    // Subsequent Gamma REST poll tries to overwrite back to 0.01 -> blocked by monotonic guard
    expect(stream.applyRestTickSize('tok-fine', 0.01)).toBe(1_000);
    expect(stream.getTickSizeMicro('tok-fine')).toBe(1_000);

    // Direct helper verification
    expect(resolveAuthoritativeTickSizeMicro(1_000, 10_000)).toBe(1_000);
    expect(resolveAuthoritativeTickSizeMicro(100, 1_000)).toBe(100);
  });
});

describe('CLOB Transport & Order Submission Hardening', () => {
  const origLive = process.env.LIVE_TRADING_ENABLED;

  beforeEach(() => {
    process.env.LIVE_TRADING_ENABLED = 'true';
    resetExecutionModeCache();
  });

  afterEach(() => {
    if (origLive !== undefined) process.env.LIVE_TRADING_ENABLED = origLive;
    else delete process.env.LIVE_TRADING_ENABLED;
    resetExecutionModeCache();
  });

  it('canonicalizes JSON body with sorted keys and compact separators for identical HMAC signatures regardless of key insertion order', () => {
    const bodyA = {
      side: 'BUY',
      tokenID: '0x123',
      makerAmount: '1000000',
      nested: { z: 1, a: 2 },
    };
    const bodyB = {
      nested: { a: 2, z: 1 },
      makerAmount: '1000000',
      tokenID: '0x123',
      side: 'BUY',
    };

    const canonicalA = canonicalizePolymarketJsonBody(bodyA);
    const canonicalB = canonicalizePolymarketJsonBody(bodyB);
    expect(canonicalA).toBe(canonicalB);
    expect(canonicalA).toBe('{"makerAmount":"1000000","nested":{"a":2,"z":1},"side":"BUY","tokenID":"0x123"}');

    const sigA = computePolymarketSignature('secret-key', '1700000000', 'POST', '/order', bodyA);
    const sigB = computePolymarketSignature('secret-key', '1700000000', 'POST', '/order', bodyB);
    expect(sigA).toBe(sigB);
  });

  it('normalizes /fee-rate responses by ignoring legacy base_fee:1000 and coercing empty or missing fee_rate_bps to 0', () => {
    expect(
      normalizePolymarketFeeRateResponse({ base_fee: 1000, fee_rate_bps: '' }),
    ).toEqual({ feeRateBps: 0, ignoredLegacyBaseFee: true });

    expect(
      normalizePolymarketFeeRateResponse({ base_fee: 1000, fee_rate_bps: null }),
    ).toEqual({ feeRateBps: 0, ignoredLegacyBaseFee: true });

    expect(
      normalizePolymarketFeeRateResponse({ base_fee: 1000 }),
    ).toEqual({ feeRateBps: 0, ignoredLegacyBaseFee: true });

    expect(
      normalizePolymarketFeeRateResponse({ base_fee: 1000, fee_rate_bps: '175' }),
    ).toEqual({ feeRateBps: 175, ignoredLegacyBaseFee: true });

    expect(
      normalizePolymarketFeeRateResponse({ fee_rate_bps: 200 }),
    ).toEqual({ feeRateBps: 200, ignoredLegacyBaseFee: false });
  });

  it('submitAndTrackOrder and submitOnlyOrder reject responses with empty or whitespace-only orderID', async () => {
    const activeOrders = new Map();
    const host: SubmissionHost = {
      stopped: false,
      activeOrders,
      pollTimers: new Map(),
      adapter: {
        placeOrder: vi.fn().mockResolvedValue({ orderID: '   ', status: 'pending' }),
      } as never,
      handleFill: vi.fn(),
      schedulePoll: vi.fn(),
    };
    const order: PolymarketOrder = {
      tokenId: '0xabc',
      price: 0.5,
      size: 10,
      side: 'BUY',
      expiration: 9999999999,
    };

    await expect(submitAndTrackOrder(host, order)).rejects.toThrow(/empty orderID/i);
    expect(activeOrders.size).toBe(0);
    expect(host.schedulePoll).not.toHaveBeenCalled();

    await expect(submitOnlyOrder(host, order)).rejects.toThrow(/empty orderID/i);
  });
});

describe('Maker Reward Dilution & 1.5x Markout Kill Criterion', () => {
  it('applies competitive dilution factor (0.30-0.50) to simulated liquidity rewards and evaluates >= 1.5x markout coverage', () => {
    const ep = simulateMakerEpisode(
      {
        yesBid: 0.48,
        yesAsk: 0.52,
        noBid: 0.48,
        noAsk: 0.52,
        yesAskTokens: 500,
        noAskTokens: 500,
        queueAheadShares: 10,
        leg2Reject: false,
      },
      25,
      0.01,
      'politics',
      { s: 12345 },
      { competitiveDilutionFactor: 0.40 },
    );

    expect(ep.traded).toBe(true);
    expect(ep.discountedLiquidityReward).toBeDefined();
    expect(ep.discountedLiquidityReward!).toBeGreaterThanOrEqual(0);
    expect(ep.markoutLoss60s).toBeDefined();
    expect(ep.markoutLoss60s!).toBeGreaterThanOrEqual(0);

    // Higher dilution factor (0.50 vs 0.30) strictly increases discountedLiquidityReward
    const epLow = simulateMakerEpisode(
      {
        yesBid: 0.48,
        yesAsk: 0.52,
        noBid: 0.48,
        noAsk: 0.52,
        yesAskTokens: 500,
        noAskTokens: 500,
        queueAheadShares: 10,
        leg2Reject: false,
      },
      25,
      0.01,
      'politics',
      { s: 12345 },
      { competitiveDilutionFactor: 0.30 },
    );
    const epHigh = simulateMakerEpisode(
      {
        yesBid: 0.48,
        yesAsk: 0.52,
        noBid: 0.48,
        noAsk: 0.52,
        yesAskTokens: 500,
        noAskTokens: 500,
        queueAheadShares: 10,
        leg2Reject: false,
      },
      25,
      0.01,
      'politics',
      { s: 12345 },
      { competitiveDilutionFactor: 0.50 },
    );
    expect(epHigh.discountedLiquidityReward!).toBeGreaterThan(epLow.discountedLiquidityReward!);
  });

  it('reports makerMarkoutCoverageRatio and passesMakerMarkoutKillCriterion in walk-forward OOS report', () => {
    const report = runPolymarketWalkForwardEvaluation({
      seed: 42,
      episodes: 120,
      competitiveDilutionFactor: 0.40,
    });
    const mm = report.candidates['log_odds_maker_mm_v2'];
    expect(mm.makerMarkoutCoverageRatio).toBeDefined();
    expect(mm.makerMarkoutCoverageRatio!).toBeGreaterThanOrEqual(1.5);
    expect(mm.passesMakerMarkoutKillCriterion).toBe(true);
  });
});
