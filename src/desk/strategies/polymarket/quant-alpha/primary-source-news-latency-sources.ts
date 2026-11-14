/**
 * Injected seams for Primary-Source News-to-Probability Latency.
 *
 * Three things the desk cannot derive from Gamma are supplied from outside:
 *
 *   - the bulletin feed — live RSS by default, a recorded file in replay;
 *   - the compiled arbitration check per event — `GammaMarket` carries neither
 *     `resolutionSource` nor arbitration terms, so the default declines every
 *     event instead of inventing terms;
 *   - the clock offset — the report locks the module above 500 ms, and only an
 *     NTP probe the operator trusts can say what the offset is.
 *
 * The two classifier streams are deliberately different evidence: one reads
 * words, the other reads numbers. Agreement between two readings of the same
 * evidence would not be independent verification.
 */

import { fetchNewsItems } from '../../../feeds/news-rss-fetcher';
import type { NewsItem } from '../../../feeds/news-impact-types';
import type {
  ArbitrationCheckFn,
  Bulletin,
  MarketCheck,
  NewsClassifier,
  NewsStreams,
  NewsStreamVerdict,
} from './primary-source-news-latency-types';
import { containsTerm, hostAllowed, normaliseText, numericFactsPresent } from './primary-source-news-latency-math';

/** Supplies bulletins newest first. Replay passes a recorded list. */
export type BulletinSource = (limit: number) => Promise<Bulletin[]>;

/**
 * Signed offset between this host's clock and a trusted reference, in ms.
 * `null` means unknown: orders are refused, but the module is not locked,
 * because only a measured drift is evidence the clock is wrong.
 */
export type ClockOffsetProbe = () => Promise<number | null> | number | null;

/** Map one RSS item onto a bulletin. The wire time is kept, never replaced. */
export function bulletinFromNewsItem(item: NewsItem): Bulletin {
  return {
    id: item.url ?? `${item.source}:${normaliseText(item.title)}`,
    title: item.title,
    body: item.description ?? '',
    sourceHost: item.source,
    publishedAtMs: item.publishedAt,
    url: item.url,
  };
}

/** The live default: `NEWS_FEED_URLS`, newest first, capped at `limit`. */
export const rssBulletinSource: BulletinSource = async (limit) => {
  const items = await fetchNewsItems();
  return items
    .map(bulletinFromNewsItem)
    .sort((left, right) => right.publishedAtMs - left.publishedAtMs)
    .slice(0, limit);
};

/** A recorded feed for replay: returns only bulletins already published at `now()`. */
export function recordedBulletinSource(recorded: Bulletin[], now: () => number): BulletinSource {
  return async (limit) =>
    recorded
      .filter((bulletin) => bulletin.publishedAtMs <= now())
      .sort((left, right) => right.publishedAtMs - left.publishedAtMs)
      .slice(0, limit);
}

/** Without compiled terms there is nothing to verify, so nothing trades. */
export const noArbitrationChecks: ArbitrationCheckFn = () => null;

/** A static table of compiled checks keyed by event slug or id. */
export function arbitrationChecksFromTable(table: Record<string, MarketCheck>): ArbitrationCheckFn {
  return (event) => table[event.slug] ?? table[event.id] ?? null;
}

/** No probe configured: the offset is unknown, so the strategy observes only. */
export const unknownClockOffset: ClockOffsetProbe = () => null;

/** Stream 1: whitelisted host, every required term, no forbidden term. */
export const termStream: NewsClassifier = (bulletin, check) => {
  if (!hostAllowed(check, bulletin.sourceHost)) {
    return verdict(false, 0, `host ${bulletin.sourceHost} not in resolution source`);
  }
  const text = normaliseText(`${bulletin.title} ${bulletin.body}`);
  const forbidden = check.forbiddenTerms.find((term) => containsTerm(text, term));
  if (forbidden) return verdict(false, 0, `forbidden term "${forbidden}"`);
  const total = check.requiredTerms.length;
  if (total === 0) return verdict(true, 1, 'no required terms');
  const hits = check.requiredTerms.filter((term) => containsTerm(text, term)).length;
  return verdict(hits === total, hits / total, `${hits}/${total} required terms`);
};

/** Stream 2: whitelisted host and every required numeric fact. */
export const numericStream: NewsClassifier = (bulletin, check) => {
  if (!hostAllowed(check, bulletin.sourceHost)) {
    return verdict(false, 0, `host ${bulletin.sourceHost} not in resolution source`);
  }
  const { matched, total } = numericFactsPresent(`${bulletin.title} ${bulletin.body}`, check);
  if (total === 0) return verdict(true, 1, 'no required numbers');
  return verdict(matched === total, matched / total, `${matched}/${total} required numbers`);
};

export const DEFAULT_NEWS_STREAMS: NewsStreams = { term: termStream, numeric: numericStream };

function verdict(matches: boolean, confidence: number, reason: string): NewsStreamVerdict {
  return { matches, confidence, reason };
}
