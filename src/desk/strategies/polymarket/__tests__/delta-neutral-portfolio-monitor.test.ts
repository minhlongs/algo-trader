import { describe, it, expect } from 'vitest';
import { DeltaNeutralPortfolioMonitor } from '../delta-neutral-portfolio-monitor';

describe('delta-neutral-portfolio-monitor::DeltaNeutralPortfolioMonitor', () => {
  it('is a constructor and instances are objects', () => {
    expect(typeof DeltaNeutralPortfolioMonitor).toBe('function');
    // Guard: constructor should be callable as new without throwing
    expect(() => new DeltaNeutralPortfolioMonitor() as any).not.toThrow();
  });
});
