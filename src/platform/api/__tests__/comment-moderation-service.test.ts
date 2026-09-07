/**
 * Tests for Comment Moderation Service
 * Phase 34b Content Personalization
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mutable mocks — tests can override fastChatMock per-case while the
// default (reject) keeps the keyword-fallback path intact for existing tests.
const { fastChatMock } = vi.hoisted(() => ({
  fastChatMock: vi.fn(),
}));

// Must be a real class (not vi.fn) because the source calls `new LlmRouter()`.
vi.mock('../../../lib/llm-router', () => ({
  LlmRouter: class {
    chat = vi.fn();
    fastChat = fastChatMock;
  },
}));

import { moderateComment } from '../routes/comment-moderation-service';

// Note: moderateComment uses LlmRouter which may not be available in test.
// The service falls back to keyword detection on error, which we verify here.
describe('moderateComment', () => {
  beforeEach(() => {
    fastChatMock.mockReset();
    fastChatMock.mockRejectedValue(new Error('LLM unavailable in test'));
  });
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

  // ── LLM success path (lines 58-74) ────────────────────────────────────────

  it('returns parsed result when LLM returns valid JSON approval', async () => {
    fastChatMock.mockResolvedValue({
      content: '{"approved":true,"reason":"on-topic trading discussion","confidence":9}',
    });
    const result = await moderateComment(
      'Great analysis on the endgame strategy!',
      'TraderJoe',
    );
    expect(result.approved).toBe(true);
    expect(result.reason).toBe('on-topic trading discussion');
    expect(result.confidenceScore).toBe(9);
  });

  it('returns parsed result when LLM returns valid JSON rejection', async () => {
    fastChatMock.mockResolvedValue({
      content: 'Here is my verdict:\n{"approved":false,"reason":"spam","confidence":8}',
    });
    const result = await moderateComment('Buy now cheap pills', 'Spammer');
    expect(result.approved).toBe(false);
    expect(result.reason).toBe('spam');
    expect(result.confidenceScore).toBe(8);
  });

  it('falls back to keyword check when LLM JSON has no confidence number', async () => {
    fastChatMock.mockResolvedValue({
      content: '{"approved":true,"reason":"looks fine"}',
    });
    // No blocked keywords, length >= 3 → keyword path approves
    const result = await moderateComment('A solid post, thanks for sharing', 'Reader');
    expect(result.approved).toBe(true);
    expect(result.confidenceScore).toBe(5); // default when confidence missing
  });

  it('falls back to keyword check when LLM returns no JSON object', async () => {
    fastChatMock.mockResolvedValue({
      content: 'I cannot parse this comment.',
    });
    const result = await moderateComment('Great post about trading', 'Reader');
    expect(result.approved).toBe(true); // keyword path approves clean text
  });

  it('falls back to keyword check when LLM returns malformed JSON', async () => {
    fastChatMock.mockResolvedValue({
      content: '{approved: true, broken json}',
    });
    const result = await moderateComment('Nice analysis today', 'Reader');
    expect(result.approved).toBe(true);
  });

  it('falls back to keyword check when LLM returns empty content', async () => {
    fastChatMock.mockResolvedValue({ content: '' });
    const result = await moderateComment('Thanks for the update', 'Reader');
    expect(result.approved).toBe(true);
  });

  it('handles non-Error throws from LLM (line 81)', async () => {
    fastChatMock.mockImplementation(() => { throw 'string-error'; });
    const result = await moderateComment('hello world', 'Author');
    // Falls back to keyword path — clean text → approved
    expect(result.approved).toBe(true);
    expect(result.confidenceScore).toBe(5);
  });

  it('truncates long content to 500 chars before sending to LLM', async () => {
    fastChatMock.mockResolvedValue({
      content: '{"approved":true,"reason":"ok","confidence":7}',
    });
    const longContent = 'a'.repeat(2000);
    await moderateComment(longContent, 'Verbose');
    const callArg = fastChatMock.mock.calls[0][0];
    const userMessage = callArg.messages[1];
    // content.slice(0, 500) → the Comment portion is capped at 500 chars.
    // Format: `Author: "Verbose"\nComment: "<500 a's>"` → 500 char body is the key invariant.
    expect(userMessage.content).toContain(`Comment: "${'a'.repeat(500)}"`);
    // Total payload length: prefix + 500 chars of content (+ optional trailing quote).
    expect(userMessage.content.length).toBeGreaterThanOrEqual(500);
    expect(userMessage.content.length).toBeLessThan(600);
  });
});
