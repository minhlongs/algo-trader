import { GlostenMilgromParams, GlostenMilgromResult } from './gm-microstructure-types';
import { GlostenMilgromMath } from './gm-microstructure-math';

export class GlostenMilgromEngine {
  public static calculate(params: GlostenMilgromParams): GlostenMilgromResult {
    if (params.lowValue >= params.highValue) {
      throw new Error('lowValue must be strictly less than highValue');
    }
    if (params.informedFraction < 0.0 || params.informedFraction > 1.0) {
      throw new Error('informedFraction must be within [0, 1]');
    }

    const p0 = params.priorProbabilityHigh ?? 0.5;
    if (p0 <= 0.0 || p0 >= 1.0) {
      throw new Error('priorProbabilityHigh must be strictly within (0, 1)');
    }

    const gamma = params.noiseBuyProbability ?? 0.5;
    if (gamma <= 0.0 || gamma >= 1.0) {
      throw new Error('noiseBuyProbability must be strictly within (0, 1)');
    }

    const { lowValue: VL, highValue: VH, informedFraction: alpha } = params;
    const trades = params.tradeSequence ?? [];

    let currentP = p0;
    const beliefHistory: number[] = [currentP];
    const initialQuotes = GlostenMilgromMath.calculateQuotes(VL, VH, currentP, alpha, gamma);
    const spreadHistory: number[] = [initialQuotes.spread];
    const midPriceHistory: number[] = [initialQuotes.midPrice];

    for (const trade of trades) {
      currentP = GlostenMilgromMath.updateBelief(trade, currentP, alpha, gamma);
      beliefHistory.push(currentP);
      const quotes = GlostenMilgromMath.calculateQuotes(VL, VH, currentP, alpha, gamma);
      spreadHistory.push(quotes.spread);
      midPriceHistory.push(quotes.midPrice);
    }

    const finalQuotes = GlostenMilgromMath.calculateQuotes(VL, VH, currentP, alpha, gamma);
    const valueRange = VH - VL;
    const informationShare = valueRange > 0.0 ? finalQuotes.spread / valueRange : 0.0;

    return {
      currentQuotes: finalQuotes,
      finalBeliefProbability: currentP,
      spreadHistory,
      midPriceHistory,
      beliefHistory,
      informationShare,
    };
  }
}
