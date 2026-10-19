import type {
  ContKukanovStoikov2014DeepOfiInput,
  ContKukanovStoikov2014DeepOfiOutput,
} from './types';

export class ContKukanovStoikov2014DeepOfi {
  static evaluate(
    input: ContKukanovStoikov2014DeepOfiInput
  ): ContKukanovStoikov2014DeepOfiOutput {
    const kappa = Math.max(0.01, input.levelDecayRateKappa);
    let weightedSum = 0;
    let weightNorm = 0;
    let topLevelOfi = 0;
    let maxDepletion = 0;

    for (const lvl of input.levels) {
      const m = Math.max(1, lvl.levelIndex);
      const depth = Math.max(1, lvl.depthNormalizationShares);
      const ofiM = (lvl.bidQueueDeltaShares - lvl.askQueueDeltaShares) / depth;
      if (m === 1) topLevelOfi = ofiM;
      const w = Math.exp(-kappa * (m - 1));
      weightedSum += w * ofiM;
      weightNorm += w;
      maxDepletion = Math.max(maxDepletion, Math.abs(ofiM));
    }

    const weightedDeepOfi = weightNorm > 0 ? weightedSum / weightNorm : 0;
    const predictedMidPriceChangeTicks = input.priceImpactSlopeBeta * weightedDeepOfi;
    const adverseSweepDetected = maxDepletion >= input.adverseQueueDepletionThreshold;
    const regime = adverseSweepDetected
      ? 'ADVERSE_MULTI_LEVEL_SWEEP'
      : Math.abs(weightedDeepOfi) >= 0.35
        ? 'DIRECTIONAL_OFI_PRESSURE'
        : 'BALANCED_DEEP_BOOK';

    return {
      weightedDeepOfi: Number(weightedDeepOfi.toFixed(6)),
      topLevelOfi: Number(topLevelOfi.toFixed(6)),
      predictedMidPriceChangeTicks: Number(predictedMidPriceChangeTicks.toFixed(6)),
      queueDepletionRatio: Number(maxDepletion.toFixed(6)),
      adverseSweepDetected,
      regime,
    };
  }
}
