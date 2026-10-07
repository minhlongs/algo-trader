import type {
  BlockGasMetrics,
  GasFeeRecommendation,
  GasRecommendationRequest,
  UrgencyLevel,
} from './dynamic-gas-types';

export interface DynamicGasPricerConfig {
  readonly defaultPriorityFeeByUrgency?: Readonly<Record<UrgencyLevel, number>>;
  readonly maxBribeShareOfAlpha?: number;
  readonly defaultEstimatedGas?: number;
}

export class DynamicGasPricer {
  private readonly priorityFeeByUrgency: Readonly<Record<UrgencyLevel, number>>;
  private readonly maxBribeShareOfAlpha: number;
  private readonly defaultEstimatedGas: number;

  public constructor(config: DynamicGasPricerConfig = {}) {
    this.priorityFeeByUrgency = config.defaultPriorityFeeByUrgency ?? {
      LOW: 1.0,
      MEDIUM: 2.0,
      HIGH: 5.0,
      CRITICAL_ARBITRAGE: 15.0,
    };
    this.maxBribeShareOfAlpha = config.maxBribeShareOfAlpha ?? 0.40; // max 40% of profit to bribes
    this.defaultEstimatedGas = config.defaultEstimatedGas ?? 250000;
  }

  public forecastNextBaseFeeGwei(block: BlockGasMetrics): number {
    const targetGas = block.gasLimit / 2;
    if (targetGas <= 0) return block.baseFeeGwei;

    const gasUsedDelta = (block.gasUsed - targetGas) / targetGas;
    const clampedDelta = Math.max(-1, Math.min(1, gasUsedDelta));
    // EIP-1559 maximum adjustment per block is 12.5% (1/8)
    const multiplier = 1 + 0.125 * clampedDelta;
    return Math.max(0.1, block.baseFeeGwei * multiplier);
  }

  public calculateRecommendation(request: GasRecommendationRequest): GasFeeRecommendation {
    const nextBaseFee = this.forecastNextBaseFeeGwei(request.latestBlock);
    let priorityFee = this.priorityFeeByUrgency[request.urgency];

    const gasUnits = request.estimatedGasUnits ?? this.defaultEstimatedGas;
    const ethPrice = request.ethPriceUsd ?? 3000;
    const profitUsd = request.expectedProfitUsd ?? 0;

    // For critical arbitrage with expected profit, calibrate aggressive MEV bribe
    if (request.urgency === 'CRITICAL_ARBITRAGE' && profitUsd > 0 && ethPrice > 0) {
      const maxBribeUsd = profitUsd * this.maxBribeShareOfAlpha;
      const maxBribeEth = maxBribeUsd / ethPrice;
      const maxBribeGwei = (maxBribeEth * 1e9) / gasUnits;
      priorityFee = Math.max(priorityFee, Math.min(maxBribeGwei, 250));
    }

    const maxFeePerGas = nextBaseFee * 2 + priorityFee;
    const effectiveFeePerGasGwei = nextBaseFee + priorityFee;
    const totalGasCostEth = (effectiveFeePerGasGwei * 1e-9) * gasUnits;
    const estimatedTotalCostUsd = totalGasCostEth * ethPrice;

    const profitRetentionPct = profitUsd > 0
      ? Math.max(0, Math.min(100, ((profitUsd - estimatedTotalCostUsd) / profitUsd) * 100))
      : 100;

    return {
      estimatedBaseFeeGwei: Math.round(nextBaseFee * 1000) / 1000,
      priorityFeeGwei: Math.round(priorityFee * 1000) / 1000,
      maxFeePerGasGwei: Math.round(maxFeePerGas * 1000) / 1000,
      estimatedTotalCostUsd: Math.round(estimatedTotalCostUsd * 100) / 100,
      profitRetentionPct: Math.round(profitRetentionPct * 100) / 100,
    };
  }
}
