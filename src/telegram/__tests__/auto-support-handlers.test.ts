import { describe, it, expect } from 'vitest';
import { matchFaq } from '../auto-support-handlers';

describe('Auto-Support FAQ Matcher', () => {
  it('should match wallet safety question', () => {
    const match = matchFaq('is my wallet safe?');
    expect(match).toBeTruthy();
    expect(match!.q).toContain('wallet');
  });

  it('should match pricing question', () => {
    const match = matchFaq('how do I pay for the service?');
    expect(match).toBeTruthy();
    expect(match!.q).toContain('pay');
  });

  it('should match cancellation question', () => {
    const match = matchFaq('I want to cancel and get a refund');
    expect(match).toBeTruthy();
    expect(match!.q).toContain('cancel');
  });

  it('should match strategy question', () => {
    const match = matchFaq('tell me about your endgame strategy');
    expect(match).toBeTruthy();
    expect(match!.q).toContain('strateg');
  });

  it('should return null for unrelated text', () => {
    const match = matchFaq('hello world xyz 12345');
    expect(match).toBeNull();
  });

  it('should match edge/algorithm question', () => {
    const match = matchFaq('how does your algorithm work?');
    expect(match).toBeTruthy();
    expect(match!.a).toContain('probability');
  });
});
