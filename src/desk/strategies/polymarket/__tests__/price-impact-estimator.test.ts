import { describe, it, expect, vi } from 'vitest';
import { simulatePriceImpact, calcImpactAsymmetry, determineSide, updateImpactEma, createPriceImpactEstimatorTick } from '../price-impact-estimator';
import { scanPriceImpactEntries } from '../price-impact-estimator-entries';
import { checkPriceImpactExits } from '../price-impact-estimator-exits';
import { DEFAULT_CONFIG } from '../price-impact-estimator-types';
import { createPriceImpactEstimatorState } from '../price-impact-estimator-state';

describe('price-impact-estimator::simulatePriceImpact', () => {
  it('is a defined function', () => {
    expect(typeof simulatePriceImpact).toBe('function');
  });
});

describe('price-impact-estimator::calcImpactAsymmetry', () => {
  it('is a defined function', () => {
    expect(typeof calcImpactAsymmetry).toBe('function');
  });
});

describe('price-impact-estimator::determineSide', () => {
  it('is a defined function', () => {
    expect(typeof determineSide).toBe('function');
  });
});

describe('price-impact-estimator::updateImpactEma', () => {
  it('is a defined function', () => {
    expect(typeof updateImpactEma).toBe('function');
  });
});

describe('price-impact-estimator::createPriceImpactEstimatorTick', () => {
  it('is a defined function', () => {
    expect(typeof createPriceImpactEstimatorTick).toBe('function');
  });

  it('emits CLOB V2 quadratic taker fees on entry and exit instead of hardcoded 0', async () => {
    const trades: Array<{ fees: string }> = [];
    const deps = {
      gamma: {} as never,
      clob: {
        getOrderBook: vi.fn(async () => ({
          bids: [{ price: '0.49', size: '5000' }],
          asks: [{ price: '0.51', size: '100' }, { price: '0.65', size: '5000' }],
          timestamp: Date.now(),
        })),
      } as never,
      orderManager: { placeOrder: vi.fn(async () => ({ id: 'pie-ord-1' })) } as never,
      eventBus: { emit: vi.fn((_e: string, p: { trade: { fees: string } }) => trades.push(p.trade)) } as never,
    };
    const cfg = { ...DEFAULT_CONFIG, minVolume: 100, hypotheticalSize: 500, asymmetryThreshold: 0.05, takeProfitPct: 0.05 };
    const state = createPriceImpactEstimatorState(cfg);
    await scanPriceImpactEntries([{
      conditionId: 'btc-crypto-impact',
      question: 'Will Bitcoin hit $100k?',
      yesTokenId: 'y-btc',
      noTokenId: 'n-btc',
      volume: 10_000,
      closed: false,
      resolved: false,
    }] as never, deps, cfg, state);
    expect(trades).toHaveLength(1);
    expect(Number(trades[0]!.fees)).toBeGreaterThan(0);

    deps.clob.getOrderBook = vi.fn(async () => ({
      bids: [{ price: '0.70', size: '5000' }],
      asks: [{ price: '0.72', size: '5000' }],
      timestamp: Date.now(),
    })) as never;
    await checkPriceImpactExits(deps, cfg, state);
    expect(trades).toHaveLength(2);
    expect(Number(trades[1]!.fees)).toBeGreaterThan(0);
  });
});
