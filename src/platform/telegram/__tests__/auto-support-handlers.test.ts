/**
 * Auto-Support Handlers — Comprehensive Tests
 *
 * Tests all exported functions:
 * - handleFaq: replies with numbered FAQ list
 * - handleFaqDetail: parses /faq <number>, replies with answer, falls back to handleFaq
 * - handleSupport: replies with support info
 * - handlePricing: replies with pricing info
 * - matchFaq: keyword-based FAQ matching (existing + extended)
 * - handleUnknownMessage: fuzzy FAQ matching, skips commands, no-match fallback
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Context } from 'grammy';

import {
  handleFaq,
  handleFaqDetail,
  handleSupport,
  handlePricing,
  matchFaq,
  handleUnknownMessage,
} from '../auto-support-handlers';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeCtx(text?: string): Context {
  return {
    message: text !== undefined ? { text } : undefined,
    reply: vi.fn().mockResolvedValue(undefined),
  } as unknown as Context;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Auto-Support Handlers', () => {
  let replySpy: ReturnType<typeof vi.fn>;

  // ── handleFaq ────────────────────────────────────────────────────────────

  describe('handleFaq', () => {
    it('replies with numbered FAQ list', async () => {
      const ctx = makeCtx();
      replySpy = ctx.reply as ReturnType<typeof vi.fn>;
      await handleFaq(ctx);
      expect(replySpy).toHaveBeenCalledOnce();
      const msg = replySpy.mock.calls[0][0];
      expect(msg).toContain('Frequently Asked Questions');
      expect(msg).toContain('*1.*');
      expect(msg).toContain('*8.*');
      expect(msg).toContain('/faq <number>');
    });

    it('uses Markdown parse mode', async () => {
      const ctx = makeCtx();
      replySpy = ctx.reply as ReturnType<typeof vi.fn>;
      await handleFaq(ctx);
      expect(replySpy.mock.calls[0][1]).toEqual({ parse_mode: 'Markdown' });
    });

    it('includes all 8 FAQ questions', async () => {
      const ctx = makeCtx();
      replySpy = ctx.reply as ReturnType<typeof vi.fn>;
      await handleFaq(ctx);
      const msg = replySpy.mock.calls[0][0];
      expect(msg).toContain('wallet');
      expect(msg).toContain('edge');
      expect(msg).toContain('cancel');
      expect(msg).toContain('markets');
      expect(msg).toContain('pay');
      expect(msg).toContain('API');
      expect(msg).toContain('free');
      expect(msg).toContain('strategies');
    });
  });

  // ── handleFaqDetail ──────────────────────────────────────────────────────

  describe('handleFaqDetail', () => {
    it('replies with answer for valid FAQ number', async () => {
      const ctx = makeCtx('/faq 1');
      replySpy = ctx.reply as ReturnType<typeof vi.fn>;
      await handleFaqDetail(ctx);
      expect(replySpy).toHaveBeenCalledOnce();
      const msg = replySpy.mock.calls[0][0];
      expect(msg).toContain('Q: Is my wallet safe');
      expect(msg).toContain('AES-256-GCM');
    });

    it('handles leading whitespace before number', async () => {
      const ctx = makeCtx('/faq  3');
      replySpy = ctx.reply as ReturnType<typeof vi.fn>;
      await handleFaqDetail(ctx);
      const msg = replySpy.mock.calls[0][0];
      expect(msg).toContain('Q: Can I cancel anytime?');
    });

    it('replies with FAQ list for non-numeric input', async () => {
      const ctx = makeCtx('/faq abc');
      replySpy = ctx.reply as ReturnType<typeof vi.fn>;
      await handleFaqDetail(ctx);
      const msg = replySpy.mock.calls[0][0];
      expect(msg).toContain('Frequently Asked Questions');
    });

    it('replies with FAQ list for out-of-range number (0)', async () => {
      const ctx = makeCtx('/faq 0');
      replySpy = ctx.reply as ReturnType<typeof vi.fn>;
      await handleFaqDetail(ctx);
      const msg = replySpy.mock.calls[0][0];
      expect(msg).toContain('Frequently Asked Questions');
    });

    it('replies with FAQ list for out-of-range number (99)', async () => {
      const ctx = makeCtx('/faq 99');
      replySpy = ctx.reply as ReturnType<typeof vi.fn>;
      await handleFaqDetail(ctx);
      const msg = replySpy.mock.calls[0][0];
      expect(msg).toContain('Frequently Asked Questions');
    });

    it('replies with FAQ list for empty message', async () => {
      const ctx = makeCtx('');
      replySpy = ctx.reply as ReturnType<typeof vi.fn>;
      await handleFaqDetail(ctx);
      const msg = replySpy.mock.calls[0][0];
      expect(msg).toContain('Frequently Asked Questions');
    });

    it('replies with FAQ list for undefined message text', async () => {
      const ctx = makeCtx(undefined);
      replySpy = ctx.reply as ReturnType<typeof vi.fn>;
      await handleFaqDetail(ctx);
      const msg = replySpy.mock.calls[0][0];
      expect(msg).toContain('Frequently Asked Questions');
    });

    it('works for all valid FAQ numbers (1-8)', async () => {
      for (let i = 1; i <= 8; i++) {
        const ctx = makeCtx(`/faq ${i}`);
        replySpy = ctx.reply as ReturnType<typeof vi.fn>;
        await handleFaqDetail(ctx);
        const msg = replySpy.mock.calls[0][0];
        expect(msg).toContain('Q:');
      }
    });
  });

  // ── handleSupport ────────────────────────────────────────────────────────

  describe('handleSupport', () => {
    it('replies with support info', async () => {
      const ctx = makeCtx();
      replySpy = ctx.reply as ReturnType<typeof vi.fn>;
      await handleSupport(ctx);
      expect(replySpy).toHaveBeenCalledOnce();
      const msg = replySpy.mock.calls[0][0];
      expect(msg).toContain('CashClaw Support');
      expect(msg).toContain('/faq');
      expect(msg).toContain('/pricing');
      expect(msg).toContain('/status');
      expect(msg).toContain('/limits');
      expect(msg).toContain('support@cashclaw.cc');
    });

    it('uses Markdown parse mode', async () => {
      const ctx = makeCtx();
      replySpy = ctx.reply as ReturnType<typeof vi.fn>;
      await handleSupport(ctx);
      expect(replySpy.mock.calls[0][1]).toEqual({ parse_mode: 'Markdown' });
    });
  });

  // ── handlePricing ────────────────────────────────────────────────────────

  describe('handlePricing', () => {
    it('replies with pricing tiers', async () => {
      const ctx = makeCtx();
      replySpy = ctx.reply as ReturnType<typeof vi.fn>;
      await handlePricing(ctx);
      expect(replySpy).toHaveBeenCalledOnce();
      const msg = replySpy.mock.calls[0][0];
      expect(msg).toContain('Starter');
      expect(msg).toContain('$49');
      expect(msg).toContain('Pro');
      expect(msg).toContain('$149');
      expect(msg).toContain('Elite');
      expect(msg).toContain('$499');
      expect(msg).toContain('cashclaw.cc');
    });

    it('uses Markdown parse mode', async () => {
      const ctx = makeCtx();
      replySpy = ctx.reply as ReturnType<typeof vi.fn>;
      await handlePricing(ctx);
      expect(replySpy.mock.calls[0][1]).toEqual({ parse_mode: 'Markdown' });
    });
  });

  // ── matchFaq (extended) ──────────────────────────────────────────────────

  describe('matchFaq — extended', () => {
    it('matches wallet safety keywords', () => {
      const m = matchFaq('is my wallet secure?');
      expect(m).not.toBeNull();
      expect(m!.q).toContain('wallet');
    });

    it('matches pricing/billing keywords', () => {
      const m = matchFaq('billing cost usdt');
      expect(m).not.toBeNull();
      expect(m!.q).toContain('pay');
    });

    it('matches empty string to market FAQ (empty word matches all keywords >= 4 chars)', () => {
      // "".split(/\s+/) = [""], kw.startsWith("") is true for all kw.length >= 4
      const m = matchFaq('');
      expect(m).not.toBeNull();
      expect(m!.q).toContain('market');
    });

    it('matches cancellation keywords', () => {
      const m = matchFaq('I want to unsubscribe');
      expect(m).not.toBeNull();
      expect(m!.q).toContain('cancel');
    });

    it('matches strategy keywords', () => {
      const m = matchFaq('tell me about whale arbitrage');
      expect(m).not.toBeNull();
      expect(m!.q).toContain('strateg');
    });

    it('matches edge/algorithm keywords', () => {
      const m = matchFaq('how does the signal work');
      expect(m).not.toBeNull();
      expect(m!.q).toContain('edge');
    });

    it('matches market keywords', () => {
      const m = matchFaq('which markets do you cover');
      expect(m).not.toBeNull();
      expect(m!.q).toContain('market');
    });

    it('matches API/integration keywords', () => {
      const m = matchFaq('how do I connect my API key');
      expect(m).not.toBeNull();
      expect(m!.q).toContain('API');
    });

    it('matches trial/demo keywords', () => {
      const m = matchFaq('is there a demo trial');
      expect(m).not.toBeNull();
      expect(m!.q).toContain('free trial');
    });

    it('returns null for unrelated text', () => {
      expect(matchFaq('hello world xyz 12345')).toBeNull();
    });

    it('matches empty string to the market FAQ (empty word matches all keywords >= 4 chars)', () => {
      // "".split(/\s+/) = [""], and kw.startsWith("") is true for every kw.length >= 4
      const m = matchFaq('');
      expect(m).not.toBeNull();
      expect(m!.q).toContain('market');
    });

    it('matches best when multiple keywords overlap', () => {
      // "cancel refund" both appear in the cancel entry keywords
      const m = matchFaq('cancel and get refund');
      expect(m).not.toBeNull();
      expect(m!.q).toContain('cancel');
    });

    it('matches partial keyword prefix for words >= 4 chars', () => {
      // "secure" is a keyword; "security" starts with "secure"
      const m = matchFaq('my security concerns');
      expect(m).not.toBeNull();
      expect(m!.q).toContain('wallet');
    });

    it('matches when keyword is prefix of word >= 4 chars', () => {
      // keyword "paper" and word "paperwork" — "paperwork".startsWith("paper") && kw.length >= 4
      const m = matchFaq('paper trading test');
      expect(m).not.toBeNull();
      expect(m!.q).toContain('free trial');
    });
  });

  // ── handleUnknownMessage ─────────────────────────────────────────────────

  describe('handleUnknownMessage', () => {
    it('replies with FAQ match when message matches', async () => {
      const ctx = makeCtx('is my wallet safe');
      replySpy = ctx.reply as ReturnType<typeof vi.fn>;
      await handleUnknownMessage(ctx);
      expect(replySpy).toHaveBeenCalledOnce();
      const msg = replySpy.mock.calls[0][0];
      expect(msg).toContain('I think you');
      expect(msg).toContain('Q: Is my wallet safe');
      expect(msg).toContain('/faq');
      expect(msg).toContain('/support');
    });

    it('replies with fallback when no FAQ match', async () => {
      const ctx = makeCtx('xyzzy foobar');
      replySpy = ctx.reply as ReturnType<typeof vi.fn>;
      await handleUnknownMessage(ctx);
      const msg = replySpy.mock.calls[0][0];
      expect(msg).toContain("couldn't match");
      expect(msg).toContain('/faq');
      expect(msg).toContain('/support');
      expect(msg).toContain('/pricing');
    });

    it('skips messages starting with /', async () => {
      const ctx = makeCtx('/faq 1');
      replySpy = ctx.reply as ReturnType<typeof vi.fn>;
      await handleUnknownMessage(ctx);
      expect(replySpy).not.toHaveBeenCalled();
    });

    it('skips empty messages', async () => {
      const ctx = makeCtx('');
      replySpy = ctx.reply as ReturnType<typeof vi.fn>;
      await handleUnknownMessage(ctx);
      expect(replySpy).not.toHaveBeenCalled();
    });

    it('skips messages with undefined text', async () => {
      const ctx = makeCtx(undefined);
      replySpy = ctx.reply as ReturnType<typeof vi.fn>;
      await handleUnknownMessage(ctx);
      expect(replySpy).not.toHaveBeenCalled();
    });

    it('uses Markdown parse mode for matched replies', async () => {
      const ctx = makeCtx('cancel my subscription');
      replySpy = ctx.reply as ReturnType<typeof vi.fn>;
      await handleUnknownMessage(ctx);
      expect(replySpy.mock.calls[0][1]).toEqual({ parse_mode: 'Markdown' });
    });

    it('does not use parse_mode for no-match fallback', async () => {
      const ctx = makeCtx('xyzzy foobar');
      replySpy = ctx.reply as ReturnType<typeof vi.fn>;
      await handleUnknownMessage(ctx);
      expect(replySpy.mock.calls[0][1]).toBeUndefined();
    });
  });
});
