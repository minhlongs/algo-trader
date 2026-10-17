/**
 * Signal Scorer
 * Scores and ranks arbitrage opportunities
 *
 * Scoring factors:
 * - Spread percentage (weight: 40%)
 * - Latency (weight: 25%)
 * - Volume available (weight: 20%)
 * - Exchange reliability (weight: 15%)
 */

import { ArbitrageOpportunity } from './spread-detector';
import {
  SignalScore,
  ScorerConfig,
  DEFAULT_SCORER_CONFIG,
  scoreSpreadValue,
  scoreLatencyValue,
  scoreVolumeValue,
  computeWeightedSignalScore,
  classifyRecommendation,
} from './signal-scorer-helpers';

export { SignalScore, ScorerConfig };

export class SignalScorer {
  private config: ScorerConfig;
  private exchangeReliability: Map<string, number>;

  constructor(config?: Partial<ScorerConfig>) {
    this.config = {
      ...DEFAULT_SCORER_CONFIG,
      ...config,
    };

    this.exchangeReliability = new Map([
      ['binance', 0.95],
      ['okx', 0.92],
      ['bybit', 0.90],
    ]);
  }

  private scoreReliability(exchange: string): number {
    const reliability = this.exchangeReliability.get(exchange.toLowerCase()) || 0.5;
    return reliability * 100;
  }

  score(opportunity: ArbitrageOpportunity, volume = 1.0): SignalScore {
    const breakdown = {
      spreadScore: scoreSpreadValue(opportunity.spreadPercent),
      latencyScore: scoreLatencyValue(opportunity.latency),
      volumeScore: scoreVolumeValue(volume),
      reliabilityScore: this.scoreReliability(opportunity.buyExchange),
    };

    const totalScore = computeWeightedSignalScore(breakdown, this.config.weights);

    return {
      opportunity,
      totalScore: Math.round(totalScore * 100) / 100,
      breakdown,
      rank: 0,
      recommendation: classifyRecommendation(totalScore, this.config.thresholds),
    };
  }

  scoreAll(opportunities: ArbitrageOpportunity[], volumes?: number[]): SignalScore[] {
    const scores = opportunities.map((opp, i) =>
      this.score(opp, volumes?.[i] || 1.0)
    );

    scores.sort((a, b) => b.totalScore - a.totalScore);
    scores.forEach((score, i) => {
      score.rank = i + 1;
    });

    return scores;
  }

  filterActionable(scores: SignalScore[]): SignalScore[] {
    return scores.filter(
      (s) => s.recommendation === 'STRONG_BUY' || s.recommendation === 'BUY'
    );
  }

  updateReliability(exchange: string, success: boolean): void {
    const current = this.exchangeReliability.get(exchange.toLowerCase()) || 0.5;
    const adjustment = success ? 0.01 : -0.02;
    const updated = Math.max(0.1, Math.min(0.99, current + adjustment));
    this.exchangeReliability.set(exchange.toLowerCase(), updated);
  }
}
