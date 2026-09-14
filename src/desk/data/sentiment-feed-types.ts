export type SentimentScore = 'positive' | 'negative' | 'neutral';

export interface SentimentSignal {
  source: 'twitter' | 'newsapi' | 'coingecko' | 'reddit' | 'finbert';
  keyword: string;
  score: SentimentScore;
  numericScore: number; // positive=1, neutral=0, negative=-1
  headline?: string;
  url?: string;
  timestamp: number;
}

export interface SentimentSummary {
  keyword: string;
  signals: SentimentSignal[];
  averageScore: number;
  dominantSentiment: SentimentScore;
  updatedAt: number;
}
