import { alphaear } from '../intelligence/alphaear-client';
import type { SentimentScore, SentimentSignal, SentimentSummary } from './sentiment-feed-types';
import {
  fetchNewsSignals,
  fetchCoinGeckoTrending,
  fetchTwitterSignals,
} from './sentiment-feed-sources';

export * from './sentiment-feed-types';
export * from './sentiment-feed-sources';

export async function getFinBERTSentiment(text: string): Promise<SentimentSignal | null> {
  const result = await alphaear.analyzeSentiment(text);
  if (!result) return null;
  const score: SentimentScore =
    result.label === 'positive' ? 'positive' :
    result.label === 'negative' ? 'negative' : 'neutral';
  return {
    source: 'finbert',
    keyword: text.slice(0, 50),
    score,
    numericScore: result.score,
    timestamp: Date.now(),
  };
}

export async function batchFinBERTSentiment(texts: string[]): Promise<SentimentSignal[]> {
  const results = await alphaear.batchSentiment(texts);
  return results.map((r, i) => {
    const score: SentimentScore =
      r.label === 'positive' ? 'positive' :
      r.label === 'negative' ? 'negative' : 'neutral';
    return {
      source: 'finbert' as const,
      keyword: texts[i]!.slice(0, 50),
      score,
      numericScore: r.score,
      timestamp: Date.now(),
    };
  });
}

export async function getSentimentSummary(keyword: string): Promise<SentimentSummary> {
  const [news, tweets, trending] = await Promise.all([
    fetchNewsSignals(keyword),
    fetchTwitterSignals(keyword),
    fetchCoinGeckoTrending(),
  ]);
  const relevant = trending.filter((s) => s.keyword.includes(keyword.toLowerCase()));
  const signals = [...news, ...tweets, ...relevant];

  const headlines = signals.filter((s) => s.headline).map((s) => s.headline!);
  if (headlines.length > 0) {
    const finbert = await batchFinBERTSentiment(headlines);
    signals.push(...finbert);
  }

  const avg = signals.length
    ? signals.reduce((s, sig) => s + sig.numericScore, 0) / signals.length
    : 0;
  const dominantSentiment: SentimentScore =
    avg > 0.1 ? 'positive' : avg < -0.1 ? 'negative' : 'neutral';
  return { keyword, signals, averageScore: avg, dominantSentiment, updatedAt: Date.now() };
}
