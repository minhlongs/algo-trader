/**
 * POLY-G5 Public Beta — Gamma Market Universe Normalization.
 *
 * Turns raw Gamma payloads into quote-free market candidates, then joins them to
 * per-token CLOB top-of-book quotes to build `PolyBetaMarketSnapshot` entries.
 * Quote sourcing itself lives in `poly-beta-market-quotes.ts`.
 */

import { classifyFiveMinuteExclusion } from '../../shared/polymarket/five-minute-crypto-guard';
import type { PolyBetaMarketSnapshot } from './poly-beta-types';
import { resolveGammaTopOfBook, type BetaTopOfBookQuote } from './poly-beta-market-quotes';

export interface GammaMarketRaw {
  id?: string | number;
  question?: string;
  slug?: string;
  category?: string;
  clobTokenIds?: string | string[];
  outcomePrices?: string | string[];
  bestBid?: number | string;
  bestAsk?: number | string;
  orderPriceMinTickSize?: number | string;
  orderMinSize?: number | string;
  updatedAt?: string;
  active?: boolean;
  closed?: boolean;
}

export interface GammaMarketCandidate {
  marketId: string;
  question: string;
  slug: string;
  category: string;
  yesTokenId: string;
  noTokenId: string;
  tickSize: number;
  minOrderShares: number;
  gammaQuote: BetaTopOfBookQuote | null;
}

function parseJsonArrayString(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val) as unknown;
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return [];
    }
  }
  return [];
}

export function collectGammaCandidates(
  rawList: unknown[],
  maxMarkets: number,
): GammaMarketCandidate[] {
  const out: GammaMarketCandidate[] = [];
  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue;
    const m = item as GammaMarketRaw;
    if (m.closed === true || m.active === false) continue;
    const question = String(m.question ?? '').trim();
    const slug = String(m.slug ?? '').trim();
    const marketId = String(m.id ?? slug);
    if (!question || !marketId) continue;

    // Enforce hard 5-minute crypto & short-horizon binary exclusion
    if (
      classifyFiveMinuteExclusion({
        id: marketId,
        slug,
        question,
        category: String(m.category ?? ''),
      }) !== null
    ) {
      continue;
    }

    const tokenIds = parseJsonArrayString(m.clobTokenIds);
    if (tokenIds.length < 2) continue;

    out.push({
      marketId,
      question,
      slug: slug || marketId,
      category: String(m.category ?? 'Macro & Politics'),
      yesTokenId: tokenIds[0]!,
      noTokenId: tokenIds[1]!,
      tickSize: Number(m.orderPriceMinTickSize) || 0.01,
      minOrderShares: Math.max(5, Number(m.orderMinSize) || 5),
      gammaQuote: resolveGammaTopOfBook(m),
    });
    if (out.length >= maxMarkets) break;
  }
  return out;
}

export function buildMarketSnapshots(
  candidates: readonly GammaMarketCandidate[],
  quotes: Map<string, BetaTopOfBookQuote>,
  fetchedAtMs: number,
): PolyBetaMarketSnapshot[] {
  const out: PolyBetaMarketSnapshot[] = [];
  for (const c of candidates) {
    // CLOB per-token book wins; Gamma's own quote fields are the fallback only.
    const quote = quotes.get(c.yesTokenId) ?? c.gammaQuote;
    // Require genuine top-of-book quotes (0 < bestBid < bestAsk < 1); never synthesize 0.49/0.51.
    if (!quote) continue;
    const { bestBid, bestAsk } = quote;
    const midPrice = Number(((bestBid + bestAsk) / 2).toFixed(4));
    out.push({
      marketId: c.marketId,
      question: c.question,
      slug: c.slug,
      category: c.category,
      yesTokenId: c.yesTokenId,
      noTokenId: c.noTokenId,
      bestBid,
      bestAsk,
      midPrice,
      spreadBps: Math.round(((bestAsk - bestBid) / Math.max(0.01, midPrice)) * 10_000),
      feeRateBps: 0,
      tickSize: c.tickSize,
      minOrderShares: c.minOrderShares,
      source: 'polymarket-gamma-clob',
      sourceTimestampMs: quote.timestampMs,
      fetchedAtMs,
    });
  }
  return out;
}
