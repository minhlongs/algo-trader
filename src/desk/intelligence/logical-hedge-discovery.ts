/**
 * Logical Hedge Discovery — DeepSeek finds pairs where one outcome LOGICALLY NECESSITATES another. Cache: 2h.
 */

import crypto from 'crypto';
import { LlmRouter, ChatMessage } from '../../lib/llm-router';
import { getRedisClient } from '../../redis/index';
import { logger } from '../../shared/utils/logger';

export type HedgeTier = 'T1' | 'T2' | 'T3'; // T1: >=95%, T2: 90-95%, T3: 85-90%

export interface MarketInput {
  id: string;
  title: string;
  description?: string;
  yesPrice: number;
}

export interface LogicalHedge {
  id: string;
  marketA: { id: string; title: string; yesPrice: number };
  marketB: { id: string; title: string; yesPrice: number };
  implication: string;
  contrapositive: string;
  confidence: number;
  tier: HedgeTier;
  expectedEdge: number;
  hedgeStrategy: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BATCH_SIZE = 10;
const MIN_CONFIDENCE = 0.85;
const DEEPSEEK_TIMEOUT_MS = 120_000;
const CACHE_TTL_SECONDS = 2 * 60 * 60;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a prediction market analyst specializing in logical implications between binary markets.

For each market, determine if there exists another market in the list where one outcome LOGICALLY NECESSITATES the other.

Example: "Bitcoin > $100k by 2025" => "Recession in 2025" (high BTC often precedes recession).
Brighter example: "Fed raises rates in September" => "USD strengthens in Q4" (rate hikes typically strengthen USD).

Respond ONLY with JSON. No markdown, no code blocks.

Schema:
[{
  "marketA_title": string,
  "marketB_title": string,
  "implication": string,
  "contrapositive": string,
  "confidence": number (0-1)
}]`;

function batchCacheKey(marketIds: string[]): string {
  const sorted = marketIds.sort().join(',');
  return crypto.createHash('sha256').update(sorted).digest('hex');
}

async function getRedis(): Promise<ReturnType<typeof getRedisClient>> {
  return getRedisClient();
}

async function getCache(key: string): Promise<LogicalHedge[] | null> {
  try {
    const redis = await getRedis();
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as LogicalHedge[]) : null;
  } catch (err) {
    logger.warn('[LogicalHedge] Cache read failed', { err });
    return null;
  }
}

async function setCache(key: string, hedges: LogicalHedge[]): Promise<void> {
  try {
    const redis = await getRedis();
    await redis.setex(key, CACHE_TTL_SECONDS, JSON.stringify(hedges));
  } catch (err) {
    logger.warn('[LogicalHedge] Cache write failed', { err });
  }
}

// ---------------------------------------------------------------------------
// LLM call via LlmRouter
// ---------------------------------------------------------------------------

interface RawHedgeItem {
  marketA_title?: string;
  marketB_title?: string;
  implication?: string;
  contrapositive?: string;
  confidence?: number;
}

async function callDeepSeek(markets: MarketInput[]): Promise<RawHedgeItem[]> {
  const router = new LlmRouter();
  const userContent = markets
    .map((m, i) => `${i + 1}. "${m.title}" (yesPrice=${m.yesPrice.toFixed(3)})`)
    .join('\n');

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Find logical necessity pairs:\n\n${userContent}` },
  ];

  const response = await router.chat({
    messages,
    temperature: 0.05,
    maxTokens: 1024,
  });

  const raw = response.content
    .replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  try {
    return JSON.parse(raw) as RawHedgeItem[];
  } catch {
    logger.warn('[LogicalHedge] JSON parse failed', { raw: raw.slice(0, 200) });
    return [];
  }
}

// ---------------------------------------------------------------------------
// Build hedge
// ---------------------------------------------------------------------------

function classifyTier(confidence: number): HedgeTier | null {
  if (confidence >= 0.95) return 'T1';
  if (confidence >= 0.90) return 'T2';
  if (confidence >= 0.85) return 'T3';
  return null;
}

function buildHedge(raw: RawHedgeItem, markets: MarketInput[]): LogicalHedge | null {
  const confidence = raw.confidence ?? 0;
  const tier = classifyTier(confidence);
  if (!tier) return null;

  const titleA = raw.marketA_title ?? '';
  const titleB = raw.marketB_title ?? '';
  const marketA = markets.find(m => m.title === titleA);
  const marketB = markets.find(m => m.title === titleB);
  if (!marketA || !marketB) return null;

  const edge = Math.max(0, marketA.yesPrice - marketB.yesPrice);
  const hedgeStrategy = 'logical-necessity';
  const id = crypto.createHash('md5').update(`${marketA.id}:${marketB.id}:${Date.now()}`).digest('hex');

  return {
    id,
    marketA: { id: marketA.id, title: marketA.title, yesPrice: marketA.yesPrice },
    marketB: { id: marketB.id, title: marketB.title, yesPrice: marketB.yesPrice },
    implication: raw.implication ?? 'Unknown implication',
    contrapositive: raw.contrapositive ?? 'Unknown contrapositive',
    confidence,
    tier,
    expectedEdge: edge,
    hedgeStrategy,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Discover logical hedge pairs. Batches markets into groups of 10. Results cached 2h. */
export async function discoverLogicalHedges(markets: MarketInput[]): Promise<LogicalHedge[]> {
  if (markets.length < 2) return [];

  const cacheKey = batchCacheKey(markets.map(m => m.id));
  const cached = await getCache(cacheKey);
  if (cached) {
    logger.info(`[LogicalHedge] Cache HIT — ${cached.length} hedges`);
    return cached;
  }

  const batches: MarketInput[][] = [];
  for (let i = 0; i < markets.length; i += BATCH_SIZE) {
    batches.push(markets.slice(i, i + BATCH_SIZE));
  }

  logger.info(`[LogicalHedge] Scanning ${markets.length} markets in ${batches.length} batches`);

  const hedges: LogicalHedge[] = [];
  for (const batch of batches) {
    try {
      const rawItems = await callDeepSeek(batch);
      for (const raw of rawItems) {
        const hedge = buildHedge(raw, batch);
        if (hedge && hedge.confidence >= MIN_CONFIDENCE) {
          hedges.push(hedge);
        }
      }
    } catch (err) {
      logger.warn('[LogicalHedge] Batch failed, skipping', { err });
    }
  }

  hedges.sort((a, b) => b.confidence - a.confidence || b.expectedEdge - a.expectedEdge);
  await setCache(cacheKey, hedges);
  logger.info(`[LogicalHedge] Discovered ${hedges.length} logical hedges`);
  return hedges;
}
