/**
 * Tests for fallback-handler — handleFallback unclassified-query handler.
 *
 * Pure function (no deps, no I/O), so the test is a snapshot of the
 * fixed answer text and the five quick-action buttons.
 */
import { describe, it, expect } from 'vitest';

import { handleFallback } from '../fallback-handler';

describe('handleFallback', () => {
  it('returns a CopilotResponse with an answer and actions', () => {
    const res = handleFallback();

    expect(res.answer).toContain('I can help with these trading questions:');
    expect(res.answer).toContain('1. **Risk Assessment**');
    expect(res.answer).toContain('2. **Arb Scan**');
    expect(res.answer).toContain('3. **Strategy Performance**');
    expect(res.answer).toContain('4. **Market Regime**');
    expect(res.answer).toContain('5. **Weekly Report**');
    expect(res.answer).toContain('Try one of the quick actions below!');
  });

  it('lists exactly five quick-action buttons with execute actions', () => {
    const res = handleFallback();

    expect(res.actions).toHaveLength(5);
    expect(res.actions.map((a) => a.label)).toEqual([
      'Risk Assessment', 'Scan Arb', 'Performance', 'Market Regime', 'Generate Report',
    ]);
    expect(res.actions.every((a) => a.action === 'execute')).toBe(true);
  });

  it('maps each quick action to its payload command', () => {
    const res = handleFallback();

    expect(res.actions.map((a) => a.payload)).toEqual([
      'risk_assessment', 'arb_scan', 'strategy_performance', 'market_regime', 'weekly_report',
    ]);
  });

  it('never offers free-text chat', () => {
    const res = handleFallback();

    expect(res.answer).not.toMatch(/chat|converse|talk to me/i);
    expect(res.actions).toHaveLength(5);
  });
});
