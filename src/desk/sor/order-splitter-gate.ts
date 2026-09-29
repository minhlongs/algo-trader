import { RoutingRequest, ExecutionStrategy } from './sor-types';

export interface SplittingDecision {
  shouldSplit: boolean;
  reason?: string;
  recommendedStrategy: ExecutionStrategy;
  notionalUsd: number;
  depthRatio: number;
}

export class OrderSplittingGate {
  constructor(
    private readonly valueThresholdUsd: number = 5000,
    private readonly depthThresholdRatio: number = 0.15,
    private readonly slippageThresholdBps: number = 25
  ) {}

  public shouldSplit(
    orderValueUsd: number,
    orderQuantity: number,
    top5Depth: number,
    expectedSlippageBps?: number
  ): boolean {
    if (orderValueUsd > this.valueThresholdUsd) return true;
    if (top5Depth > 0 && orderQuantity / top5Depth > this.depthThresholdRatio) return true;
    if (expectedSlippageBps !== undefined && expectedSlippageBps > this.slippageThresholdBps) return true;
    return false;
  }

  public evaluateOrder(
    request: RoutingRequest,
    top5Depth: number,
    referencePrice: number
  ): SplittingDecision {
    const notionalUsd = request.targetQuantity * referencePrice;
    const depthRatio = top5Depth > 0 ? request.targetQuantity / top5Depth : 1.0;

    // If explicit strategy specified other than MARKET, respect it
    if (request.executionStrategy && request.executionStrategy !== 'MARKET') {
      return {
        shouldSplit: true,
        reason: `Explicit strategy requested: ${request.executionStrategy}`,
        recommendedStrategy: request.executionStrategy,
        notionalUsd,
        depthRatio,
      };
    }

    if (notionalUsd > this.valueThresholdUsd) {
      const recommended: ExecutionStrategy = request.urgency === 'HIGH'
        ? 'TWAP'
        : notionalUsd > this.valueThresholdUsd * 4
        ? 'ICEBERG'
        : 'VWAP';
      return {
        shouldSplit: true,
        reason: `Order notional $${notionalUsd.toFixed(2)} exceeds threshold $${this.valueThresholdUsd}`,
        recommendedStrategy: recommended,
        notionalUsd,
        depthRatio,
      };
    }

    if (top5Depth > 0 && depthRatio > this.depthThresholdRatio) {
      return {
        shouldSplit: true,
        reason: `Order quantity exceeds ${(this.depthThresholdRatio * 100).toFixed(0)}% top-5 depth (${(depthRatio * 100).toFixed(1)}%)`,
        recommendedStrategy: request.urgency === 'HIGH' ? 'TWAP' : 'VWAP',
        notionalUsd,
        depthRatio,
      };
    }

    return {
      shouldSplit: false,
      recommendedStrategy: 'MARKET',
      notionalUsd,
      depthRatio,
    };
  }

  public getValueThreshold(): number {
    return this.valueThresholdUsd;
  }

  public getDepthThresholdRatio(): number {
    return this.depthThresholdRatio;
  }

  public getSlippageThresholdBps(): number {
    return this.slippageThresholdBps;
  }
}
