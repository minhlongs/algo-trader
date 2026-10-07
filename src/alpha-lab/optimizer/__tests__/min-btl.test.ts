import { expect, test } from 'vitest';
import { validateMinBTL } from '../min-btl';
import type { WalkForwardSummary } from '../../walkforward/walkforward-types';

test('minBTL validation', () => {
    // Creating mock summary
    const summary = {
        cumulativeEquity: new Array(100).fill({ equity: 100 }),
        totalTestTrades: 10,
    } as unknown as WalkForwardSummary;

    const config = { minBars: 50, minTrades: 5 };
    expect(validateMinBTL(summary, config)).toBe(true);

    const failConfig = { minBars: 200, minTrades: 5 };
    expect(validateMinBTL(summary, failConfig)).toBe(false);
});
