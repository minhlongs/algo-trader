/**
 * Unit tests for Signal Validator and submodules (cache, aggregate, prompts, gpu-mutex)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  validateSignal,
  getUnifiedValidation,
  type SignalCandidate,
} from '../../../src/desk/intelligence/signal-validator';
import {
  getSemanticCacheKey,
  getCachedValidation,
  cacheValidation,
  localMemoryCache,
  SEMANTIC_CACHE_TTL,
} from '../../../src/desk/intelligence/signal-validator-cache';
import {
  parseCombinedResponse,
  verifyAndAggregateVotes,
} from '../../../src/desk/intelligence/signal-validator-aggregate';
import {
  getCombinedSystemPrompt,
  buildCombinedUserPrompt,
} from '../../../src/desk/intelligence/signal-validator-prompts';
import { GpuMutex } from '../../../src/desk/intelligence/signal-validator-gpu-mutex';
import * as redisModule from '../../../src/desk/redis/index';

vi.mock('../../../src/lib/llm-router', () => ({
  LlmRouter: class MockLlmRouter {
    chat = vi.fn().mockRejectedValue(new Error('LLM service unavailable in test'));
    fastChat = vi.fn().mockRejectedValue(new Error('LLM service unavailable in test'));
    qwenChat = vi.fn().mockRejectedValue(new Error('LLM service unavailable in test'));
    getConfig = vi.fn().mockReturnValue({ primary: { model: 'mock-model' } });
  },
}));

const sampleSignal: SignalCandidate = {
  signalType: 'cross-market-arbitrage',
  expectedEdge: 0.08,
  reasoning: 'Implied probability difference between correlated elections exceeds spread',
  markets: [
    { id: 'm1', title: 'Market 1', yesPrice: 0.55, noPrice: 0.45 },
    { id: 'm2', title: 'Market 2', yesPrice: 0.40, noPrice: 0.60 },
  ],
};

describe('Signal Validator Submodules', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    localMemoryCache.clear();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('signal-validator-prompts', () => {
    it('generates standard 3-persona system prompt when SWARM_QWEN_ENABLED is not true', () => {
      delete process.env.SWARM_QWEN_ENABLED;
      const prompt = getCombinedSystemPrompt();
      expect(prompt).toContain('risk-analyst');
      expect(prompt).toContain('momentum-trader');
      expect(prompt).toContain('contrarian');
      expect(prompt).not.toContain('quantitative-analyst');
    });

    it('generates 4-persona system prompt when SWARM_QWEN_ENABLED=true', () => {
      process.env.SWARM_QWEN_ENABLED = 'true';
      const prompt = getCombinedSystemPrompt();
      expect(prompt).toContain('quantitative-analyst');
    });

    it('builds user prompt formatting market lines and edge', () => {
      const userPrompt = buildCombinedUserPrompt(sampleSignal);
      expect(userPrompt).toContain('cross-market-arbitrage');
      expect(userPrompt).toContain('8.00%');
      expect(userPrompt).toContain('Market 1 (id=m1) YES=0.550 NO=0.450');
      expect(userPrompt).toContain('Market 2 (id=m2) YES=0.400 NO=0.600');
    });
  });

  describe('signal-validator-aggregate', () => {
    it('parses raw markdown JSON string correctly', () => {
      const raw = `Some preamble
\`\`\`json
{
  "reasoning": "Solid edge across markets",
  "votes": [
    { "persona": "risk-analyst", "vote": "APPROVE", "confidence": 0.8, "reasoning": "Good liquidity" }
  ],
  "risks": ["execution slippage"]
}
\`\`\`
trailing notes`;

      const parsed = parseCombinedResponse(raw);
      expect(parsed.reasoning).toBe('Solid edge across markets');
      expect(parsed.votes).toHaveLength(1);
      expect(parsed.risks).toEqual(['execution slippage']);
    });

    it('returns empty object when JSON is completely invalid', () => {
      const parsed = parseCombinedResponse('totally broken text without json');
      expect(parsed).toEqual({});
    });

    it('aggregates votes and determines consensus and dissent', () => {
      const parsedJson = {
        reasoning: 'Strong consensus',
        votes: [
          { persona: 'risk-analyst', vote: 'APPROVE', confidence: 0.9, reasoning: 'Low risk' },
          { persona: 'momentum-trader', vote: 'APPROVE', confidence: 0.8, reasoning: 'Strong volume' },
          { persona: 'contrarian', vote: 'REJECT', confidence: 0.6, reasoning: 'Crowded trade' },
        ],
        risks: ['crowding'],
      };

      // 2 approvals out of 3 meets threshold (floor(3/2)+1 = 2)
      // avg confidence of approvals = (0.9 + 0.8) / 2 = 0.85 >= 0.6
      const result = verifyAndAggregateVotes(parsedJson as any, 0.6);
      expect(result.valid).toBe(true);
      expect(result.confidence).toBeCloseTo(0.85);
      expect(result.dissent).toBe('contrarian: Crowded trade');
      expect(result.votes).toHaveLength(3);
      expect(result.risks).toEqual(['crowding']);
    });

    it('marks signal invalid when approval threshold is not met', () => {
      const parsedJson = {
        votes: [
          { persona: 'risk-analyst', vote: 'REJECT', confidence: 0.8, reasoning: 'Illiquid' },
          { persona: 'momentum-trader', vote: 'REJECT', confidence: 0.7, reasoning: 'Flat momentum' },
          { persona: 'contrarian', vote: 'APPROVE', confidence: 0.5, reasoning: 'Hidden edge' },
        ],
      };

      const result = verifyAndAggregateVotes(parsedJson as any, 0.6);
      expect(result.valid).toBe(false);
      expect(result.dissent).toBe('contrarian: Hidden edge');
    });

    it('normalizes invalid confidence numbers and handles empty votes', () => {
      const emptyResult = verifyAndAggregateVotes({}, 0.6);
      expect(emptyResult.valid).toBe(false);
      expect(emptyResult.confidence).toBe(0);
      expect(emptyResult.dissent).toBeNull();
      expect(emptyResult.reasoning).toBe('Aggregated consensus decision');

      const abnormalVotes = {
        votes: [
          { persona: 'risk-analyst', vote: 'APPROVE', confidence: 10, reasoning: null },
          { persona: 'momentum-trader', vote: 'APPROVE', confidence: -5 },
        ],
      };
      const clampedResult = verifyAndAggregateVotes(abnormalVotes as any, 0.5);
      expect(clampedResult.votes[0].confidence).toBe(1);
      expect(clampedResult.votes[1].confidence).toBe(0);
      expect(clampedResult.votes[0].reasoning).toBe('No reasoning provided');
    });
  });

  describe('signal-validator-gpu-mutex', () => {
    it('executes tasks serially without race conditions', async () => {
      const mutex = new GpuMutex();
      const executionOrder: number[] = [];

      const task1 = () =>
        new Promise<number>((resolve) => {
          setTimeout(() => {
            executionOrder.push(1);
            resolve(1);
          }, 30);
        });

      const task2 = () =>
        new Promise<number>((resolve) => {
          setTimeout(() => {
            executionOrder.push(2);
            resolve(2);
          }, 10);
        });

      const [res1, res2] = await Promise.all([mutex.run(task1), mutex.run(task2)]);
      expect(res1).toBe(1);
      expect(res2).toBe(2);
      expect(executionOrder).toEqual([1, 2]);
    });

    it('propagates task errors without stalling the queue', async () => {
      const mutex = new GpuMutex();
      const failTask = () => Promise.reject(new Error('GPU OOM'));
      const successTask = () => Promise.resolve('ok');

      await expect(mutex.run(failTask)).rejects.toThrow('GPU OOM');
      const nextResult = await mutex.run(successTask);
      expect(nextResult).toBe('ok');
    });
  });

  describe('signal-validator-cache', () => {
    it('generates consistent deterministic cache keys with sorted market IDs', () => {
      const key1 = getSemanticCacheKey(sampleSignal);
      const signalReordered: SignalCandidate = {
        ...sampleSignal,
        markets: [sampleSignal.markets[1], sampleSignal.markets[0]],
      };
      const key2 = getSemanticCacheKey(signalReordered);
      expect(key1).toBe(key2);
      expect(key1).toContain('semantic-cache:signal:cross-market-arbitrage:');
    });

    it('reads and writes to Redis cache when available', async () => {
      const cachedVal = {
        valid: true,
        confidence: 0.9,
        reasoning: 'Redis cached verdict',
        risks: [],
        votes: [],
        consensusConfidence: 0.9,
        dissent: null,
      };

      const mockRedis = {
        get: vi.fn().mockResolvedValue(JSON.stringify(cachedVal)),
        setex: vi.fn().mockResolvedValue('OK'),
      };
      vi.spyOn(redisModule, 'getRedisClient').mockReturnValue(mockRedis as any);

      const hit = await getCachedValidation(sampleSignal);
      expect(hit).toEqual(cachedVal);
      expect(mockRedis.get).toHaveBeenCalled();

      await cacheValidation(sampleSignal, cachedVal);
      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.any(String),
        SEMANTIC_CACHE_TTL,
        JSON.stringify(cachedVal),
      );
    });

    it('falls back to local memory cache when Redis throws or misses', async () => {
      const mockRedis = {
        get: vi.fn().mockRejectedValue(new Error('Redis connection refused')),
        setex: vi.fn().mockRejectedValue(new Error('Redis connection refused')),
      };
      vi.spyOn(redisModule, 'getRedisClient').mockReturnValue(mockRedis as any);

      // Cache miss initially
      const miss = await getCachedValidation(sampleSignal);
      expect(miss).toBeNull();

      const memoryVal = {
        valid: true,
        confidence: 0.85,
        reasoning: 'Memory cached verdict',
        risks: ['volatility'],
        votes: [],
        consensusConfidence: 0.85,
        dissent: null,
      };

      await cacheValidation(sampleSignal, memoryVal);

      // Second check should hit in-memory
      const memoryHit = await getCachedValidation(sampleSignal);
      expect(memoryHit).toEqual(memoryVal);
    });

    it('prunes expired items in local memory cache', async () => {
      const mockRedis = {
        get: vi.fn().mockResolvedValue(null),
        setex: vi.fn().mockResolvedValue('OK'),
      };
      vi.spyOn(redisModule, 'getRedisClient').mockReturnValue(mockRedis as any);

      const expiredVal = {
        valid: false,
        confidence: 0,
        reasoning: 'Expired',
        risks: [],
        votes: [],
        consensusConfidence: 0,
        dissent: null,
      };

      const key = getSemanticCacheKey(sampleSignal);
      localMemoryCache.set(key, { value: expiredVal, expires: Date.now() - 5000 });

      const res = await getCachedValidation(sampleSignal);
      expect(res).toBeNull();
      expect(localMemoryCache.has(key)).toBe(false);
    });

    it('prunes local memory cache when size exceeds 1000 items', async () => {
      const mockRedis = {
        get: vi.fn().mockResolvedValue(null),
        setex: vi.fn().mockResolvedValue('OK'),
      };
      vi.spyOn(redisModule, 'getRedisClient').mockReturnValue(mockRedis as any);

      // Populate localMemoryCache with 1001 items
      for (let i = 0; i < 1002; i++) {
        const testSignal: SignalCandidate = {
          ...sampleSignal,
          signalType: `sig-${i}`,
        };
        await cacheValidation(testSignal, {
          valid: true,
          confidence: 0.8,
          reasoning: `r-${i}`,
          risks: [],
          votes: [],
          consensusConfidence: 0.8,
          dissent: null,
        });
      }

      expect(localMemoryCache.size).toBeLessThanOrEqual(1001);
    });
  });

  describe('signal-validator facade', () => {
    it('returns cached verdict immediately if available', async () => {
      const cachedVal = {
        valid: true,
        confidence: 0.95,
        reasoning: 'Cached valid signal',
        risks: [],
        votes: [],
        consensusConfidence: 0.95,
        dissent: null,
      };

      const mockRedis = {
        get: vi.fn().mockResolvedValue(JSON.stringify(cachedVal)),
        setex: vi.fn(),
      };
      vi.spyOn(redisModule, 'getRedisClient').mockReturnValue(mockRedis as any);

      const res = await validateSignal(sampleSignal);
      expect(res.valid).toBe(true);
      expect(res.confidence).toBe(0.95);
      expect(res.reasoning).toBe('Cached valid signal');
    });

    it('fails closed when LLM fails all retries', async () => {
      const mockRedis = {
        get: vi.fn().mockResolvedValue(null),
        setex: vi.fn(),
      };
      vi.spyOn(redisModule, 'getRedisClient').mockReturnValue(mockRedis as any);

      // Force failure in getUnifiedValidation by corrupting or disabling LLM
      const res = await getUnifiedValidation({
        ...sampleSignal,
        signalType: 'uncached-failing-signal',
      });

      expect(res.valid).toBe(false);
      expect(res.confidence).toBe(0);
      expect(res.reasoning).toContain('AI validation and swarm services unavailable');
      expect(res.risks).toContain('llm-unavailable');
    });
  });
});
