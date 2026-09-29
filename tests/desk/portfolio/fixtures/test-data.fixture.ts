import type { EngineId } from '../../../../src/desk/portfolio/types';
import type { CircuitBreakerState, EngineRiskAdapter } from './risk-contract.fixture';

export interface MockVenueBook {
  readonly venueId: string;
  readonly asks: readonly [number, number][]; // [price, quantity]
  readonly bids: readonly [number, number][];
  readonly takerFeeBps: number;
  readonly makerFeeBps: number;
  readonly gasCostUsd: number;
}

export class MockEngineRiskAdapter implements EngineRiskAdapter {
  public receivedStates: CircuitBreakerState[] = [];
  public reductionFactors: number[] = [];
  public isHalted = false;
  public isHardStopped = false;

  constructor(public readonly engineId: EngineId) {}

  public async notifyCircuitBreaker(state: CircuitBreakerState): Promise<void> {
    this.receivedStates.push(state);
  }

  public async reducePositions(reductionFactor: number): Promise<void> {
    this.reductionFactors.push(reductionFactor);
  }

  public async haltTrading(): Promise<void> {
    this.isHalted = true;
  }

  public async emergencyHardStop(): Promise<void> {
    this.isHardStopped = true;
    this.isHalted = true;
  }

  public reset(): void {
    this.receivedStates = [];
    this.reductionFactors = [];
    this.isHalted = false;
    this.isHardStopped = false;
  }
}

export function createBalancedEngineReturns(count = 50): Record<EngineId, number>[] {
  const observations: Record<EngineId, number>[] = [];
  for (let t = 0; t < count; t++) {
    observations.push({
      arbitrage: 0.0008 + 0.002 * Math.sin(t / 5),
      marl: 0.0012 + 0.004 * Math.cos(t / 4),
      amm: 0.0005 + 0.003 * Math.sin(t / 7),
      'alpha-lab': 0.0015 + 0.005 * Math.cos(t / 3),
    });
  }
  return observations;
}

export function createShockEngineReturns(): Record<EngineId, number>[] {
  const observations = createBalancedEngineReturns(30);
  // Add heavy tail jump shock at the end
  observations.push({
    arbitrage: -0.045,
    marl: -0.082,
    amm: -0.055,
    'alpha-lab': -0.110,
  });
  return observations;
}

export function createMockOrderBooks(): MockVenueBook[] {
  return [
    {
      venueId: 'binance',
      asks: [[100.0, 50], [100.2, 100], [100.5, 200]],
      bids: [[99.8, 50], [99.5, 100], [99.0, 200]],
      takerFeeBps: 8,
      makerFeeBps: 2,
      gasCostUsd: 0.0,
    },
    {
      venueId: 'bybit',
      asks: [[99.9, 30], [100.1, 80], [100.4, 150]],
      bids: [[99.7, 40], [99.4, 90], [99.1, 180]],
      takerFeeBps: 6,
      makerFeeBps: 1,
      gasCostUsd: 0.0,
    },
    {
      venueId: 'polymarket-clob',
      asks: [[100.1, 40], [100.3, 70], [100.6, 120]],
      bids: [[99.6, 35], [99.3, 60], [98.9, 100]],
      takerFeeBps: 0,
      makerFeeBps: 0,
      gasCostUsd: 0.45,
    },
    {
      venueId: 'cpmm-amm',
      asks: [[100.05, 60], [100.25, 90], [100.7, 140]],
      bids: [[99.75, 50], [99.35, 80], [98.95, 110]],
      takerFeeBps: 25,
      makerFeeBps: 25,
      gasCostUsd: 1.20,
    },
  ];
}
