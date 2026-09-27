/**
 * Deterministic Synthetic Market Replay Engine for MARL Market-Making.
 * Simulates discrete L2 orderbook evolution, queue positions, and stochastic/market-crossing fills.
 */

import { MarketReplayConfigSchema, type MarketReplayConfig } from '../types/marl-config-types';
import type { MarlOrderBook, MarlOrderBookLevel, QuoteProposal } from '../types/marl-types';
import type { MarlFillEvent, MarlLimitOrder } from '../types/marl-execution-types';
import { calculateFillProbability } from '../models/arrival-intensity';

export interface ReplayStepResult {
  step: number;
  orderBook: MarlOrderBook;
  fills: MarlFillEvent[];
  midPrice: number;
  done: boolean;
}

export class MarketReplayEngine {
  public readonly config: MarketReplayConfig;
  private currentStep = 0;
  private currentMidPrice: number;
  private activeOrders: MarlLimitOrder[] = [];
  private readonly seed: number;
  private prngState: number;

  constructor(config?: Partial<MarketReplayConfig>) {
    this.config = MarketReplayConfigSchema.parse(config ?? {});
    this.currentMidPrice = this.config.initialMidPrice;
    this.seed = this.config.randomSeed ?? 12345;
    this.prngState = this.seed;
  }

  private nextRandom(): number {
    let t = (this.prngState += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  private nextGaussian(): number {
    const u1 = Math.max(1e-10, this.nextRandom());
    const u2 = this.nextRandom();
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  }

  public reset(): void {
    this.currentStep = 0;
    this.currentMidPrice = this.config.initialMidPrice;
    this.activeOrders = [];
    this.prngState = this.seed;
  }

  public submitQuote(p: QuoteProposal): MarlLimitOrder[] {
    const orders: MarlLimitOrder[] = [];
    const now = Date.now();
    const qFactor = this.config.queueDepletionFactor;
    const make = (side: 'buy' | 'sell', price: number, amount: number): MarlLimitOrder => ({
      orderId: `replay-ord-${p.agentId}-${side}-${this.currentStep}`,
      agentId: p.agentId, symbol: p.symbol, venue: p.venue, side, type: 'limit',
      price, amount, filledAmount: 0, remainingAmount: amount, status: 'ACTIVE',
      createdAt: now, updatedAt: now, queuePosition: Math.round(amount * qFactor),
    });
    if (p.bidSize > 0 && p.bidPrice > 0) orders.push(make('buy', p.bidPrice, p.bidSize));
    if (p.askSize > 0 && p.askPrice > 0) orders.push(make('sell', p.askPrice, p.askSize));
    this.activeOrders = orders;
    return orders;
  }

  public step(): ReplayStepResult {
    this.currentStep++;
    const dt = this.config.timeStepSec;
    const vol = this.config.volatility;
    const shock = this.nextGaussian() * vol * Math.sqrt(dt);
    this.currentMidPrice = Number(
      Math.max(0.02, Math.min(0.98, this.currentMidPrice * Math.exp(shock))).toFixed(4),
    );

    const book = this.generateOrderBook(this.currentMidPrice, this.config.tickSize);
    const fills = this.matchOrders(book);

    return {
      step: this.currentStep,
      orderBook: book,
      fills,
      midPrice: this.currentMidPrice,
      done: this.currentStep >= this.config.stepCount,
    };
  }

  private generateOrderBook(mid: number, tick: number): MarlOrderBook {
    const bids: MarlOrderBookLevel[] = [];
    const asks: MarlOrderBookLevel[] = [];
    for (let i = 1; i <= 5; i++) {
      bids.push({ price: Number(Math.max(0.01, mid - i * tick).toFixed(4)), size: 100 + Math.round(this.nextRandom() * 200) });
      asks.push({ price: Number(Math.min(0.99, mid + i * tick).toFixed(4)), size: 100 + Math.round(this.nextRandom() * 200) });
    }
    return { symbol: this.config.symbol, venue: this.config.venue, bids, asks, timestamp: Date.now() + this.currentStep * 1000 };
  }

  private matchOrders(book: MarlOrderBook): MarlFillEvent[] {
    const fills: MarlFillEvent[] = [];
    const remainingActive: MarlLimitOrder[] = [];

    for (const order of this.activeOrders) {
      if (order.status !== 'ACTIVE') continue;
      const isBuy = order.side === 'buy';
      let isFilled = false;

      if (isBuy && order.price >= (book.asks[0]?.price ?? 1.0)) {
        isFilled = true;
      } else if (!isBuy && order.price <= (book.bids[0]?.price ?? 0.0)) {
        isFilled = true;
      } else {
        const dist = Math.abs(order.price - this.currentMidPrice);
        const fillProb = calculateFillProbability({
          spreadDistance: dist,
          baselineArrivalRate: this.config.arrivalIntensity,
          kappa: 1.5,
          timeDeltaSec: this.config.timeStepSec,
          queueAhead: order.queuePosition,
        });
        if (this.nextRandom() < fillProb) {
          isFilled = true;
        } else if (order.queuePosition && order.queuePosition > 0) {
          order.queuePosition = Math.max(0, order.queuePosition - 50);
        }
      }

      if (isFilled) {
        order.status = 'FILLED';
        order.filledAmount = order.amount;
        order.remainingAmount = 0;
        fills.push({
          fillId: `fill-${order.orderId}`,
          orderId: order.orderId,
          agentId: order.agentId,
          symbol: order.symbol,
          venue: order.venue,
          side: order.side,
          price: order.price,
          amount: order.amount,
          fee: Number((order.amount * order.price * 0.001).toFixed(4)),
          liquidity: 'maker',
          timestamp: Date.now(),
        });
      } else {
        remainingActive.push(order);
      }
    }

    this.activeOrders = remainingActive;
    return fills;
  }

  public getActiveOrders(): MarlLimitOrder[] {
    return [...this.activeOrders];
  }

  public getCurrentMidPrice(): number {
    return this.currentMidPrice;
  }
}
