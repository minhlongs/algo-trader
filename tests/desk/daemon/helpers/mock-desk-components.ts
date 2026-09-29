/**
 * Mock Trading Engines & Market Feeds
 * Deterministic test intents and controllable market data feeds
 */

import { z } from 'zod';
import type {
  UnifiedTradeIntent,
  IntentUrgency,
  IntentOrderType,
} from '../../../src/desk/orchestrator/orchestrator-types';
import type { EngineId } from '../../../src/desk/portfolio/types';
import type { VenueId } from '../../../src/desk/sor/sor-types';

export interface MockTick {
  venue: string;
  symbol: string;
  bid: number;
  ask: number;
  timestamp: number;
  bids?: [number, number][];
  asks?: [number, number][];
}

export function createDeterministicIntent(
  engineId: EngineId,
  symbol: string,
  venue: VenueId,
  urgency: IntentUrgency,
  orderType: IntentOrderType,
  overrides?: Partial<UnifiedTradeIntent>
): UnifiedTradeIntent {
  const ts = 1727500000000;
  return {
    intentId: `intent-${engineId}-${Math.abs(ts).toString(36)}`,
    engineId,
    symbol,
    venue,
    side: 'BUY',
    quantity: 1.0,
    price: 65000.0,
    urgency,
    expectedEdgeBps: 25,
    expectedSharpe: 2.1,
    timeToExpiryMs: 5000,
    expiresAt: ts + 5000,
    orderType,
    isRiskReducing: false,
    ...overrides,
  };
}

export function createMockArbIntent(overrides?: Partial<UnifiedTradeIntent>): UnifiedTradeIntent {
  return createDeterministicIntent('arbitrage', 'BTC/USDT', 'binance', 'HIGH', 'IOC', {
    expectedEdgeBps: 45,
    expectedSharpe: 2.8,
    ...overrides,
  });
}

export function createMockMarlIntent(overrides?: Partial<UnifiedTradeIntent>): UnifiedTradeIntent {
  return createDeterministicIntent('marl', 'BTC/USDT', 'polymarket_clob', 'LOW', 'TWO_SIDED_QUOTE', {
    expectedEdgeBps: 20,
    expectedSharpe: 2.0,
    ...overrides,
  });
}

export function createMockAmmIntent(overrides?: Partial<UnifiedTradeIntent>): UnifiedTradeIntent {
  return createDeterministicIntent('amm', 'ETH/USDT', 'amm_cpmm', 'MEDIUM', 'LIMIT', {
    expectedEdgeBps: 30,
    expectedSharpe: 1.9,
    ...overrides,
  });
}

export function createMockAlphaIntent(overrides?: Partial<UnifiedTradeIntent>): UnifiedTradeIntent {
  return createDeterministicIntent('alpha-lab', 'BTC/USDT', 'bybit', 'LOW', 'MARKET', {
    expectedEdgeBps: 80,
    expectedSharpe: 2.5,
    ...overrides,
  });
}

export class MockEngineInstance {
  public status: 'STOPPED' | 'STARTING' | 'RUNNING' | 'PAUSED' | 'ERROR' = 'STOPPED';
  public lastSignalTime?: number;
  private queuedIntents: UnifiedTradeIntent[] = [];
  private shouldFailPoll = false;
  private pollErrorMessage = 'Engine poll failed';

  constructor(public readonly engineId: EngineId) {}

  public async start(): Promise<void> {
    this.status = 'RUNNING';
  }

  public async stop(): Promise<void> {
    this.status = 'STOPPED';
  }

  public setQueue(intents: UnifiedTradeIntent[]): void {
    this.queuedIntents = [...intents];
  }

  public setFailOnPoll(fail: boolean, message?: string): void {
    this.shouldFailPoll = fail;
    if (message) this.pollErrorMessage = message;
  }

  public async poll(): Promise<UnifiedTradeIntent[]> {
    if (this.shouldFailPoll) {
      this.status = 'ERROR';
      throw new Error(this.pollErrorMessage);
    }
    const intents = [...this.queuedIntents];
    this.queuedIntents = [];
    if (intents.length > 0) {
      this.lastSignalTime = Date.now();
    }
    return intents;
  }
}

export class MockMarketDataFeed {
  private ticks: Map<string, MockTick> = new Map();

  private makeKey(venue: string, symbol: string): string {
    return `${venue.toLowerCase()}::${symbol.toUpperCase()}`;
  }

  public setTick(venue: string, symbol: string, bid: number, ask: number, timestamp?: number): void {
    const key = this.makeKey(venue, symbol);
    this.ticks.set(key, {
      venue,
      symbol,
      bid,
      ask,
      timestamp: timestamp ?? Date.now(),
    });
  }

  public setDepth(venue: string, symbol: string, bids: [number, number][], asks: [number, number][], timestamp?: number): void {
    const key = this.makeKey(venue, symbol);
    const bestBid = bids[0]?.[0] ?? 0;
    const bestAsk = asks[0]?.[0] ?? 0;
    this.ticks.set(key, {
      venue,
      symbol,
      bid: bestBid,
      ask: bestAsk,
      bids,
      asks,
      timestamp: timestamp ?? Date.now(),
    });
  }

  public getTick(venue: string, symbol: string): MockTick | undefined {
    return this.ticks.get(this.makeKey(venue, symbol));
  }

  public getMidPrice(venue: string, symbol: string): number | undefined {
    const tick = this.getTick(venue, symbol);
    if (!tick || tick.bid <= 0 || tick.ask <= 0 || tick.bid > tick.ask) {
      return undefined;
    }
    return (tick.bid + tick.ask) / 2;
  }

  public getWeightedMidPrice(venue: string, symbol: string): number | undefined {
    const tick = this.getTick(venue, symbol);
    if (!tick || !tick.bids?.[0] || !tick.asks?.[0]) {
      return this.getMidPrice(venue, symbol);
    }
    const [bestBid, bidVol] = tick.bids[0];
    const [bestAsk, askVol] = tick.asks[0];
    if (bidVol + askVol <= 0) return (bestBid + bestAsk) / 2;
    return (bestBid * askVol + bestAsk * bidVol) / (bidVol + askVol);
  }

  public getStalenessMs(venue: string, symbol: string, now?: number): number {
    const tick = this.getTick(venue, symbol);
    if (!tick) return Number.MAX_SAFE_INTEGER;
    const currentTime = now ?? Date.now();
    return Math.max(0, currentTime - tick.timestamp);
  }

  public clear(): void {
    this.ticks.clear();
  }
}
