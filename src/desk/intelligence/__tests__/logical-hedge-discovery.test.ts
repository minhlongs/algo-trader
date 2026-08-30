/**
 * Logical Hedge Discovery Tests
 *
 * Covers the full discoverLogicalHedges pipeline: <2-market guard, cache HIT,
 * LLM call + JSON parse (success, fenced-json, invalid JSON, throw), tier
 * filtering (T1/T2/T3/reject), market-lookup rejection, per-batch failure,
 * multi-batching, sort order, and cache write failure fallback.
 * LlmRouter and Redis are replaced with deterministic mocks via vi.hoisted.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { llmChat, redisGet, redisSetex } = vi.hoisted(() => ({
  llmChat: vi.fn(),
  redisGet: vi.fn(),
  redisSetex: vi.fn(),
}));

vi.mock('../../../lib/llm-router', () => ({
  LlmRouter: class {
    chat = llmChat;
  },
}));

vi.mock('../../../redis/index', () => ({
  getRedisClient: () => ({ get: redisGet, setex: redisSetex }),
}));

import { discoverLogicalHedges } from '../logical-hedge-discovery';
import type { MarketInput, LogicalHedge } from '../logical-hedge-discovery';

const mkMarket = (title: string, id: string, yesPrice: number): MarketInput => ({
  id, title, yesPrice,
});

const PAIR: MarketInput[] = [mkMarket('A', 'a', 0.6), mkMarket('B', 'b', 0.4)];

function hedgeJson(confidence: number, a = 'A', b = 'B', extra: Record<string, string> = {}) {
  return JSON.stringify([{
    marketA_title: a, marketB_title: b,
    implication: 'i', contrapositive: 'c', confidence, ...extra,
  }]);
}

describe('discoverLogicalHedges', () => {
  beforeEach(() => {
    llmChat.mockReset();
    redisGet.mockReset();
    redisSetex.mockReset();
    redisGet.mockResolvedValue(null);
    redisSetex.mockResolvedValue('OK');
  });

  it('returns [] for fewer than 2 markets without touching LLM or cache', async () => {
    expect(await discoverLogicalHedges([])).toEqual([]);
    expect(await discoverLogicalHedges([PAIR[0]!])).toEqual([]);
    expect(llmChat).not.toHaveBeenCalled();
    expect(redisGet).not.toHaveBeenCalled();
  });

  it('returns cached hedges on a cache HIT and skips the LLM', async () => {
    const cached: LogicalHedge[] = [{
      id: 'h1', marketA: { id: 'a', title: 'A', yesPrice: 0.6 }, marketB: { id: 'b', title: 'B', yesPrice: 0.4 },
      implication: 'i', contrapositive: 'c', confidence: 0.95, tier: 'T1', expectedEdge: 0.2, hedgeStrategy: 'logical-necessity',
    }];
    redisGet.mockResolvedValueOnce(JSON.stringify(cached));

    const out = await discoverLogicalHedges(PAIR);

    expect(out).toEqual(cached);
    expect(llmChat).not.toHaveBeenCalled();
    expect(redisSetex).not.toHaveBeenCalled();
  });

  it('discovers a T1 hedge and writes the cache', async () => {
    llmChat.mockResolvedValueOnce({ content: hedgeJson(0.95) });

    const out = await discoverLogicalHedges(PAIR);

    expect(out.length).toBe(1);
    expect(out[0]!.tier).toBe('T1');
    expect(out[0]!.confidence).toBe(0.95);
    expect(out[0]!.expectedEdge).toBeCloseTo(0.2);
    expect(out[0]!.hedgeStrategy).toBe('logical-necessity');
    expect(out[0]!.id).toMatch(/^[0-9a-f]{32}$/);
    expect(redisSetex).toHaveBeenCalledTimes(1);
    expect(redisSetex.mock.calls[0]![0]).toMatch(/^[0-9a-f]{64}$/);
    expect(redisSetex.mock.calls[0]![1]).toBe(2 * 60 * 60);
  });

  it('discovers a T2 hedge for confidence 0.90', async () => {
    llmChat.mockResolvedValueOnce({ content: hedgeJson(0.90) });
    const out = await discoverLogicalHedges(PAIR);
    expect(out[0]!.tier).toBe('T2');
  });

  it('discovers a T3 hedge for confidence 0.85', async () => {
    llmChat.mockResolvedValueOnce({ content: hedgeJson(0.85) });
    const out = await discoverLogicalHedges(PAIR);
    expect(out[0]!.tier).toBe('T3');
  });

  it('rejects a hedge below MIN_CONFIDENCE (0.84)', async () => {
    llmChat.mockResolvedValueOnce({ content: hedgeJson(0.84) });
    const out = await discoverLogicalHedges(PAIR);
    expect(out).toEqual([]);
  });

  it('rejects a hedge referencing an unknown market', async () => {
    llmChat.mockResolvedValueOnce({ content: hedgeJson(0.95, 'A', 'GHOST') });
    const out = await discoverLogicalHedges(PAIR);
    expect(out).toEqual([]);
  });

  it('strips ```json fences before parsing', async () => {
    llmChat.mockResolvedValueOnce({ content: '```json\n' + hedgeJson(0.95) + '\n```' });
    const out = await discoverLogicalHedges(PAIR);
    expect(out.length).toBe(1);
  });

  it('returns [] when the LLM response is not valid JSON', async () => {
    llmChat.mockResolvedValueOnce({ content: 'not json at all' });
    const out = await discoverLogicalHedges(PAIR);
    expect(out).toEqual([]);
    expect(redisSetex).toHaveBeenCalledTimes(1); // still caches the empty result
  });

  it('returns [] when the LLM throws (batch failure is swallowed)', async () => {
    llmChat.mockRejectedValueOnce(new Error('network down'));
    const out = await discoverLogicalHedges(PAIR);
    expect(out).toEqual([]);
  });

  it('sorts by confidence desc, then expectedEdge desc', async () => {
    llmChat.mockResolvedValueOnce({
      content: JSON.stringify([
        { marketA_title: 'A', marketB_title: 'B', confidence: 0.95 },
        { marketA_title: 'A', marketB_title: 'B', confidence: 0.95 },
        { marketA_title: 'A', marketB_title: 'B', confidence: 0.90 },
      ]),
    });
    // All three share the same market pair; sort must still run and keep order stable by edge
    const out = await discoverLogicalHedges(PAIR);
    expect(out.map(h => h.confidence)).toEqual([0.95, 0.95, 0.90]);
  });

  it('sorts equal-confidence hedges by expectedEdge desc', async () => {
    const markets = [mkMarket('A', 'a', 0.6), mkMarket('B', 'b', 0.4), mkMarket('C', 'c', 0.1)];
    llmChat.mockResolvedValueOnce({
      content: JSON.stringify([
        { marketA_title: 'A', marketB_title: 'B', confidence: 0.95 }, // edge 0.2
        { marketA_title: 'A', marketB_title: 'C', confidence: 0.95 }, // edge 0.5
      ]),
    });
    const out = await discoverLogicalHedges(markets);
    expect(out[0]!.marketB.title).toBe('C');
    expect(out[1]!.marketB.title).toBe('B');
  });

  it('batches markets into groups of 10 (25 -> 3 LLM calls)', async () => {
    const markets = Array.from({ length: 25 }, (_, i) => mkMarket(`M${i}`, `m${i}`, 0.5));
    llmChat
      .mockResolvedValueOnce({ content: '[]' })
      .mockResolvedValueOnce({ content: '[]' })
      .mockResolvedValueOnce({ content: '[]' });

    expect(await discoverLogicalHedges(markets)).toEqual([]);
    expect(llmChat).toHaveBeenCalledTimes(3);
  });

  it('survives a cache read failure and falls back to the LLM', async () => {
    redisGet.mockRejectedValueOnce(new Error('redis down'));
    llmChat.mockResolvedValueOnce({ content: hedgeJson(0.95) });

    const out = await discoverLogicalHedges(PAIR);
    expect(out.length).toBe(1);
  });

  it('survives a cache write failure (result still returned)', async () => {
    redisSetex.mockRejectedValueOnce(new Error('redis write down'));
    llmChat.mockResolvedValueOnce({ content: hedgeJson(0.95) });

    const out = await discoverLogicalHedges(PAIR);
    expect(out.length).toBe(1);
  });
});