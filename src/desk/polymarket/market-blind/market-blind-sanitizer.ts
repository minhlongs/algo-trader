/**
 * Market-Blind Context Sanitizer (IC Report Strategy 6 & Agent #3).
 *
 * Eliminates market-price / implied-probability / orderbook / crowd anchoring,
 * enforces strict per-document and total context character caps, and blocks
 * hindcast-contaminated evaluations on or before model cutoff.
 */

import { createHash } from 'node:crypto';
import {
  DEFAULT_SANITIZER_CONFIG,
  MarketBlindError,
  type MarketBlindDocumentInput,
  type MarketBlindSanitizerConfig,
  type SanitizedMarketBlindContext,
  type SanitizedMarketBlindDocument,
} from './market-blind-types';

const REDACTION_TOKEN = '[REDACTED_MARKET_ANCHOR]';
const MAX_ANCHOR_SPAN_SLACK = 320;
const MAX_SANITIZED_DOCUMENTS = 128;

const FORBIDDEN_NORMALIZED_KEYS = new Set<string>([
  'midprice', 'bestbid', 'bestask', 'lasttradeprice', 'marketprice',
  'yesprice', 'noprice', 'impliedprob', 'impliedprobability', 'impliedodds',
  'odds', 'orderbook', 'bids', 'asks', 'crowdprob', 'crowdprobability',
  'crowddistribution', 'crowdcommentary', 'marketcommentary', 'polymarketprice',
  'polymarketodds', 'kalshiprice', 'kalshiodds', 'metaculusprob', 'manifoldprob',
  'outcomeprices', 'volume', 'volume24hr', 'liquidity', 'spread', 'clobspread', 'vwap',
]);

const INLINE_LEAKAGE_PATTERNS: ReadonlyArray<{ label: string; regex: RegExp }> = [
  { label: 'venue-price-or-odds', regex: /\b(?:polymarket|kalshi|predictit|manifold|metaculus)\b[\s\S]{0,80}?(?:\d+(?:\.\d+)?\s*(?:%|¢|cents?\b)|\$?0\.\d+\b)(?:\s+chance\b)?/gi },
  { label: 'trading-at-quote', regex: /\btrading\s+at\s+\$?\d+(?:\.\d+)?\s*(?:¢|%|cents?\b)?/gi },
  { label: 'share-cents-quote', regex: /\b\d+(?:\.\d+)?\s*¢/g },
  { label: 'implied-or-crowd-odds', regex: /\b(?:market|implied|crowd|consensus)\s+(?:odds|prob(?:ability)?|forecast)\b[\s\S]{0,60}?(?:\d+(?:\.\d+)?\s*(?:%|¢)?|\$?0\.\d+\b)/gi },
  { label: 'clob-quote-level', regex: /\b(?:best\s+(?:ask|bid)|(?:mid|yes|no|last\s+trade|market)\s*price)\b[\s:=]*\$?\d+(?:\.\d+)?%?/gi },
  { label: 'serialized-anchor-field', regex: /["']?(?:midPrice|bestBid|bestAsk|lastTradePrice|marketPrice|yesPrice|noPrice|impliedProb(?:ability)?|crowdProb(?:ability)?|polymarketPrice|outcomePrices|orderbook|orderBook)["']?\s*[:=]\s*(?:\[[^\]]*\]|\{[^}]*\}|["']?\$?\d+(?:\.\d+)?%?["']?)/gi },
  { label: 'orderbook-commentary', regex: /\border\s*book\b[\s\S]{0,80}?\d+(?:\.\d+)?/gi },
];

const INDEPENDENT_PROBE_PATTERNS: ReadonlyArray<{ label: string; regex: RegExp }> = [
  { label: 'cents-token', regex: /\d\s*¢/ },
  { label: 'venue-proximity-quote', regex: /\b(?:polymarket|kalshi|predictit|manifold|metaculus)\b[\s\S]{0,80}?(?:\d\s*(?:%|¢|cents?\b)|\$?0\.\d+)/i },
  { label: 'quote-field-token', regex: /\b(?:best\s*(?:bid|ask)|(?:mid|yes|no|market|last\s*trade)\s*price|implied\s*(?:odds|prob)|crowd\s*(?:odds|prob)|outcomePrices|midPrice|bestBid|bestAsk)\b[\s\S]{0,30}?\d/i },
];

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Scrubs inline market-price, odds, orderbook, and crowd-probability leakage spans. */
export function scrubMarketAnchors(text: string): string {
  let current = text;
  for (let pass = 0; pass < 3; pass += 1) {
    let next = current;
    for (const { regex } of INLINE_LEAKAGE_PATTERNS) {
      next = next.replace(new RegExp(regex.source, regex.flags), REDACTION_TOKEN);
    }
    if (next === current) break;
    current = next;
  }
  return current;
}

/** Hard-blocks if any unredacted market-price or implied-odds leakage token remains. */
export function assertMarketBlindClean(text: string): void {
  for (const { label, regex } of [...INLINE_LEAKAGE_PATTERNS, ...INDEPENDENT_PROBE_PATTERNS]) {
    const match = new RegExp(regex.source, regex.flags.replace('g', '')).exec(text);
    if (match) {
      throw new MarketBlindError(
        'MARKET_ANCHOR_LEAKAGE_DETECTED',
        `Unredacted market anchor (${label}): "${match[0].slice(0, 80)}"`,
      );
    }
  }
}

/** Recursively strips forbidden market/orderbook keys and scrubs all string leaves. */
export function stripForbiddenMarketKeys(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return scrubMarketAnchors(value);
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => stripForbiddenMarketKeys(item, seen));
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (!FORBIDDEN_NORMALIZED_KEYS.has(normalizeKey(key))) out[key] = stripForbiddenMarketKeys(child, seen);
  }
  return out;
}

