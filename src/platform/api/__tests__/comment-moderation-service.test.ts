/**
 * Tests for Comment Moderation Service
 * Phase 34b Content Personalization
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../lib/llm-router', () => ({
  LlmRouter: vi.fn().mockImplementation(() => ({
    chat: vi.fn().mockRejectedValue(new Error('LLM unavailable in test')),
  })),
}));

import { moderateComment } from '../routes/comment-moderation-service';

// Note: moderateComment uses LlmRouter which may not be available in test.
// The service falls back to keyword detection on error, which we verify here.
describe('moderateComment', () => {
  it('rejects spam comments with blocked keywords', async () => {
    const result = await moderateComment('Buy now! Click here to earn $5000 fast!', 'Spammer');
    expect(result.approved).toBe(false);
    expect(result.confidenceScore).toBeGreaterThanOrEqual(5);
  });

  it('rejects comments with profanity', async () => {
    const result = await moderateComment('This is shit and fuck!', 'Angry User');
    expect(result.approved).toBe(false);
  });

  it('rejects comments that are too short', async () => {
    const result = await moderateComment('ok', 'Brief');
    expect(result.approved).toBe(false);
  });

  it('rejects comments with casino/nsfw links', async () => {
    const result = await moderateComment('Check out this casino bonus! win big', 'Bot');
    expect(result.approved).toBe(false);
  });

  it('rejects XSS attempts', async () => {
    const result = await moderateComment('<script>alert("hack")</script>', 'Hacker');
    expect(result.approved).toBe(false);
  });

  it('approves legitimate trading comments', async () => {
    const result = await moderateComment(
      'Great analysis on the endgame strategy! Have you considered using half-Kelly sizing?',
      'TraderJoe',
    );
    // LLM may or may not be available; keyword check passes this
    expect(result.approved).toBe(true);
  });

  it('approves genuine questions', async () => {
    const result = await moderateComment(
      'How does the cross-market arbitrage handle gas fees on Polygon?',
      'CuriousTrader',
    );
    expect(result.approved).toBe(true);
  });

  it('rejects .ru spam domains', async () => {
    const result = await moderateComment(
      'Visit https://spam-casino.ru for free tokens',
      'Spammer',
    );
    expect(result.approved).toBe(false);
  });
});
