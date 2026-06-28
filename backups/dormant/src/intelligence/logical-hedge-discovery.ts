/** Logical Hedge Discovery — DeepSeek finds pairs where one outcome LOGICALLY NECESSITATES another. Cache: 2h. */

import crypto from 'crypto';
import { loadLlmConfig } from '../config/llm-config';
import { getRedisClient } from '../redis/index';
import { logger } from '../utils/logger';

export type HedgeTier = 'T1' | 'T2' | 'T3'; // T1: >=95%, T2: 90-95%, T3: 85-90%

export interface MarketInput {
  id: string;
  title: string;
  description?: string;
  yesPrice: number;
}

export interface LogicalHedge {
  marketA: { id: string; title: string; yesPrice: number };
  marketB: { id: string; title: string; yesPrice: number };
  implication: string;      // "If A=YES then B=YES (necessary)"
  contrapositive: string;   // "If B=NO then A=NO"
  tier: HedgeTier;
  confidence: number;
  hedgeStrategy: string;
  expectedEdge: number;
}

const BATCH_SIZE = 10;
const CACHE_TTL_SECONDS = 7200; // 2h
const CACHE_PREFIX = 'hedge:logical:';
const DEEPSEEK_TIMEOUT_MS = 90_000;
const MIN_CONFIDENCE = 0.85;

const SYSTEM_PROMPT = `You are a prediction market logic analyst. Find pairs where one outcome LOGICALLY NECESSITATES another.
Only accept NECESSARY implications — A implies B means A=YES and B=NO is IMPOSSIBLE simultaneously.
Valid: "Trump wins presidency" → "Trump wins Republican nomination". Invalid: "Fed raises rates" → "USD strengthens" (probable not necessary).
Respond ONLY with a JSON array: [{"marketA_title":string,"marketB_title":string,"implication":string,"contrapositive":string,"confidence":number}]
Only include confidence >= 0.85. Output [] if none. Output nothing else.`;


function batchCacheKey(marketIds: string[]): string {
  const sorted = [...marketIds].sort().join(',');
  const hash = crypto.createHash('sha256').update(sorted).digest('hex').slice(0, 16);
  return `${CACHE_PREFIX}${hash}`;
}

async function getCache(key: string): Promise<LogicalHedge[] | null> {
  try {
    const redis = getRedisClient();
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as LogicalHedge[]) : null;
  } catch {
    return null;
  }
}

async function setCache(key: string, hedges: LogicalHedge[]): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.setex(key, CACHE_TTL_SECONDS, JSON.stringify(hedges));
  } catch (err) {
    logger.warn('[LogicalHedge] Cache write failed', { err });
  }
}


interface RawHedgeItem {
  marketA_title?: string;
  marketB_title?: string;
  implication?: string;
  contrapositive?: string;
  confidence?: number;
}

async function callDeepSeek(markets: MarketInput[], llmUrl: string, llmModel: string): Promise<RawHedgeItem[]> {
  const userContent = markets
    .map((m, i) => `${i + 1}. "${m.title}" (yesPrice=${m.yesPrice.toFixed(3)})`)
    .join('\n');

  const resp = await fetch(`${llmUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: llmModel,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Find logical necessity pairs:\n\n${userContent}` },
      ],
      temperature: 0.05,
      max_tokens: 1024,
    }),
    signal: AbortSignal.timeout(DEEPSEEK_TIMEOUT_MS),
  });

  if (!resp.ok) throw new Error(`LLM HTTP ${resp.status}`);

  const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
  const raw = (data.choices?.[0]?.message?.content ?? '[]')
    .replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  try {
    return JSON.parse(raw) as RawHedgeItem[];
  } catch {
    logger.warn('[LogicalHedge] JSON parse failed', { raw: raw.slice(0, 200) });
    return [];
  }
}


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

  const mA = markets.find(m => m.title === raw.marketA_title);
  const mB = markets.find(m => m.title === raw.marketB_title);
  if (!mA || !mB || !raw.implication || !raw.contrapositive) return null;

  // If A→B (necessary): A.yesPrice should be <= B.yesPrice
  // Spread violation = A.yes - B.yes when positive = exploitable edge
  const priceDivergence = mA.yesPrice - mB.yesPrice;
  const expectedEdge = Math.max(0, priceDivergence);

  const hedgeStrategy = priceDivergence > 0
    ? `Short A YES (${mA.yesPrice.toFixed(3)}) + Long B YES (${mB.yesPrice.toFixed(3)}) — converge to logic`
    : `Long A YES (${mA.yesPrice.toFixed(3)}) + Short B NO (${(1 - mB.yesPrice).toFixed(3)}) — carry hedge`;

  return {
    marketA: { id: mA.id, title: mA.title, yesPrice: mA.yesPrice },
    marketB: { id: mB.id, title: mB.title, yesPrice: mB.yesPrice },
    implication: raw.implication,
    contrapositive: raw.contrapositive,
    tier,
    confidence,
    hedgeStrategy,
    expectedEdge,
  };
}

/** Discover logical hedge pairs. Batches markets into groups of 10. Results cached 2h. */
export async function discoverLogicalHedges(markets: MarketInput[]): Promise<LogicalHedge[]> {
  if (markets.length < 2) return [];

  const cacheKey = batchCacheKey(markets.map(m => m.id));
  const cached = await getCache(cacheKey);
  if (cached) {
    logger.info(`[LogicalHedge] Cache HIT — ${cached.length} hedges`);
    return cached;
  }

  const { url, model } = loadLlmConfig().primary;

  const batches: MarketInput[][] = [];
  for (let i = 0; i < markets.length; i += BATCH_SIZE) {
    batches.push(markets.slice(i, i + BATCH_SIZE));
  }

  logger.info(`[LogicalHedge] Scanning ${markets.length} markets in ${batches.length} batches`);

  const hedges: LogicalHedge[] = [];
  for (const batch of batches) {
    try {
      const rawItems = await callDeepSeek(batch, url, model);
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
