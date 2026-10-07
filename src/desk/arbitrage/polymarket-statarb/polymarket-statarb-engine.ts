import {
  PolymarketStatArbConfig,
  MarketMakingQuote,
  CexTick,
  ToxicFlowAnalysis,
  OrderSide,
} from './polymarket-statarb-types';
import {
  computeBinaryOptionProbability,
  CexVelocityDetector,
} from './polymarket-statarb-pricing';

export class PolymarketStatArbEngine {
  private readonly config: PolymarketStatArbConfig;
  private readonly velocityDetector: CexVelocityDetector;
  private currentInventory = 0;
  private latestSpotPrice = 0;

  constructor(config: PolymarketStatArbConfig) {
    this.config = config;
    this.velocityDetector = new CexVelocityDetector(5000, config.toxicVelocityThreshold);
  }

  public recordCexTick(tick: CexTick): void {
    this.latestSpotPrice = tick.price;
    this.velocityDetector.recordTick(tick);
  }

  public setInventory(inventory: number): void {
    this.currentInventory = inventory;
  }

  public updateInventoryDelta(delta: number): void {
    this.currentInventory += delta;
  }

  public getInventory(): number {
    return this.currentInventory;
  }

  public calculateQuote(nowMs = Date.now()): MarketMakingQuote {
    const timeToExpiryYears = Math.max(
      0.0001,
      (this.config.expiryTimestampMs - nowMs) / (365.25 * 86400 * 1000)
    );
    const vol = this.config.volatilityDefault ?? 0.65;
    const rfr = this.config.riskFreeRate ?? 0.04;

    const pricing = computeBinaryOptionProbability({
      spotPrice: this.latestSpotPrice,
      strikePrice: this.config.strikePrice,
      timeToExpiryYears,
      volatility: vol,
      riskFreeRate: rfr,
    });

    const theoreticalFair = pricing.binaryCallProbability;
    const flowAnalysis = this.velocityDetector.analyzeFlow(nowMs);

    const horizonFraction = Math.min(1.0, timeToExpiryYears);
    const inventorySkew =
      this.currentInventory * this.config.riskAversionGamma * (vol * vol) * horizonFraction * 0.1;
    const reservationPrice = Math.max(0.01, Math.min(0.99, theoreticalFair - inventorySkew));

    const halfSpread = this.config.baseSpread / 2;
    let bidPrice = Math.max(0.01, Math.min(0.99, reservationPrice - halfSpread));
    let askPrice = Math.max(0.01, Math.min(0.99, reservationPrice + halfSpread));

    if (bidPrice >= askPrice) {
      askPrice = Math.min(0.99, bidPrice + 0.01);
    }

    let bidSize = this.config.orderLotSize;
    let askSize = this.config.orderLotSize;

    if (this.currentInventory >= this.config.maxInventory) {
      bidSize = 0;
    }
    if (this.currentInventory <= -this.config.maxInventory) {
      askSize = 0;
    }

    let toxicCancel = false;
    let cancelReason: string | undefined;

    if (flowAnalysis.isToxic) {
      toxicCancel = true;
      cancelReason = `Toxic flow detected: velocity ${flowAnalysis.velocity} in direction ${flowAnalysis.skewDirection}`;
      if (flowAnalysis.skewDirection === 'UP') {
        askSize = 0;
      } else if (flowAnalysis.skewDirection === 'DOWN') {
        bidSize = 0;
      }
    }

    return {
      reservationPrice: Number(reservationPrice.toFixed(4)),
      optimalSpread: Number((askPrice - bidPrice).toFixed(4)),
      bidPrice: Number(bidPrice.toFixed(4)),
      askPrice: Number(askPrice.toFixed(4)),
      bidSize,
      askSize,
      toxicCancel,
      cancelReason,
    };
  }

  public evaluateToxicCancel(quote: MarketMakingQuote): {
    shouldCancel: boolean;
    cancelSide: OrderSide | 'ALL' | null;
    reason?: string;
  } {
    const flow = this.velocityDetector.analyzeFlow();
    if (!flow.isToxic) {
      return { shouldCancel: false, cancelSide: null };
    }

    if (flow.skewDirection === 'UP') {
      return {
        shouldCancel: true,
        cancelSide: 'SELL',
        reason: 'CEX rapid upward spike: pulling sell quotes to prevent toxic fill',
      };
    }

    if (flow.skewDirection === 'DOWN') {
      return {
        shouldCancel: true,
        cancelSide: 'BUY',
        reason: 'CEX rapid downward dump: pulling buy quotes to prevent adverse selection',
      };
    }

    return {
      shouldCancel: true,
      cancelSide: 'ALL',
      reason: 'Extreme symmetric volatility detected',
    };
  }
}
