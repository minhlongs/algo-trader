import { describe, it, expect } from 'vitest';
import { AdverseSelectionGuard } from '../../../../src/desk/risk/adverse-selection-guard';

describe('AdverseSelectionGuard', () => {
  it('returns normal state when VPIN is below warning threshold', () => {
    const guard = new AdverseSelectionGuard({ vpinWarningThreshold: 0.40, vpinCriticalThreshold: 0.60 });
    const assessment = guard.assessMarket({
      marketId: 'm-low-risk',
      vpin: 0.25,
      ofi: 10,
    });

    expect(assessment.state).toBe('NORMAL');
    expect(assessment.spreadMultiplier).toBe(1.0);
    expect(assessment.shouldCancelQuotes).toBe(false);
  });

  it('widens spread dynamically in elevated risk state', () => {
    const guard = new AdverseSelectionGuard({ vpinWarningThreshold: 0.40, vpinCriticalThreshold: 0.60, sensitivityFactor: 5.0 });
    const assessment = guard.assessMarket({
      marketId: 'm-mid-risk',
      vpin: 0.50,
      ofi: 50,
    });

    expect(assessment.state).toBe('ELEVATED');
    // 1.0 + (0.50 - 0.40) * 5.0 = 1.5
    expect(assessment.spreadMultiplier).toBe(1.5);
    expect(assessment.shouldCancelQuotes).toBe(false);
  });

  it('purges quotes and sets maximum multiplier in toxic flow state', () => {
    const guard = new AdverseSelectionGuard({ vpinCriticalThreshold: 0.65, maxSpreadMultiplier: 3.0 });
    const assessment = guard.assessMarket({
      marketId: 'm-toxic',
      vpin: 0.70,
      ofi: 100,
    });

    expect(assessment.state).toBe('TOXIC');
    expect(assessment.shouldCancelQuotes).toBe(true);
    expect(assessment.spreadMultiplier).toBe(3.0);
  });
});
