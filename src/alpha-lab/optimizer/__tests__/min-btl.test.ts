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

    const failTradesConfig = { minBars: 50, minTrades: 20 };
    expect(validateMinBTL(summary, failTradesConfig)).toBe(false);

    const emptyTradesSummary = {
        cumulativeEquity: new Array(100).fill({ equity: 100 }),
    } as unknown as WalkForwardSummary;
    expect(validateMinBTL(emptyTradesSummary, { minBars: 50, minTrades: 1 })).toBe(false);
    expect(validateMinBTL(emptyTradesSummary, { minBars: 50, minTrades: 0 })).toBe(true);
});