/** Prospective anti-hindcast guard: blocks evaluations on or before model cutoff. */
export function assertProspectiveCutoff(params: {
  modelKnowledgeCutoffMs?: number;
  eventResolutionOrCutoffMs?: number;
}): void {
  const { modelKnowledgeCutoffMs, eventResolutionOrCutoffMs } = params;
  if (modelKnowledgeCutoffMs === undefined) return;
  if (!Number.isFinite(modelKnowledgeCutoffMs) || modelKnowledgeCutoffMs <= 0) {
    throw new MarketBlindError('INVALID_MARKET_BLIND_INPUT', 'modelKnowledgeCutoffMs must be a positive finite timestamp');
  }
  if (eventResolutionOrCutoffMs === undefined) return;
  if (!Number.isFinite(eventResolutionOrCutoffMs)) {
    throw new MarketBlindError('INVALID_MARKET_BLIND_INPUT', 'eventResolutionOrCutoffMs must be a finite timestamp');
  }
  if (eventResolutionOrCutoffMs <= modelKnowledgeCutoffMs) {
    throw new MarketBlindError(
      'HINDCAST_CONTAMINATION_BLOCKED',
      `Event cutoff ${eventResolutionOrCutoffMs} <= model knowledge cutoff ${modelKnowledgeCutoffMs}`,
    );
  }
}

function sliceCleanly(scrubbed: string, maxChars: number, alreadyTruncated = false): { text: string; truncated: boolean } {
  if (scrubbed.length <= maxChars) return { text: scrubbed, truncated: alreadyTruncated };
  let sliced = scrubbed.slice(0, maxChars);
  const openIdx = sliced.lastIndexOf('[REDACTED_');
  if (openIdx !== -1 && sliced.indexOf(']', openIdx) === -1) sliced = sliced.slice(0, openIdx);
  return { text: sliced, truncated: true };
}

function sanitizeSourceUrl(rawUrl: string | undefined): string | undefined {
  if (!rawUrl) return undefined;
  try {
    const parsed = new URL(rawUrl);
    parsed.search = '';
    parsed.hash = '';
    return scrubMarketAnchors(parsed.toString()).slice(0, 256);
  } catch {
    return scrubMarketAnchors(rawUrl.split(/[?#]/)[0] ?? '').slice(0, 256);
  }
}

/** Sanitizes evidence documents, enforces char caps, blocks hindcasts, and seals context hash. */
export function sanitizeMarketBlindContext(
  input: { documents: readonly MarketBlindDocumentInput[]; eventResolutionOrCutoffMs?: number },
  config: Partial<MarketBlindSanitizerConfig> = {},
): SanitizedMarketBlindContext {
  const cfg: MarketBlindSanitizerConfig = { ...DEFAULT_SANITIZER_CONFIG, ...config };
  if (!Number.isFinite(cfg.maxDocumentChars) || cfg.maxDocumentChars <= 0 ||
      !Number.isFinite(cfg.maxTotalContextChars) || cfg.maxTotalContextChars <= 0) {
    throw new MarketBlindError('INVALID_MARKET_BLIND_INPUT', 'Character caps must be positive finite numbers');
  }
  assertProspectiveCutoff({ modelKnowledgeCutoffMs: cfg.modelKnowledgeCutoffMs, eventResolutionOrCutoffMs: input.eventResolutionOrCutoffMs });

  const sanitizedDocs: SanitizedMarketBlindDocument[] = [];
  let totalChars = 0, droppedDocuments = 0, truncatedDocuments = 0;

  for (const doc of input.documents) {
    const remainingTotal = cfg.maxTotalContextChars - totalChars;
    if (remainingTotal <= 0 || sanitizedDocs.length >= MAX_SANITIZED_DOCUMENTS) { droppedDocuments += 1; continue; }
    const docBudget = Math.min(cfg.maxDocumentChars, remainingTotal);
    const safeId = scrubMarketAnchors(doc.id).slice(0, 128);
    const safeUrl = sanitizeSourceUrl(doc.sourceUrl);
    let cleanedMeta = (stripForbiddenMarketKeys(doc.metadata ?? {}) ?? {}) as Record<string, unknown>;
    if (JSON.stringify(cleanedMeta).length > Math.min(1_024, Math.floor(docBudget / 2))) cleanedMeta = {};

    const rawTitlePre = doc.title.slice(0, docBudget + MAX_ANCHOR_SPAN_SLACK);
    const titleSlice = sliceCleanly(scrubMarketAnchors(rawTitlePre), docBudget, doc.title.length > rawTitlePre.length);
    const contentBudget = Math.max(0, docBudget - titleSlice.text.length);
    const rawContentPre = contentBudget > 0 ? doc.content.slice(0, contentBudget + MAX_ANCHOR_SPAN_SLACK) : '';
    const contentSlice = contentBudget > 0
      ? sliceCleanly(scrubMarketAnchors(rawContentPre), contentBudget, doc.content.length > rawContentPre.length)
      : { text: '', truncated: doc.content.length > 0 };

    const built: SanitizedMarketBlindDocument = {
      id: safeId, title: titleSlice.text, content: contentSlice.text,
      sourceUrl: safeUrl, publishedAtMs: doc.publishedAtMs, metadata: cleanedMeta,
      truncated: titleSlice.truncated || contentSlice.truncated,
    };
    assertMarketBlindClean(JSON.stringify(built));
    if (built.truncated) truncatedDocuments += 1;
    totalChars += built.title.length + built.content.length;
    sanitizedDocs.push(built);
  }

  const contextHash = createHash('sha256').update(JSON.stringify(sanitizedDocs)).digest('hex');
  return { documents: sanitizedDocs, totalChars, droppedDocuments, truncatedDocuments, contextHash };
}
