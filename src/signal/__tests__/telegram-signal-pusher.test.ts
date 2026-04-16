/**
 * Telegram Signal Pusher — unit tests
 * Mocks fetch to avoid real HTTP calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TelegramSignalPusher } from '../telegram-signal-pusher';
import type { Signal, SignalSubscription } from '../signal-types';

const BOT_TOKEN = 'test-token-123';

function makeSignal(overrides: Partial<Signal> = {}): Signal {
  const now = Date.now();
  return {
    id: 'sig001',
    ts: now,
    market: 'BTC-USD',
    side: 'BUY',
    size: 0.5,
    confidence: 0.8,
    strategy: 'momentum',
    ttl: 300,
    expiresAt: now + 300_000,
    ...overrides,
  };
}

function makeSub(overrides: Partial<SignalSubscription> = {}): SignalSubscription {
  return {
    id: 'sub001',
    subscriberId: 'user-1',
    chatId: 12345,
    tier: 'ENTERPRISE',
    active: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('TelegramSignalPusher', () => {
  let pusher: TelegramSignalPusher;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '{"ok":true}',
    });
    vi.stubGlobal('fetch', fetchMock);
    pusher = new TelegramSignalPusher(BOT_TOKEN);
  });

  it('sendMessage returns true on success', async () => {
    const result = await pusher.sendMessage(12345, 'hello');
    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(BOT_TOKEN);
    expect(url).toContain('sendMessage');
    expect(JSON.parse(opts.body as string).chat_id).toBe(12345);
  });

  it('sendMessage returns false when fetch fails', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, text: async () => 'Bad Request' });
    const result = await pusher.sendMessage(12345, 'hello');
    expect(result).toBe(false);
  });

  it('sendMessage returns false with no bot token', async () => {
    const noTokenPusher = new TelegramSignalPusher('');
    const result = await noTokenPusher.sendMessage(12345, 'hello');
    expect(result).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('enqueue skips inactive subscription', () => {
    const sig = makeSignal();
    const sub = makeSub({ active: false });
    pusher.enqueue(sig, sub);
    expect(pusher.queueLength).toBe(0);
  });

  it('enqueue skips subscription without chatId', () => {
    const sig = makeSignal();
    const sub = makeSub({ chatId: undefined });
    pusher.enqueue(sig, sub);
    expect(pusher.queueLength).toBe(0);
  });

  it('enqueue skips signal below tier confidence threshold', () => {
    const sig = makeSignal({ confidence: 0.3 }); // below FREE min 0.7
    const sub = makeSub({ tier: 'FREE' });
    pusher.enqueue(sig, sub);
    expect(pusher.queueLength).toBe(0);
  });

  it('enqueue adds to queue for ENTERPRISE active sub', async () => {
    const sig = makeSignal();
    const sub = makeSub({ tier: 'ENTERPRISE' });
    pusher.enqueue(sig, sub);
    // Queue may already be draining asynchronously; just confirm enqueue ran
    // without error and fetch was eventually called
    await new Promise((r) => setTimeout(r, 100));
    expect(fetchMock).toHaveBeenCalled();
  });
});
