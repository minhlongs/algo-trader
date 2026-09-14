import type { SentimentScore, SentimentSignal } from './sentiment-feed-types';

const POS = new Set([
  'bullish', 'surge', 'rally', 'gain', 'profit', 'rise', 'win', 'beat',
  'outperform', 'breakthrough', 'adoption', 'approval', 'launch', 'partnership',
]);
const NEG = new Set([
  'bearish', 'crash', 'drop', 'loss', 'fall', 'fail', 'hack', 'ban',
  'regulation', 'lawsuit', 'liquidation', 'fear', 'sell', 'dump', 'fraud',
]);

export function classifyText(text: string): SentimentScore {
  const words = text.toLowerCase().split(/\W+/);
  let pos = 0;
  let neg = 0;
  for (const w of words) {
    if (POS.has(w)) pos++;
    if (NEG.has(w)) neg++;
  }
  return pos > neg ? 'positive' : neg > pos ? 'negative' : 'neutral';
}

export function toNumeric(s: SentimentScore): number {
  return s === 'positive' ? 1 : s === 'negative' ? -1 : 0;
}

export function makeSig(
  source: SentimentSignal['source'],
  keyword: string,
  text: string,
  extra: Partial<Pick<SentimentSignal, 'headline' | 'url' | 'timestamp'>> = {}
): SentimentSignal {
  const score = classifyText(text);
  return {
    source,
    keyword,
    score,
    numericScore: toNumeric(score),
    timestamp: Date.now(),
    ...extra,
  };
}

export async function fetchNewsSignals(keyword: string): Promise<SentimentSignal[]> {
  const apiKey = process.env['NEWSAPI_KEY'];
  if (!apiKey) return [];
  try {
    const url = new URL('https://newsapi.org/v2/everything');
    url.searchParams.set('q', keyword);
    url.searchParams.set('sortBy', 'publishedAt');
    url.searchParams.set('pageSize', '10');
    url.searchParams.set('language', 'en');
    url.searchParams.set('apiKey', apiKey);
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      articles?: { title: string; description: string | null; url: string; publishedAt: string }[];
    };
    return (data.articles ?? []).map((a) =>
      makeSig('newsapi', keyword, `${a.title} ${a.description ?? ''}`, {
        headline: a.title,
        url: a.url,
        timestamp: new Date(a.publishedAt).getTime(),
      })
    );
  } catch {
    return [];
  }
}

export async function fetchCoinGeckoTrending(): Promise<SentimentSignal[]> {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/search/trending', {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      coins?: { item: { name: string; symbol: string } }[];
    };
    return (data.coins ?? []).map((c) => ({
      source: 'coingecko' as const,
      keyword: c.item.symbol.toLowerCase(),
      score: 'positive' as const,
      numericScore: 1,
      headline: `${c.item.name} is trending on CoinGecko`,
      timestamp: Date.now(),
    }));
  } catch {
    return [];
  }
}

export async function fetchTwitterSignals(keyword: string): Promise<SentimentSignal[]> {
  const token = process.env['TWITTER_BEARER_TOKEN'];
  if (!token) return [];
  try {
    const url = new URL('https://api.twitter.com/2/tweets/search/recent');
    url.searchParams.set('query', `${keyword} -is:retweet lang:en`);
    url.searchParams.set('max_results', '10');
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      data?: { text: string; created_at?: string }[];
    };
    return (data.data ?? []).map((t) =>
      makeSig('twitter', keyword, t.text, {
        headline: t.text.slice(0, 120),
        timestamp: t.created_at ? new Date(t.created_at).getTime() : Date.now(),
      })
    );
  } catch {
    return [];
  }
}
