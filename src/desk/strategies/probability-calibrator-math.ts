/**
 * Probability Calibrator Math, Parsing & Concurrency Helpers
 */

import { BinaryMarket } from '../arbitrage/types';

export interface CalibratorConfig {
  /** Local LLM base URL (default: http://127.0.0.1:11434) */
  llmBaseUrl: string;
  /** Model identifier served by Ollama/MLX (default: qwen2.5-coder:32b) */
  llmModel: string;
  /** Minimum confidence to act on an estimate (default: 0.7) */
  confidenceThreshold: number;
  /** Max parallel LLM requests to avoid OOM on local GPU (default: 2) */
  maxConcurrentRequests: number;
}

export const DEFAULT_CONFIG: CalibratorConfig = {
  llmBaseUrl: 'http://127.0.0.1:11434',
  llmModel: 'qwen2.5-coder:32b',
  confidenceThreshold: 0.7,
  maxConcurrentRequests: 2,
};

export interface ProbabilityEstimate {
  probability: number;
  confidence: number;
  reasoning: string;
}

export interface SentimentScore {
  /** -1.0 (very negative) to +1.0 (very positive) */
  sentiment: number;
  impact: 'high' | 'medium' | 'low';
}

export interface MispricingSignal {
  mispriced: boolean;
  /** 'overpriced-yes' | 'underpriced-yes' | 'fair' */
  direction: string;
  /** Absolute edge as fraction (e.g. 0.08 = 8%) */
  edge: number;
}

/** Semaphore to limit concurrent LLM calls */
export class Semaphore {
  private permits: number;
  private queue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    return new Promise((resolve) => this.queue.push(resolve));
  }

  release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.permits++;
    }
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function computeMispricingSignal(
  market: BinaryMarket,
  estimatedProb: number
): MispricingSignal {
  const marketProb = market.yesPrice; // YES token price ≈ implied probability
  const edge = Math.abs(estimatedProb - marketProb);

  if (edge < 0.03) {
    return { mispriced: false, direction: 'fair', edge };
  }

  const direction = estimatedProb > marketProb ? 'underpriced-yes' : 'overpriced-yes';
  return { mispriced: true, direction, edge };
}

export function parseProbabilityEstimateResponse(raw: string): ProbabilityEstimate {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON found');
    const parsed = JSON.parse(match[0]) as Partial<ProbabilityEstimate>;
    return {
      probability: clamp(Number(parsed.probability ?? 0.5), 0, 1),
      confidence: clamp(Number(parsed.confidence ?? 0.5), 0, 1),
      reasoning: String(parsed.reasoning ?? 'No reasoning provided'),
    };
  } catch {
    return { probability: 0.5, confidence: 0, reasoning: 'Failed to parse LLM response' };
  }
}

export function parseSentimentScoreResponse(raw: string): SentimentScore {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON found');
    const parsed = JSON.parse(match[0]) as Partial<SentimentScore>;
    const impact = ['high', 'medium', 'low'].includes(parsed.impact as string)
      ? (parsed.impact as SentimentScore['impact'])
      : 'medium';
    return {
      sentiment: clamp(Number(parsed.sentiment ?? 0), -1, 1),
      impact,
    };
  } catch {
    return { sentiment: 0, impact: 'low' };
  }
}
