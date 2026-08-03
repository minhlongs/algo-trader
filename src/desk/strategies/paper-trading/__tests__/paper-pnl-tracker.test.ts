import { describe, it, expect } from 'vitest';
import { getPaperPnlTracker } from '../paper-pnl-tracker';

describe('paper-trading::paper-pnl-tracker::getPaperPnlTracker', () => {
  it('is a function', () => {
    expect(typeof getPaperPnlTracker).toBe('function');
  });
});

