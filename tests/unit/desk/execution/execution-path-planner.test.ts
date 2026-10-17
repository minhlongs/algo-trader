/**
 * Execution Path Planner Test Suite
 */

import { describe, it, expect } from 'vitest';
import {
  planExecutionPath,
  summarizeExecutionPlan,
  type LegMetadata,
} from '../../../../src/desk/execution/execution-path-planner';
import {
  computeLegScore,
  estimateSlippage,
  buildReason,
} from '../../../../src/desk/execution/execution-path-scorer';
import type { MultiLegBasket, ILPPosition } from '../../../../src/shared/types/ilp-types';

describe('ExecutionPathPlanner Suite', () => {
  const dummyBasket: MultiLegBasket = {
    id: 'basket-1',
    positions: [
      { marketId: 'mkt-1', side: 'YES', size: 100, price: 0.5, expectedProfit: 0.05 },
      { marketId: 'mkt-2', side: 'NO', size: 50, price: 0.4, expectedProfit: 0.02 },
      { marketId: 'mkt-3', side: 'YES', size: 200, price: 0.6, expectedProfit: 0.10 },
    ],
    totalCost: 350,
    expectedReturn: 0.07,
    status: 'OPTIMIZED',
    createdAt: Date.now(),
  };

  const metadataMap = new Map<string, LegMetadata>([
    ['mkt-1', { marketId: 'mkt-1', side: 'YES', liquidity: 5000, urgency: 0.8 }],
    ['mkt-2', { marketId: 'mkt-2', side: 'NO', liquidity: 10000, urgency: 0.2 }],
    ['mkt-3', { marketId: 'mkt-3', side: 'YES', liquidity: 2000, urgency: 0.9 }],
  ]);

  it('handles empty baskets cleanly', () => {
    const emptyBasket: MultiLegBasket = {
      ...dummyBasket,
      positions: [],
      totalCost: 0,
    };
    const plan = planExecutionPath(emptyBasket, metadataMap);
    expect(plan.steps).toHaveLength(0);
    expect(plan.totalEstimatedCost).toBe(0);
  });

  it('scores legs penalizing size/liquidity and rewarding urgency & profit', () => {
    const pos: ILPPosition = { marketId: 'mkt-1', side: 'YES', size: 100, price: 0.5, expectedProfit: 0.05 };
    const meta: LegMetadata = { marketId: 'mkt-1', side: 'YES', liquidity: 5000, urgency: 0.8 };
    const score = computeLegScore(pos, meta);
    expect(score).toBeTypeOf('number');

    const slip = estimateSlippage(100, 5000);
    expect(slip).toBeCloseTo((100 ** 2 / 5000) * 0.001, 6);

    const reason = buildReason(pos, meta, 0, 3);
    expect(reason).toContain('high liquidity');
    expect(reason).toContain('urgent');
  });

  it('plans execution path without optimizer accurately', () => {
    const plan = planExecutionPath(dummyBasket, metadataMap, false);
    expect(plan.steps).toHaveLength(3);
    expect(plan.totalEstimatedCost).toBeGreaterThan(0);
    expect(plan.optimization).toBeUndefined();

    const summary = summarizeExecutionPlan(plan);
    expect(summary).toContain('Basket: basket-1');
    expect(summary).toContain('mkt-1');
  });

  it('plans execution path with optimizer', () => {
    const plan = planExecutionPath(dummyBasket, metadataMap, true);
    expect(plan.steps).toHaveLength(3);
    expect(plan.totalEstimatedCost).toBeGreaterThanOrEqual(0);
  });
});
