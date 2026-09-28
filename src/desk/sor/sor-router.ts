import {
  RoutingRequest,
  RoutingRequestSchema,
  RoutingPlan,
  ExecutionProgress,
  VenueBook,
} from './sor-types';
import { VenueBookAggregator } from './venue-book-aggregator';
import { WaterFillingOptimizer } from './water-filling-optimizer';
import { OrderSplittingGate, SplittingDecision } from './order-splitter-gate';
import { PriceImprovementVerifier } from './price-improvement';
import { TwapExecutor } from './twap-executor';
import { VwapExecutor } from './vwap-executor';
import { IcebergExecutor } from './iceberg-executor';
import { logger } from '../../shared/utils/logger';

export interface SorRouterOptions {
  valueThresholdUsd?: number;
  depthThresholdRatio?: number;
  slippageThresholdBps?: number;
}

export class SmartOrderRouter {
  public readonly aggregator: VenueBookAggregator;
  public readonly optimizer: WaterFillingOptimizer;
  public readonly splittingGate: OrderSplittingGate;
  public readonly verifier: PriceImprovementVerifier;
  public readonly twapExecutor: TwapExecutor;
  public readonly vwapExecutor: VwapExecutor;
  public readonly icebergExecutor: IcebergExecutor;

  constructor(options: SorRouterOptions = {}) {
    this.aggregator = new VenueBookAggregator();
    this.optimizer = new WaterFillingOptimizer();
    this.splittingGate = new OrderSplittingGate(
      options.valueThresholdUsd ?? 5000,
      options.depthThresholdRatio ?? 0.15,
      options.slippageThresholdBps ?? 25
    );
    this.verifier = new PriceImprovementVerifier();
    this.twapExecutor = new TwapExecutor();
    this.vwapExecutor = new VwapExecutor();
    this.icebergExecutor = new IcebergExecutor();
  }

  public registerBook(book: VenueBook): void {
    this.aggregator.registerBook(book);
  }

  public route(rawRequest: RoutingRequest): RoutingPlan {
    const request = RoutingRequestSchema.parse(rawRequest);
    const books = this.aggregator.getBooks();
    if (books.length === 0) {
      throw new Error(`Cannot route ${request.symbol}: no liquidity books available`);
    }

    const plan = this.optimizer.optimizeRoute(request, books);
    logger.info('SOR route optimized', 'SmartOrderRouter', {
      symbol: plan.symbol,
      side: plan.side,
      qty: plan.totalQuantity,
      improvementBps: plan.priceImprovementBps,
      venues: plan.allocations.map(a => a.venueId),
    });
    return plan;
  }

  public evaluateSplitting(request: RoutingRequest): SplittingDecision {
    const top5Depth = this.aggregator.getTopDepth(request.side, 5);
    const books = this.aggregator.getBooks();
    const ladder = this.aggregator.buildUnifiedLadder(request.side);
    const refPrice = ladder.length > 0 ? ladder[0].price : 1.0;
    return this.splittingGate.evaluateOrder(request, top5Depth, refPrice);
  }

  public async executeOrder(params: {
    request: RoutingRequest;
    abortSignal?: AbortSignal;
    onProgress?: (progress: ExecutionProgress) => void;
  }): Promise<ExecutionProgress | RoutingPlan> {
    const request = RoutingRequestSchema.parse(params.request);
    const decision = this.evaluateSplitting(request);

    if (!decision.shouldSplit && (!request.executionStrategy || request.executionStrategy === 'MARKET')) {
      return this.route(request);
    }

    const strategy = (request.executionStrategy && request.executionStrategy !== 'MARKET')
      ? request.executionStrategy
      : decision.recommendedStrategy;
    const routeSlice = async (sliceReq: RoutingRequest): Promise<RoutingPlan> => {
      return this.route(sliceReq);
    };

    if (strategy === 'TWAP') {
      return this.twapExecutor.executeTwap({
        request,
        routeSlice,
        getAvailableDepth: () => this.aggregator.getTopDepth(request.side, 3),
        abortSignal: params.abortSignal,
        onProgress: params.onProgress,
      });
    }

    if (strategy === 'VWAP') {
      return this.vwapExecutor.executeVwap({
        request,
        routeSlice,
        abortSignal: params.abortSignal,
        onProgress: params.onProgress,
      });
    }

    if (strategy === 'ICEBERG') {
      return this.icebergExecutor.executeIceberg({
        request,
        routeSlice,
        abortSignal: params.abortSignal,
        onProgress: params.onProgress,
      });
    }

    return this.route(request);
  }
}
