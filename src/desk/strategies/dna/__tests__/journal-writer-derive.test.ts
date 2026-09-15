import { describe, it, expect } from 'vitest';
import { deriveDecision, deriveExecutedBy } from '../journal-writer.js';
import { consensus } from './journal-writer-fixtures.js';

describe('deriveDecision', () => {
  it('paperMode => paper_only regardless of action', () => {
    expect(deriveDecision(consensus({ action: 'enter_long' }), true)).toBe('paper_only');
    expect(deriveDecision(consensus({ action: 'hold' }), true)).toBe('paper_only');
    expect(deriveDecision(consensus({ action: 'enter_short' }), true)).toBe('paper_only');
  });

  it('live mode + hold => rejected_low_confidence', () => {
    expect(deriveDecision(consensus({ action: 'hold' }), false)).toBe(
      'rejected_low_confidence',
    );
  });

  it('live mode + enter_long => executed', () => {
    expect(deriveDecision(consensus({ action: 'enter_long' }), false)).toBe('executed');
  });

  it('live mode + enter_short => executed', () => {
    expect(deriveDecision(consensus({ action: 'enter_short' }), false)).toBe('executed');
  });
});

describe('deriveExecutedBy', () => {
  it('paperMode => paper regardless of action', () => {
    expect(deriveExecutedBy(consensus({ action: 'enter_long' }), true)).toBe('paper');
    expect(deriveExecutedBy(consensus({ action: 'hold' }), true)).toBe('paper');
    expect(deriveExecutedBy(consensus({ action: 'enter_short' }), true)).toBe('paper');
  });

  it('live mode + hold => none', () => {
    expect(deriveExecutedBy(consensus({ action: 'hold' }), false)).toBe('none');
  });

  it('live mode + non-hold => live', () => {
    expect(deriveExecutedBy(consensus({ action: 'enter_long' }), false)).toBe('live');
    expect(deriveExecutedBy(consensus({ action: 'enter_short' }), false)).toBe('live');
  });
});
