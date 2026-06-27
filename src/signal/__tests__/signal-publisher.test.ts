/**
 * Signal Publisher — unit tests
 * Mocks: SignalStore, sseBroadcaster, telegramSignalPusher, redis cache
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SignalPublisher } from '../signal-publisher';
import { signalDedupGuard } from '../signal-dedup-guard';
import { signalTtlEnforcer } from '../signal-ttl-enforcer';
import type { SignalStore } from '../signal-publisher';
import type { Signal, SignalSubscription } from '../signal-types';

// Mock SSE broadcaster and Telegram pusher to avoid side effects
vi.mock('../sse-signal-broadcaster', () => ({
  sseBroadcaster: { broadcast: vi.fn() },
}));
vi.mock('../telegram-signal-pusher', () => ({
  telegramSignalPusher: { enqueue: vi.fn() },
}));
vi.mock('../signal-rest-cache', () => ({
  invalidateSignalCache: vi.fn().mockResolvedValue(undefined),
}));

function makeStore(subs: SignalSubscription[] = []): SignalStore {
  return {
    saveSignal: vi.fn().mockResolvedValue(undefined),
    getSubscriptions: vi.fn().mockResolvedValue(subs),
  };
}

<<<<<<< HEAD
=======
// Use future-safe timestamps so expiresAt is always in the future
const BASE_TS = Date.now() - 1000; // 1s ago (still within TTL bucket)
>>>>>>> origin/feat/qwen-signal-daemon-phase03
const BASE_INPUT = {
  market: 'BTC-USD',
  side: 'BUY' as const,
  size: 0.5,
  confidence: 0.8,
  strategy: 'momentum',
<<<<<<< HEAD
  ttlSec: 300,
  ts: 1_700_000_000_000,
=======
  ttlSec: 3600, // 1h TTL so expiresAt is always in the future
  ts: BASE_TS,
>>>>>>> origin/feat/qwen-signal-daemon-phase03
};

describe('SignalPublisher.publish', () => {
  beforeEach(() => {
    signalDedupGuard['seen'].clear();
    signalTtlEnforcer.clear();
  });

  it('returns a Signal on first publish', async () => {
    const store = makeStore();
    const publisher = new SignalPublisher(store);

    const result = await publisher.publish(BASE_INPUT);

    expect(result).not.toBeNull();
    expect(result?.market).toBe('BTC-USD');
    expect(result?.side).toBe('BUY');
    expect(result?.confidence).toBe(0.8);
    expect(store.saveSignal).toHaveBeenCalledOnce();
  });

  it('returns null for duplicate signal in same TTL bucket', async () => {
    const store = makeStore();
    const publisher = new SignalPublisher(store);

    await publisher.publish(BASE_INPUT);
<<<<<<< HEAD
    const dup = await publisher.publish({ ...BASE_INPUT, ts: BASE_INPUT.ts! + 1000 });
=======
    const dup = await publisher.publish({ ...BASE_INPUT, ts: BASE_TS + 1000 });
>>>>>>> origin/feat/qwen-signal-daemon-phase03

    expect(dup).toBeNull();
    expect(store.saveSignal).toHaveBeenCalledOnce(); // only first persisted
  });

  it('assigns correct expiresAt based on ttlSec', async () => {
    const store = makeStore();
    const publisher = new SignalPublisher(store);
<<<<<<< HEAD
    const ts = 1_700_000_000_000;

    const result = await publisher.publish({ ...BASE_INPUT, ts });
    expect(result?.expiresAt).toBe(ts + 300 * 1000);
=======
    const ts = Date.now();
    const ttlSec = 3600;

    const result = await publisher.publish({ ...BASE_INPUT, ts, ttlSec });
    expect(result?.expiresAt).toBe(ts + ttlSec * 1000);
>>>>>>> origin/feat/qwen-signal-daemon-phase03
  });

  it('returns null when DB save throws', async () => {
    const store: SignalStore = {
      saveSignal: vi.fn().mockRejectedValue(new Error('DB down')),
      getSubscriptions: vi.fn().mockResolvedValue([]),
    };
    const publisher = new SignalPublisher(store);
    const result = await publisher.publish(BASE_INPUT);
    expect(result).toBeNull();
  });

  it('registers signal with TTL enforcer after publish', async () => {
    const store = makeStore();
    const publisher = new SignalPublisher(store);

    const result = await publisher.publish(BASE_INPUT);
    expect(result).not.toBeNull();

    const live = signalTtlEnforcer.getLive();
    expect(live.some((s: Signal) => s.id === result!.id)).toBe(true);
  });
});
