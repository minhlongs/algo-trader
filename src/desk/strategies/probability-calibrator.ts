/**
 * Probability Calibrator Strategy
 * Uses a local LLM (Ollama/MLX via OpenAI-compatible API) to estimate
 * true probabilities for binary prediction markets and detect mispricing.
 *
 * Default model: qwen2.5-coder:32b via Ollama on localhost:11434
 * All LLM calls use fetch() with OpenAI chat completions format.
 */

import { BinaryMarket } from '../arbitrage/types';
import { LlmRouter, ChatMessage } from '../../lib/llm-router';
import { LlmEndpoint } from '../../shared/config/llm-config';
import {
  CalibratorConfig,
  DEFAULT_CONFIG,
  ProbabilityEstimate,
  SentimentScore,
  MispricingSignal,
  Semaphore,
  computeMispricingSignal,
  parseProbabilityEstimateResponse,
  parseSentimentScoreResponse,
} from './probability-calibrator-math';

export type {
  CalibratorConfig,
  ProbabilityEstimate,
  SentimentScore,
  MispricingSignal,
};

export class ProbabilityCalibratorStrategy {
  private config: CalibratorConfig;
  private semaphore: Semaphore;
  private llmRouter: LlmRouter;

  constructor(config: Partial<CalibratorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.semaphore = new Semaphore(this.config.maxConcurrentRequests);
    this.llmRouter = new LlmRouter({
      primary: {
        url: this.config.llmBaseUrl,
        model: this.config.llmModel,
        priority: 1,
        maxTokens: 256,
        timeoutMs: 90_000,
      } as LlmEndpoint,
    });
  }

  /**
   * Ask the local LLM for a probability estimate on a binary question.
   * Returns probability 0–1, confidence 0–1, and a brief reasoning string.
   */
  async estimateProbability(question: string, context?: string): Promise<ProbabilityEstimate> {
    const systemPrompt = [
      'You are a probability calibration expert for prediction markets.',
      'Respond ONLY with valid JSON in this exact shape:',
      '{"probability": <0-1 float>, "confidence": <0-1 float>, "reasoning": "<one sentence>"}',
      'probability = your best estimate that the event resolves YES.',
      'confidence = how certain you are (0 = no idea, 1 = certain).',
    ].join('\n');

    const userPrompt = context
      ? `Question: ${question}\n\nAdditional context:\n${context}`
      : `Question: ${question}`;

    const raw = await this.callLLM(systemPrompt, userPrompt);
    return this.parseProbabilityResponse(raw);
  }

  /**
   * Score sentiment of a news snippet for potential market impact.
   */
  async scoreSentiment(newsText: string): Promise<SentimentScore> {
    const systemPrompt = [
      'You are a financial news sentiment analyst.',
      'Respond ONLY with valid JSON:',
      '{"sentiment": <-1.0 to 1.0>, "impact": "high"|"medium"|"low"}',
      'sentiment: -1=very negative, 0=neutral, +1=very positive for the market outcome.',
      'impact: expected influence on prediction market prices.',
    ].join('\n');

    const raw = await this.callLLM(systemPrompt, `Analyze: ${newsText}`);
    return this.parseSentimentResponse(raw);
  }

  /**
   * Compare LLM probability estimate against market price to find edge.
   * Returns mispricing signal with direction and magnitude.
   */
  detectMispricing(market: BinaryMarket, estimatedProb: number): MispricingSignal {
    return computeMispricingSignal(market, estimatedProb);
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async callLLM(systemPrompt: string, userPrompt: string): Promise<string> {
    await this.semaphore.acquire();
    try {
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];
      const response = await this.llmRouter.chat({ messages, temperature: 0.1, maxTokens: 256 });
      return response.content;
    } finally {
      this.semaphore.release();
    }
  }

  private parseProbabilityResponse(raw: string): ProbabilityEstimate {
    return parseProbabilityEstimateResponse(raw);
  }

  private parseSentimentResponse(raw: string): SentimentScore {
    return parseSentimentScoreResponse(raw);
  }
}
