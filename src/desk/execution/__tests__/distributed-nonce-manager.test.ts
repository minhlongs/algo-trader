/**
 * Distributed Nonce Manager Tests
 *
 * Covers the full nonce lifecycle: seed-from-chain, reserve, release (happy +
 * stale + race-skip), getCurrentNonce, and resync. The real Redis client is
 * replaced with a deterministic mock via vi.hoist so no network is touched.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Hoisted mock factory for the Redis client returned by getRedisClient.
const { redisMock } = vi.hoisted(() => {
  const get = vi.fn(async () => null);
  const set = vi.fn(async () => 'OK');
  const incr = vi.fn(async () => 1);
  const eval_ = vi.fn(async () => null);
  const redis = { get, set, incr, eval: eval_ };
  return { redisMock: redis };
});

vi.mock('../../../redis/index', () => ({
  getRedisClient: () => redisMock,
}));

import { DistributedNonceManager } from '../distributed-nonce-manager';

const WALLET = '0xAbC';

function makeNonceManager(getOnChainNonce = vi.fn(async () => 5)) {
  return new DistributedNonceManager(getOnChainNonce);
}

describe('DistributedNonceManager', () => {
  let mgr: DistributedNonceManager;
  let onChainNonce: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onChainNonce = vi.fn(async () => 5);
    mgr = makeNonceManager(onChainNonce);
    redisMock.get.mockReset();
    redisMock.set.mockReset();
    redisMock.incr.mockReset();
    redisMock.eval.mockReset();
    redisMock.get.mockResolvedValue(null);
    redisMock.set.mockResolvedValue('OK');
  });

  it('nonceKey lowercases the address', () => {
    // exercise the private key builder through getCurrentNonce (only call)
    mgr.getCurrentNonce(WALLET);
    expect(redisMock.get).toHaveBeenCalledWith('nonce:0xabc');
  });

  it('seeds the counter from chain on first use', async () => {
    redisMock.get.mockResolvedValueOnce(null); // not yet seeded
    redisMock.incr.mockResolvedValueOnce(6);

    await mgr.reserveNonce(WALLET);

    expect(onChainNonce).toHaveBeenCalledWith(WALLET);
    expect(redisMock.set).toHaveBeenCalledWith('nonce:0xabc', 5, 'NX' as never);
    expect(redisMock.incr).toHaveBeenCalledWith('nonce:0xabc');
  });

  it('skips seeding when the counter already exists', async () => {
    redisMock.get.mockResolvedValueOnce('3'); // already seeded
    redisMock.incr.mockResolvedValueOnce(4);

    await mgr.reserveNonce(WALLET);

    expect(onChainNonce).not.toHaveBeenCalled();
    expect(redisMock.set).not.toHaveBeenCalledWith('nonce:0xabc', expect.anything(), 'NX' as never);
    expect(redisMock.incr).toHaveBeenCalledWith('nonce:0xabc');
  });

  it('reserves nonce = INCR - 1', async () => {
    redisMock.get.mockResolvedValueOnce(null);
    redisMock.incr.mockResolvedValueOnce(9);

    const res = await mgr.reserveNonce(WALLET);

    expect(res.walletAddress).toBe(WALLET);
    expect(res.nonce).toBe(8);
    expect(res.reservedAt).toBeLessThanOrEqual(Date.now());
  });

  it('returns the same reservation for a wallet that was already initialised', async () => {
    redisMock.get.mockResolvedValueOnce(null);
    redisMock.incr.mockResolvedValueOnce(6);
    await mgr.reserveNonce(WALLET);

    redisMock.get.mockReset();
    redisMock.get.mockResolvedValueOnce('5');
    redisMock.incr.mockResolvedValueOnce(7);
    const res = await mgr.reserveNonce(WALLET);

    expect(onChainNonce).toHaveBeenCalledTimes(1);
    expect(res.nonce).toBe(6);
  });

  it('releases a nonce by decrementing the counter', async () => {
    redisMock.eval.mockResolvedValueOnce(5);

    await mgr.releaseNonce({ walletAddress: WALLET, nonce: 5, reservedAt: Date.now() });

    const script = redisMock.eval.mock.calls[0]![0] as string;
    expect(script).toContain("redis.call('get', KEYS[1])");
    expect(script).toContain("redis.call('decr', KEYS[1])");
    expect(redisMock.eval).toHaveBeenCalledWith(expect.stringContaining('decr'), 1, 'nonce:0xabc', '6');
  });

  it('skips release when the reservation is stale', async () => {
    const stale: NonceReservation = {
      walletAddress: WALLET,
      nonce: 0,
      reservedAt: Date.now() - 60_000, // older than NONCE_TTL_MS (30s)
    };

    await mgr.releaseNonce(stale);

    expect(redisMock.eval).not.toHaveBeenCalled();
  });

  it('skips release when a newer nonce has already been reserved', async () => {
    redisMock.eval.mockResolvedValueOnce(null); // Lua script returns nil when value != nonce+1

    await mgr.releaseNonce({ walletAddress: WALLET, nonce: 5, reservedAt: Date.now() });

    expect(redisMock.eval).toHaveBeenCalledTimes(1);
    // no-op log path
  });

  it('getCurrentNonce returns the parsed counter', async () => {
    redisMock.get.mockResolvedValueOnce('12');
    expect(await mgr.getCurrentNonce(WALLET)).toBe(12);
  });

  it('getCurrentNonce returns null when no counter exists', async () => {
    redisMock.get.mockResolvedValueOnce(null);
    expect(await mgr.getCurrentNonce(WALLET)).toBeNull();
  });

  it('resyncFromChain overwrites the counter and resets init state', async () => {
    redisMock.set.mockResolvedValueOnce('OK');
    const n = await mgr.resyncFromChain(WALLET);

    expect(onChainNonce).toHaveBeenCalledWith(WALLET);
    expect(redisMock.set).toHaveBeenCalledWith('nonce:0xabc', 5);
    expect(n).toBe(5);
  });

  it('ensureInitialised deduplicates concurrent in-flight init promises', async () => {
    // Two concurrent reserveNonce calls: only one should seed the counter.
    let releaseFirst: () => void = () => {};
    redisMock.get.mockReturnValueOnce(new Promise<string | null>((r) => { releaseFirst = () => r(null); }));
    redisMock.incr.mockResolvedValueOnce(6);

    const first = mgr.reserveNonce(WALLET);
    // Second call must wait on the first's init promise, not re-seed.
    const second = mgr.reserveNonce(WALLET);

    releaseFirst();
    await Promise.all([first, second]);

    expect(onChainNonce).toHaveBeenCalledTimes(1);
    expect(redisMock.set).toHaveBeenCalledTimes(1);
  });

  it('clears the init promise on failure so a retry can re-seed', async () => {
    onChainNonce.mockRejectedValueOnce(new Error('rpc down'));
    redisMock.get.mockResolvedValueOnce(null);
    redisMock.get.mockResolvedValueOnce(null);
    redisMock.incr.mockResolvedValueOnce(7);

    await expect(mgr.reserveNonce(WALLET)).rejects.toThrow('rpc down');

    // The failed init must not be cached — a retry re-seeds and succeeds.
    const res = await mgr.reserveNonce(WALLET);
    expect(onChainNonce).toHaveBeenCalledTimes(2);
    expect(res.nonce).toBe(6);
  });
});