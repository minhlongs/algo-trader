/**
 * Tests for vibe-controller CAS (Check-And-Set) multi-instance conflict prevention.
 *
 * Strategy: mock getRedisClient() to return a controlled fake Redis that simulates
 * WATCH/MULTI/EXEC behavior, then verify retry logic and final state correctness.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Logger mock (suppress output) ───────────────────────────────────────────

vi.mock('../../src/shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ─── Message bus mock ─────────────────────────────────────────────────────────

const { mockPublish, mockSubscribe } = vi.hoisted(() => ({
  mockPublish: vi.fn().mockResolvedValue(undefined),
  mockSubscribe: vi.fn(),
}));

vi.mock('../../src/shared/messaging/create-message-bus.js', () => ({
  createMessageBus: vi.fn().mockResolvedValue({
    publish: mockPublish,
    subscribe: mockSubscribe,
  }),
}));

// ─── Redis mock factory ───────────────────────────────────────────────────────

/**
 * Creates a minimal Redis mock that tracks state in a Map and simulates
 * WATCH/MULTI/EXEC optimistic locking.
 *
 * `injectConflictOnAttempt`: if set, EXEC returns null on that attempt number
 * to simulate a concurrent write, after which the stored version is bumped.
 */
function makeRedisMock(options: {
  initialRaw?: string | null;
  injectConflictOnAttempt?: number;
} = {}) {
  const store = new Map<string, string>();
  if (options.initialRaw != null) store.set('vibe:state', options.initialRaw);

  let execAttempt = 0;
  let watchActive = false;

  const mock = {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => { store.set(key, value); return 'OK'; }),
    watch: vi.fn(async (_key: string) => { watchActive = true; return 'OK'; }),
    unwatch: vi.fn(async () => { watchActive = false; return 'OK'; }),
    multi: vi.fn(() => {
      const ops: Array<[string, string, string]> = [];
      const pipeline = {
        set: vi.fn((key: string, value: string) => { ops.push(['set', key, value]); return pipeline; }),
        exec: vi.fn(async () => {
          execAttempt++;
          if (options.injectConflictOnAttempt === execAttempt) {
            // Simulate another instance writing between WATCH and EXEC:
            // bump the version in the store so the retry sees a conflict
            const existing = store.get('vibe:state');
            if (existing) {
              const parsed = JSON.parse(existing);
              store.set('vibe:state', JSON.stringify({ ...parsed, version: (parsed.version ?? 0) + 1 }));
            }
            watchActive = false;
            return null; // EXEC aborted
          }
          for (const [cmd, key, value] of ops) {
            if (cmd === 'set') store.set(key, value);
          }
          watchActive = false;
          return ops.map(() => [null, 'OK']);
        }),
      };
      return pipeline;
    }),
    _store: store, // expose for assertions
  };

  return mock;
}

vi.mock('../../src/redis/index.js', () => ({
  getRedisClient: vi.fn(),
}));

import { getRedisClient } from '../../src/redis/index.js';
import { getVibeState, initVibeController, type VibeState, type VibeCommand } from '../../src/desk/wiring/vibe-controller.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeState(overrides: Partial<VibeState> = {}): VibeState {
  return {
    mode: 'balanced',
    minEdge: 2.5,
    maxExposure: 15,
    liquidityFloor: 10_000,
    marketFilter: null,
    pausedMarkets: [],
    updatedAt: Date.now(),
    updatedBy: 'system:init',
    version: 0,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('VibeController CAS', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubscribe.mockImplementation(() => Promise.resolve());
  });

  it('persists state with version=1 on first write (no conflict)', async () => {
    const redis = makeRedisMock();
    vi.mocked(getRedisClient).mockReturnValue(redis as ReturnType<typeof getRedisClient>);

    // Capture the subscribe handler
    let handler!: (env: { data: VibeCommand }) => Promise<void>;
    mockSubscribe.mockImplementation((_topic: string, h: typeof handler) => {
      handler = h;
      return Promise.resolve();
    });

    await initVibeController();

    await handler({ data: { action: 'set-mode', payload: { mode: 'aggressive' }, source: 'test' } });

    const stored = JSON.parse(redis._store.get('vibe:state')!) as VibeState;
    expect(stored.mode).toBe('aggressive');
    expect(stored.version).toBe(1);
    expect(getVibeState().mode).toBe('aggressive');
    expect(getVibeState().version).toBe(1);
  });

  it('retries once on EXEC conflict and commits the re-applied command', async () => {
    const initial = makeState({ mode: 'balanced', version: 0 });
    const redis = makeRedisMock({
      initialRaw: JSON.stringify(initial),
      injectConflictOnAttempt: 1, // first EXEC fails
    });
    vi.mocked(getRedisClient).mockReturnValue(redis as ReturnType<typeof getRedisClient>);

    let handler!: (env: { data: VibeCommand }) => Promise<void>;
    mockSubscribe.mockImplementation((_topic: string, h: typeof handler) => {
      handler = h;
      return Promise.resolve();
    });

    await initVibeController();

    await handler({ data: { action: 'set-mode', payload: { mode: 'defensive' }, source: 'test' } });

    // After conflict, stored version was bumped to 1 by the mock.
    // Retry re-applies 'defensive' on top of version 1 → commits version 2.
    const stored = JSON.parse(redis._store.get('vibe:state')!) as VibeState;
    expect(stored.mode).toBe('defensive');
    expect(stored.version).toBe(2);
    expect(getVibeState().mode).toBe('defensive');
  });

  it('loads existing version from Redis on init', async () => {
    const saved = makeState({ mode: 'conservative', version: 5 });
    const redis = makeRedisMock({ initialRaw: JSON.stringify(saved) });
    vi.mocked(getRedisClient).mockReturnValue(redis as ReturnType<typeof getRedisClient>);

    await initVibeController();

    expect(getVibeState().mode).toBe('conservative');
    expect(getVibeState().version).toBe(5);
  });

  it('defaults version to 0 for legacy states missing version field', async () => {
    // Simulate old persisted state without version
    const legacyState = {
      mode: 'aggressive',
      minEdge: 1.5,
      maxExposure: 25,
      liquidityFloor: 5000,
      marketFilter: null,
      pausedMarkets: [],
      updatedAt: Date.now(),
      updatedBy: 'legacy',
      // no version field
    };
    const redis = makeRedisMock({ initialRaw: JSON.stringify(legacyState) });
    vi.mocked(getRedisClient).mockReturnValue(redis as ReturnType<typeof getRedisClient>);

    await initVibeController();

    expect(getVibeState().version).toBe(0);
    expect(getVibeState().mode).toBe('aggressive');
  });

  it('does not persist on invalid/no-op commands', async () => {
    const redis = makeRedisMock();
    vi.mocked(getRedisClient).mockReturnValue(redis as ReturnType<typeof getRedisClient>);

    let handler!: (env: { data: VibeCommand }) => Promise<void>;
    mockSubscribe.mockImplementation((_topic: string, h: typeof handler) => {
      handler = h;
      return Promise.resolve();
    });

    await initVibeController();

    await handler({ data: { action: 'set-mode', payload: { mode: 'unknown-mode' as 'aggressive' }, source: 'test' } });

    // No WATCH should have been called since applyCommand returns currentState
    expect(redis.watch).not.toHaveBeenCalled();
    expect(redis._store.has('vibe:state')).toBe(false);
  });
});
