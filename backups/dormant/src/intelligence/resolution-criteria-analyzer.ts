/**
 * Resolution Criteria Analyzer
 * Reads Polymarket market resolution criteria and flags "trick questions" or
 * ambiguous wording that could cause unexpected resolution outcomes.
 * Cache results in memory (1h TTL) to avoid repeated LLM calls per market.
 */

import { loadLlmConfig } from '../config/llm-config';
import { logger } from '../utils/logger';

export interface MarketInput {
  id: string;
  title: string;
  description: string;
  resolutionSource: string;
}

export interface ResolutionAnalysis {
  marketId: string;
  title: string;
  resolutionSource: string;
  deadlineDate: string | null;   // ISO date extracted from criteria
  ambiguityScore: number;        // 0=crystal clear, 1=very ambiguous
  risks: string[];
  recommendation: 'SAFE' | 'CAUTION' | 'AVOID';
  reasoning: string;
}

// ─── Cache ────────────────────────────────────────────────────────────────────

const analysisCache = new Map<string, { analysis: ResolutionAnalysis; expiresAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1_000;

function getCached(id: string): ResolutionAnalysis | null {
  const entry = analysisCache.get(id);
  if (!entry || Date.now() > entry.expiresAt) { analysisCache.delete(id); return null; }
  return entry.analysis;
}
function setCache(id: string, analysis: ResolutionAnalysis): void {
  analysisCache.set(id, { analysis, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a Polymarket resolution criteria analyst. Detect ambiguous, trick, or unusual resolution conditions.

Respond ONLY with valid JSON. No markdown, no code blocks.

JSON schema:
{
  "ambiguityScore": number (0.0=crystal clear, 1.0=very ambiguous),
  "risks": string[],
  "recommendation": "SAFE" | "CAUTION" | "AVOID",
  "reasoning": string (1-3 sentences),
  "deadlineDate": string | null (ISO date or null)
}`;

function buildPrompt(m: MarketInput): string {
  return `Analyze this Polymarket market's resolution criteria:

Title: ${m.title}
Description: ${m.description || '(none provided)'}
Resolution Source: ${m.resolutionSource || '(none provided)'}

Identify:
1. Is the resolution criteria clear and unambiguous?
2. Are there "trick" conditions? (date cutoffs, narrow scope, unusual definitions)
3. Is the resolution source reliable and well-defined?
4. Could this market resolve unexpectedly NO even if the event occurs?

Flag: subjective criteria, multiple interpretations, tight deadlines, unusual oracles.

Respond with JSON only.`;
}

// ─── LLM Call ─────────────────────────────────────────────────────────────────

async function callLlm(prompt: string, url: string, model: string): Promise<string> {
  const resp = await fetch(`${url}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 512,
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!resp.ok) throw new Error(`LLM API error: HTTP ${resp.status}`);
  const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? '';
}

// ─── Parse ────────────────────────────────────────────────────────────────────

function parseResponse(raw: string, m: MarketInput): ResolutionAnalysis {
  const fallback = (reason: string): ResolutionAnalysis => ({
    marketId: m.id, title: m.title, resolutionSource: m.resolutionSource,
    deadlineDate: null, ambiguityScore: 0.5, risks: ['parse-error'],
    recommendation: 'CAUTION', reasoning: reason,
  });

  try {
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const p = JSON.parse(cleaned) as Record<string, unknown>;

    const score = typeof p.ambiguityScore === 'number' ? Math.max(0, Math.min(1, p.ambiguityScore)) : 0.5;
    const rec = p.recommendation;
    const recommendation: ResolutionAnalysis['recommendation'] =
      rec === 'SAFE' || rec === 'CAUTION' || rec === 'AVOID' ? rec : 'CAUTION';

    return {
      marketId: m.id, title: m.title, resolutionSource: m.resolutionSource,
      deadlineDate: typeof p.deadlineDate === 'string' ? p.deadlineDate : null,
      ambiguityScore: score,
      risks: Array.isArray(p.risks) ? p.risks.filter((r): r is string => typeof r === 'string') : [],
      recommendation,
      reasoning: typeof p.reasoning === 'string' ? p.reasoning : 'Could not parse AI reasoning',
    };
  } catch (err) {
    logger.warn('[ResolutionAnalyzer] Parse failed', { marketId: m.id, raw, err });
    return fallback('AI response parse error — treating as CAUTION');
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Analyze a single market's resolution criteria. Caches result for 1h. */
export async function analyzeResolutionCriteria(market: MarketInput): Promise<ResolutionAnalysis> {
  const cached = getCached(market.id);
  if (cached) { logger.debug('[ResolutionAnalyzer] Cache hit', { marketId: market.id }); return cached; }

  const { primary } = loadLlmConfig();

  try {
    logger.debug('[ResolutionAnalyzer] Analyzing', { marketId: market.id, title: market.title });
    const raw = await callLlm(buildPrompt(market), primary.url, primary.model);
    const analysis = parseResponse(raw, market);
    setCache(market.id, analysis);

    logger.info('[ResolutionAnalyzer] Done', {
      marketId: market.id,
      recommendation: analysis.recommendation,
      ambiguityScore: analysis.ambiguityScore,
      risks: analysis.risks,
    });
    return analysis;
  } catch (err) {
    logger.error('[ResolutionAnalyzer] LLM call failed', { marketId: market.id, err });
    return {
      marketId: market.id, title: market.title, resolutionSource: market.resolutionSource,
      deadlineDate: null, ambiguityScore: 0.5, risks: ['llm-unavailable'],
      recommendation: 'CAUTION', reasoning: 'AI analysis unavailable — treating as CAUTION for safety',
    };
  }
}

/** Analyze multiple markets sequentially to avoid LLM overload. Cache-aware. */
export async function batchAnalyzeMarkets(markets: MarketInput[]): Promise<ResolutionAnalysis[]> {
  const results: ResolutionAnalysis[] = [];
  for (const market of markets) {
    results.push(await analyzeResolutionCriteria(market));
  }
  return results;
}

/**
 * Gate check for paper trading orchestrator.
 * Returns true if SAFE, or CAUTION with ambiguity < 0.3.
 */
export function isMarketSafe(analysis: ResolutionAnalysis): boolean {
  if (analysis.recommendation === 'SAFE') return true;
  if (analysis.recommendation === 'CAUTION' && analysis.ambiguityScore < 0.3) return true;
  return false;
}
