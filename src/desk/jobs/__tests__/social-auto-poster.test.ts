/**
 * Tests for social-auto-poster — distributePost over Twitter + Telegram.
 *
 * fetch is mocked so no real API is touched. Env vars are set/unset per test
 * to exercise the graceful-degradation branches (credentials missing).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { distributePost } from '../social-auto-poster';
import type { BlogPost } from '../auto-marketing-daemon';

function makePost(overrides: Partial<BlogPost> = {}): BlogPost {
  return {
    id: 'p1',
    title: 'Weekly Digest',
    excerpt: 'Markets rallied on prediction-market volume.',
    content: 'Full content here',
    date: '2026-08-29',
    tags: ['signals'],
    type: 'signal-digest',
    url: 'https://cashclaw.cc/blog/weekly',
    generatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('distributePost', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.restoreAllMocks();
    delete process.env.TWITTER_API_KEY;
    delete process.env.TWITTER_API_SECRET;
    delete process.env.TWITTER_ACCESS_TOKEN;
    delete process.env.TWITTER_ACCESS_SECRET;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHANNEL_ID;
  });

  it('returns false/false when no credentials configured', async () => {
    const result = await distributePost(makePost());
    expect(result).toEqual({ twitter: false, telegram: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('posts to Twitter when full OAuth credentials set', async () => {
    process.env.TWITTER_API_KEY = 'k';
    process.env.TWITTER_API_SECRET = 'ks';
    process.env.TWITTER_ACCESS_TOKEN = 'at';
    process.env.TWITTER_ACCESS_SECRET = 'ats';

    const result = await distributePost(makePost());
    expect(result.twitter).toBe(true);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe('https://api.twitter.com/2/tweets');
    expect((init as RequestInit).method).toBe('POST');
    const auth = (init as RequestInit).headers as Record<string, string>;
    expect(auth.Authorization).toMatch(/^OAuth /);
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.text).toContain('Markets rallied');
    expect(body.text).toContain('#PredictionMarkets');
    expect(body.text.length).toBeLessThanOrEqual(280);
  });

  it('skips Twitter when partial credentials set', async () => {
    process.env.TWITTER_API_KEY = 'k';
    // others missing
    const result = await distributePost(makePost());
    expect(result.twitter).toBe(false);
  });

  it('returns false on Twitter API error response', async () => {
    process.env.TWITTER_API_KEY = 'k';
    process.env.TWITTER_API_SECRET = 'ks';
    process.env.TWITTER_ACCESS_TOKEN = 'at';
    process.env.TWITTER_ACCESS_SECRET = 'ats';
    fetchSpy.mockResolvedValueOnce(
      new Response('{"errors":[]}', { status: 403 }),
    );

    const result = await distributePost(makePost());
    expect(result.twitter).toBe(false);
  });

  it('returns false when Twitter fetch throws', async () => {
    process.env.TWITTER_API_KEY = 'k';
    process.env.TWITTER_API_SECRET = 'ks';
    process.env.TWITTER_ACCESS_TOKEN = 'at';
    process.env.TWITTER_ACCESS_SECRET = 'ats';
    fetchSpy.mockRejectedValueOnce(new Error('network down'));

    const result = await distributePost(makePost());
    expect(result.twitter).toBe(false);
  });

  it('posts to Telegram when bot token and channel set', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'tok';
    process.env.TELEGRAM_CHANNEL_ID = '@chan';

    const result = await distributePost(makePost());
    expect(result.telegram).toBe(true);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe('https://api.telegram.org/bottok/sendMessage');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.chat_id).toBe('@chan');
    expect(body.parse_mode).toBe('Markdown');
    expect(body.text).toContain('*Weekly Digest*');
  });

  it('returns false on Telegram API error response', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'tok';
    process.env.TELEGRAM_CHANNEL_ID = '@chan';
    fetchSpy.mockResolvedValueOnce(new Response('err', { status: 400 }));

    const result = await distributePost(makePost());
    expect(result.telegram).toBe(false);
  });

  it('returns false when Telegram fetch throws', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'tok';
    process.env.TELEGRAM_CHANNEL_ID = '@chan';
    fetchSpy.mockRejectedValueOnce(new Error('bot blocked'));

    const result = await distributePost(makePost());
    expect(result.telegram).toBe(false);
  });

  it('skips Telegram when only bot token set', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'tok';
    const result = await distributePost(makePost());
    expect(result.telegram).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});