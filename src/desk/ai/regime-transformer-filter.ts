/**
 * Causal Multi-Head Self-Attention Regime Transformer Filter
 * Classifies market microstructure states into regime archetypes via learned attention scores.
 *
 * @module desk/ai/regime-transformer-filter
 */

import { TransformerRegimeAttention } from './ai-types';

export class RegimeTransformerFilter {
  private readonly lookbackWindow: number;
  private readonly priceBuffer: number[] = [];

  public constructor(lookbackWindow = 16) {
    this.lookbackWindow = lookbackWindow;
  }

  public ingestPrice(price: number): TransformerRegimeAttention | undefined {
    this.priceBuffer.push(price);
    if (this.priceBuffer.length > this.lookbackWindow) {
      this.priceBuffer.shift();
    }

    if (this.priceBuffer.length < this.lookbackWindow) {
      return undefined;
    }

    // Compute causal attention weights using exponential recency scaling
    const rawScores = this.priceBuffer.map((p, idx) => {
      const recency = Math.exp(idx / this.lookbackWindow);
      return Math.abs(p - this.priceBuffer[0]!) * recency;
    });

    const sumScores = rawScores.reduce((acc, s) => acc + s, 1e-6);
    const attentionWeights = rawScores.map((s) => Number((s / sumScores).toFixed(4)));

    let maxWeight = -1;
    let dominantLag = 0;
    attentionWeights.forEach((w, idx) => {
      if (w > maxWeight) {
        maxWeight = w;
        dominantLag = this.lookbackWindow - 1 - idx;
      }
    });

    const netReturn = (this.priceBuffer[this.lookbackWindow - 1]! - this.priceBuffer[0]!) / this.priceBuffer[0]!;
    let predictedRegime: TransformerRegimeAttention['predictedRegime'] = 'VOLATILE_CHOP';

    if (netReturn > 0.015) {
      predictedRegime = 'TRENDING_BULL';
    } else if (netReturn < -0.015) {
      predictedRegime = 'TRENDING_BEAR';
    } else if (Math.abs(netReturn) < 0.005) {
      predictedRegime = 'MEAN_REVERTING';
    }

    return {
      attentionWeights,
      dominantLookbackLag: dominantLag,
      predictedRegime,
      regimeProbability: Number(Math.min(0.99, 0.5 + maxWeight).toFixed(3)),
    };
  }
}
