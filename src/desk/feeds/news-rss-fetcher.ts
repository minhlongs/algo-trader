/**
 * News RSS Fetcher
 *
 * Minimal RSS/XML news parser and fetcher with title deduplication.
 */

import { logger } from '../../shared/utils/logger';
import type { NewsItem } from './news-impact-types';

export function parseXmlField(block: string, tag: string): string {
  return block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, 'i'))?.[1]
    ?? block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))?.[1]
    ?? '';
}

export async function fetchRssFeed(url: string): Promise<NewsItem[]> {
  const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!resp.ok) return [];
  const xml = await resp.text();
  const hostname = new URL(url).hostname;

  return (xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? []).slice(0, 20).flatMap(block => {
    const title = parseXmlField(block, 'title').trim();
    if (!title) return [];
    const desc = parseXmlField(block, 'description').replace(/<[^>]+>/g, '').trim().slice(0, 300);
    const pubDate = parseXmlField(block, 'pubDate');
    return [{
      title,
      description: desc || undefined,
      url: parseXmlField(block, 'link').trim() || undefined,
      publishedAt: pubDate ? new Date(pubDate).getTime() : Date.now(),
      source: hostname,
    }];
  });
}

/** Fetch news items from all configured feed URLs */
export async function fetchNewsItems(): Promise<NewsItem[]> {
  const feedUrls = (process.env['NEWS_FEED_URLS'] ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (feedUrls.length === 0) {
    logger.warn('[NewsImpactAnalyzer] No NEWS_FEED_URLS configured');
    return [];
  }

  const results = await Promise.allSettled(feedUrls.map(url => fetchRssFeed(url)));
  const items: NewsItem[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') items.push(...r.value);
    else logger.warn('[NewsImpactAnalyzer] Feed fetch failed', { reason: r.reason });
  }

  // Deduplicate by title
  const seen = new Set<string>();
  return items.filter(item => {
    const key = item.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
