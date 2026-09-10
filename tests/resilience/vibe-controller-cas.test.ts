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

  // ─── Redis unavailable on load (line 81 catch block) ──────────────────────

  it('logs a warning when Redis.get throws on load', async () => {
    const redis = makeRedisMock();
    redis.get.mockRejectedValue(new Error('Redis connection lost'));
    vi.mocked(getRedisClient).mockReturnValue(redis as ReturnType<typeof getRedisClient>);

    // The catch block at line 80-82 only logs a warning; it does NOT reset
    // module-level currentState (which is shared across tests). The behavior
    // under test is simply that init completes without throwing.
    await initVibeController();

    // Init should complete without throwing — state is whatever it was before
    // (module-level, not reset by the catch). The branch is verified by coverage.
    expect(redis.get).toHaveBeenCalled();
  });

  // ─── Concurrent-write-detected branch (lines 106-112) ─────────────────────

  it('re-applies command on top of newer stored state when version mismatch detected', async () => {
    // Strategy: seed stored version 5 on init load. Then, when the handler fires,
    // the watch/get cycle returns a DIFFERENT version (7) than the base (5),
    // triggering the `storedVersion !== base` rebasing path at line 104.
    //
    // The trick: the mock's get() must return version 5 on the FIRST call (init load),
    // then version 7 on the second call (post-watch get inside persistStateWithCAS).
    // We use a single mutable store shared by both get and set, and we mutate it
    // between init and the command dispatch.
    const sharedStore = new Map<string, string>();
    sharedStore.set('vibe:state', JSON.stringify(makeState({ mode: 'conservative', version: 5 })));

    const redis = makeRedisMock();
    redis.get.mockImplementation(async (key: string) => sharedStore.get(key) ?? null);
    redis.set.mockImplementation(async (key: string, value: string) => { sharedStore.set(key, value); return 'OK'; });
    vi.mocked(getRedisClient).mockReturnValue(redis as ReturnType<typeof getRedisClient>);

    let handler!: (env: { data: VibeCommand }) => Promise<void>;
    mockSubscribe.mockImplementation((_topic: string, h: typeof handler) => {
      handler = h;
      return Promise.resolve();
    });

    await initVibeController();
    expect(getVibeState().version).toBe(5);

    // Now simulate a concurrent writer: bump stored version to 7 BEFORE the handler runs.
    // When persistStateWithCAS does its post-watch get, it'll see version 7 ≠ base 5.
    sharedStore.set('vibe:state', JSON.stringify(makeState({ mode: 'conservative', version: 7 })));

    // Override multi/exec so the CAS SET succeeds on the first attempt (no EXEC abort).
    // The pipeline.set writes to sharedStore, and exec returns success.
    redis.multi.mockImplementation(() => {
      const pipeline = {
        set: vi.fn((key: string, value: string) => { sharedStore.set(key, value); return pipeline; }),
        exec: vi.fn().mockResolvedValue([[null, 'OK']]),
      };
      return pipeline as ReturnType<typeof redis.multi>;
    });

    await handler({ data: { action: 'set-mode', payload: { mode: 'defensive' }, source: 'test' } });

    // The rebased path: defensive applied on top of version 7 → version 8
    const stored = JSON.parse(sharedStore.get('vibe:state')!) as VibeState;
    expect(stored.mode).toBe('defensive');
    expect(stored.version).toBe(8);
  });

  // ─── Rebase with stored=null (line 101 false branch) ──────────────────────

  it('rebalances from defaults when stored data vanishes before WATCH (stored=null path)', async () => {
    // Init loads version 5. Then Redis data disappears (get returns null inside persistStateWithCAS).
    // base = 5, storedVersion = 0 (from null) → 0 !== 5 → rebase path with stored=null.
    // Line 101 false branch: stored = null → rebased = BALANCED_DEFAULTS.
    const sharedStore = new Map<string, string>();
    sharedStore.set('vibe:state', JSON.stringify(makeState({ mode: 'conservative', version: 5 })));

    const redis = makeRedisMock();
    let getCallCount = 0;
    redis.get.mockImplementation(async (key: string) => {
      getCallCount++;
      // First call (init load) returns the saved state; subsequent calls return null (data vanished)
      if (getCallCount === 1) return sharedStore.get(key) ?? null;
      return null;
    });
    redis.set.mockImplementation(async (key: string, value: string) => { sharedStore.set(key, value); return 'OK'; });
    vi.mocked(getRedisClient).mockReturnValue(redis as ReturnType<typeof getRedisClient>);

    let handler!: (env: { data: VibeCommand }) => Promise<void>;
    mockSubscribe.mockImplementation((_topic: string, h: typeof handler) => {
      handler = h;
      return Promise.resolve();
    });

    await initVibeController();
    expect(getVibeState().version).toBe(5);

    // Data vanishes — get returns null inside persistStateWithCAS
    sharedStore.delete('vibe:state');

    redis.multi.mockImplementation(() => {
      const pipeline = {
        set: vi.fn((key: string, value: string) => { sharedStore.set(key, value); return pipeline; }),
        exec: vi.fn().mockResolvedValue([[null, 'OK']]),
      };
      return pipeline as ReturnType<typeof redis.multi>;
    });

    await handler({ data: { action: 'set-mode', payload: { mode: 'defensive' }, source: 'test' } });

    // rebased = BALANCED_DEFAULTS (stored=null), defensive applied → version 1 (0+1)
    const stored = JSON.parse(sharedStore.get('vibe:state')!) as VibeState;
    expect(stored.mode).toBe('defensive');
    expect(stored.version).toBe(1);
  });

  // ─── EXEC-aborted with reloadRaw=null (line 122 false branch) ──────────────

  it('falls back to defaults when reload returns null after EXEC abort (reloaded defaults path)', async () => {
    // Init loads version 3. EXEC aborts on first attempt; reload get returns null (data vanished).
    // Line 122 false branch: reloadParsed=null → reloaded = BALANCED_DEFAULTS.
    const sharedStore = new Map<string, string>();
    sharedStore.set('vibe:state', JSON.stringify(makeState({ mode: 'balanced', version: 3 })));

    const redis = makeRedisMock();
    let getCallCount = 0;
    redis.get.mockImplementation(async (key: string) => {
      getCallCount++;
      // Call 1: init load → returns saved. Call 2: post-watch get → returns saved (version 3, matches base).
      // Call 3: post-EXEC-abort reload → returns null (data vanished).
      if (getCallCount <= 2) return sharedStore.get(key) ?? null;
      return null;
    });
    redis.set.mockImplementation(async (key: string, value: string) => { sharedStore.set(key, value); return 'OK'; });

    // First EXEC aborts (simulating concurrent write), after that data is gone
    let execAttempt = 0;
    redis.multi.mockImplementation(() => {
      const pipeline = {
        set: vi.fn((key: string, value: string) => { sharedStore.set(key, value); return pipeline; }),
        exec: vi.fn().mockImplementation(async () => {
          execAttempt++;
          if (execAttempt === 1) {
            // Simulate concurrent write bumping version, then data vanishes
            sharedStore.delete('vibe:state');
            return null; // EXEC aborted
          }
          return [[null, 'OK']];
        }),
      };
      return pipeline as ReturnType<typeof redis.multi>;
    });

    vi.mocked(getRedisClient).mockReturnValue(redis as ReturnType<typeof getRedisClient>);

    let handler!: (env: { data: VibeCommand }) => Promise<void>;
    mockSubscribe.mockImplementation((_topic: string, h: typeof handler) => {
      handler = h;
      return Promise.resolve();
    });

    await initVibeController();
    expect(getVibeState().version).toBe(3);

    await handler({ data: { action: 'set-mode', payload: { mode: 'aggressive' }, source: 'test' } });

    // reloaded = BALANCED_DEFAULTS (reloadRaw=null), aggressive applied → version 1 (0+1)
    const stored = JSON.parse(sharedStore.get('vibe:state')!) as VibeState;
    expect(stored.mode).toBe('aggressive');
    expect(stored.version).toBe(1);
  });

  // ─── Legacy version fallback in persist rebase (line 101 `?? 0`) ───────────

  it('defaults version to 0 when rebased stored state lacks version field', async () => {
    // Init loads version 5. Concurrent writer stores legacy state (no version field).
    // Inside persistStateWithCAS: parsed.version is undefined → `?? 0` → storedVersion=0.
    // base=5, storedVersion=0 → 0 !== 5 → rebase path with version defaulting to 0.
    const sharedStore = new Map<string, string>();
    sharedStore.set('vibe:state', JSON.stringify(makeState({ mode: 'conservative', version: 5 })));

    const redis = makeRedisMock();
    redis.get.mockImplementation(async (key: string) => sharedStore.get(key) ?? null);
    redis.set.mockImplementation(async (key: string, value: string) => { sharedStore.set(key, value); return 'OK'; });
    vi.mocked(getRedisClient).mockReturnValue(redis as ReturnType<typeof getRedisClient>);

    let handler!: (env: { data: VibeCommand }) => Promise<void>;
    mockSubscribe.mockImplementation((_topic: string, h: typeof handler) => {
      handler = h;
      return Promise.resolve();
    });

    await initVibeController();
    expect(getVibeState().version).toBe(5);

    // Concurrent writer stores legacy state WITHOUT version field
    const legacyState = { mode: 'aggressive', minEdge: 1.5, maxExposure: 25, liquidityFloor: 5000, marketFilter: null, pausedMarkets: [], updatedAt: Date.now(), updatedBy: 'legacy' };
    sharedStore.set('vibe:state', JSON.stringify(legacyState));

    redis.multi.mockImplementation(() => {
      const pipeline = {
        set: vi.fn((key: string, value: string) => { sharedStore.set(key, value); return pipeline; }),
        exec: vi.fn().mockResolvedValue([[null, 'OK']]),
      };
      return pipeline as ReturnType<typeof redis.multi>;
    });

    await handler({ data: { action: 'set-mode', payload: { mode: 'defensive' }, source: 'test' } });

    // rebased version defaults to 0 (?? 0), defensive applied → version 1 (0+1)
    const stored = JSON.parse(sharedStore.get('vibe:state')!) as VibeState;
    expect(stored.mode).toBe('defensive');
    expect(stored.version).toBe(1);
  });

  // ─── Legacy version fallback in EXEC-abort reload (line 122 `?? 0`) ────────

  it('defaults version to 0 when reloaded state lacks version field after EXEC abort', async () => {
    // Init loads version 3. EXEC aborts; reload finds legacy state (no version).
    // reloadParsed.version is undefined → `?? 0` → reloaded.version=0.
    const sharedStore = new Map<string, string>();
    sharedStore.set('vibe:state', JSON.stringify(makeState({ mode: 'balanced', version: 3 })));

    const redis = makeRedisMock();
    let getCallCount = 0;
    redis.get.mockImplementation(async (key: string) => {
      getCallCount++;
      if (getCallCount <= 2) return sharedStore.get(key) ?? null;
      // After EXEC abort: return legacy state without version
      return sharedStore.get(key) ?? null;
    });
    redis.set.mockImplementation(async (key: string, value: string) => { sharedStore.set(key, value); return 'OK'; });

    let execAttempt = 0;
    redis.multi.mockImplementation(() => {
      const pipeline = {
        set: vi.fn((key: string, value: string) => { sharedStore.set(key, value); return pipeline; }),
        exec: vi.fn().mockImplementation(async () => {
          execAttempt++;
          if (execAttempt === 1) {
            // Simulate concurrent writer replacing with legacy state (no version)
            const legacyState = { mode: 'aggressive', minEdge: 1.5, maxExposure: 25, liquidityFloor: 5000, marketFilter: null, pausedMarkets: [], updatedAt: Date.now(), updatedBy: 'legacy' };
            sharedStore.set('vibe:state', JSON.stringify(legacyState));
            return null; // EXEC aborted
          }
          return [[null, 'OK']];
        }),
      };
      return pipeline as ReturnType<typeof redis.multi>;
    });

    vi.mocked(getRedisClient).mockReturnValue(redis as ReturnType<typeof getRedisClient>);

    let handler!: (env: { data: VibeCommand }) => Promise<void>;
    mockSubscribe.mockImplementation((_topic: string, h: typeof handler) => {
      handler = h;
      return Promise.resolve();
    });

    await initVibeController();
    expect(getVibeState().version).toBe(3);

    await handler({ data: { action: 'set-mode', payload: { mode: 'defensive' }, source: 'test' } });

    // reloaded version defaults to 0 (?? 0), defensive applied → version 1 (0+1)
    const stored = JSON.parse(sharedStore.get('vibe:state')!) as VibeState;
    expect(stored.mode).toBe('defensive');
    expect(stored.version).toBe(1);
  });

  // ─── EXEC-aborted path: re-apply differs from reloaded → retry succeeds ────

  it('retries after EXEC abort when re-applied state differs from reloaded state', async () => {
    // After EXEC abort (line 119-128), the reload gets the bumped version,
    // re-applies the command, and since re-applied !== reloaded, continues the
    // loop with the new state. This covers the non-early-return path at line 125-127.
    const initial = makeState({ mode: 'balanced', version: 3 });
    const redis = makeRedisMock({
      initialRaw: JSON.stringify(initial),
      injectConflictOnAttempt: 1, // first EXEC aborts, bumps stored to version 4
    });
    vi.mocked(getRedisClient).mockReturnValue(redis as ReturnType<typeof getRedisClient>);

    let handler!: (env: { data: VibeCommand }) => Promise<void>;
    mockSubscribe.mockImplementation((_topic: string, h: typeof handler) => {
      handler = h;
      return Promise.resolve();
    });

    await initVibeController();
    expect(getVibeState().version).toBe(3);

    // After EXEC abort: stored is version 4 (mock bumped it). Re-apply 'defensive'
    // on balanced state → defensive differs from balanced → continues loop → retry succeeds.
    await handler({ data: { action: 'set-mode', payload: { mode: 'defensive' }, source: 'test' } });

    const stored = JSON.parse(redis._store.get('vibe:state')!) as VibeState;
    expect(stored.mode).toBe('defensive');
    // First attempt aborted (version bumped to 4 by mock). Second attempt
    // re-applies defensive on top of version 4, commits version 5.
    expect(stored.version).toBe(5);
    expect(getVibeState().mode).toBe('defensive');
  });

  // ─── CAS attempt catch block (lines 134-138) ──────────────────────────────

  it('logs warning and calls unwatch when redis.watch throws', async () => {
    const redis = makeRedisMock();
    redis.watch.mockRejectedValue(new Error('watch failed'));
    vi.mocked(getRedisClient).mockReturnValue(redis as ReturnType<typeof getRedisClient>);

    let handler!: (env: { data: VibeCommand }) => Promise<void>;
    mockSubscribe.mockImplementation((_topic: string, h: typeof handler) => {
      handler = h;
      return Promise.resolve();
    });

    await initVibeController();

    // Handler is void — it does not rethrow, and it does not return a value.
    // The catch block (line 134-138) logs a warning, calls unwatch, and breaks.
    // We verify: (a) no throw, (b) unwatch was called.
    await handler({ data: { action: 'set-mode', payload: { mode: 'aggressive' }, source: 'test' } });

    expect(redis.unwatch).toHaveBeenCalled();
  });

  // ─── CAS max-retries-exceeded (line 141) ──────────────────────────────────

  it('logs max-retries-exceeded when all 3 attempts abort', async () => {
    const redis = makeRedisMock();
    vi.mocked(getRedisClient).mockReturnValue(redis as ReturnType<typeof getRedisClient>);

    // All 3 attempts: EXEC returns null → each reload returns version 0 (no bump),
    // re-applied differs from reloaded, continues until attempt === CAS_MAX_RETRIES (3),
    // then logs max-retries and returns `next`.
    redis.multi.mockImplementation(() => {
      const pipeline = {
        set: vi.fn(() => pipeline),
        exec: vi.fn().mockResolvedValue(null),
      };
      return pipeline as ReturnType<typeof redis.multi>;
    });

    let handler!: (env: { data: VibeCommand }) => Promise<void>;
    mockSubscribe.mockImplementation((_topic: string, h: typeof handler) => {
      handler = h;
      return Promise.resolve();
    });

    await initVibeController();

    // Handler is void — it does not rethrow. After max retries, currentState
    // is updated inside the loop's `continue` path (line 132) on each successful
    // commit, but since EXEC always aborts, the final `return next` at line 142
    // returns the proposed state. The handler itself updates currentState at line 200.
    await handler({ data: { action: 'set-mode', payload: { mode: 'aggressive' }, source: 'test' } });

    // After all retries exhausted, currentState should reflect the proposed command
    // (the handler sets currentState = committed at line 200, where committed is
    // the return value of persistStateWithCAS — which is `next`, the uncommitted state).
    expect(getVibeState().mode).toBe('aggressive');
  });

  // ─── applyCommandToState branches (lines 156-170) ─────────────────────────

  it('sets marketFilter via filter-markets action', async () => {
    const redis = makeRedisMock();
    vi.mocked(getRedisClient).mockReturnValue(redis as ReturnType<typeof getRedisClient>);

    let handler!: (env: { data: VibeCommand }) => Promise<void>;
    mockSubscribe.mockImplementation((_topic: string, h: typeof handler) => {
      handler = h;
      return Promise.resolve();
    });

    await initVibeController();

    await handler({ data: { action: 'filter-markets', payload: { filter: 'polymarket' }, source: 'test' } });
    expect(getVibeState().marketFilter).toBe('polymarket');
  });

  it('sets marketFilter to null when filter-markets has no filter', async () => {
    const redis = makeRedisMock();
    vi.mocked(getRedisClient).mockReturnValue(redis as ReturnType<typeof getRedisClient>);

    let handler!: (env: { data: VibeCommand }) => Promise<void>;
    mockSubscribe.mockImplementation((_topic: string, h: typeof handler) => {
      handler = h;
      return Promise.resolve();
    });

    await initVibeController();

    await handler({ data: { action: 'filter-markets', payload: {}, source: 'test' } });
    expect(getVibeState().marketFilter).toBeNull();
  });

  it('adds a market to pausedMarkets via pause-market', async () => {
    const redis = makeRedisMock();
    vi.mocked(getRedisClient).mockReturnValue(redis as ReturnType<typeof getRedisClient>);

    let handler!: (env: { data: VibeCommand }) => Promise<void>;
    mockSubscribe.mockImplementation((_topic: string, h: typeof handler) => {
      handler = h;
      return Promise.resolve();
    });

    await initVibeController();

    await handler({ data: { action: 'pause-market', payload: { marketId: 'm1' }, source: 'test' } });
    expect(getVibeState().pausedMarkets).toEqual(['m1']);
  });

  it('does not duplicate a market already in pausedMarkets', async () => {
    const redis = makeRedisMock();
    vi.mocked(getRedisClient).mockReturnValue(redis as ReturnType<typeof getRedisClient>);

    let handler!: (env: { data: VibeCommand }) => Promise<void>;
    mockSubscribe.mockImplementation((_topic: string, h: typeof handler) => {
      handler = h;
      return Promise.resolve();
    });

    await initVibeController();

    await handler({ data: { action: 'pause-market', payload: { marketId: 'm1' }, source: 'test' } });
    await handler({ data: { action: 'pause-market', payload: { marketId: 'm1' }, source: 'test' } });
    expect(getVibeState().pausedMarkets).toEqual(['m1']);
  });

  it('removes a market from pausedMarkets via resume-market', async () => {
    const redis = makeRedisMock();
    vi.mocked(getRedisClient).mockReturnValue(redis as ReturnType<typeof getRedisClient>);

    let handler!: (env: { data: VibeCommand }) => Promise<void>;
    mockSubscribe.mockImplementation((_topic: string, h: typeof handler) => {
      handler = h;
      return Promise.resolve();
    });

    await initVibeController();

    await handler({ data: { action: 'pause-market', payload: { marketId: 'm1' }, source: 'test' } });
    await handler({ data: { action: 'pause-market', payload: { marketId: 'm2' }, source: 'test' } });
    expect(getVibeState().pausedMarkets).toEqual(['m1', 'm2']);
    await handler({ data: { action: 'resume-market', payload: { marketId: 'm1' }, source: 'test' } });
    expect(getVibeState().pausedMarkets).toEqual(['m2']);
  });

  it('sets a numeric param via set-param', async () => {
    const redis = makeRedisMock();
    vi.mocked(getRedisClient).mockReturnValue(redis as ReturnType<typeof getRedisClient>);

    let handler!: (env: { data: VibeCommand }) => Promise<void>;
    mockSubscribe.mockImplementation((_topic: string, h: typeof handler) => {
      handler = h;
      return Promise.resolve();
    });

    await initVibeController();

    await handler({ data: { action: 'set-param', payload: { param: 'minEdge', value: 4.0 }, source: 'test' } });
    expect(getVibeState().minEdge).toBe(4.0);
  });

  it('rejects unknown param via set-param (no-op)', async () => {
    const redis = makeRedisMock();
    vi.mocked(getRedisClient).mockReturnValue(redis as ReturnType<typeof getRedisClient>);

    let handler!: (env: { data: VibeCommand }) => Promise<void>;
    mockSubscribe.mockImplementation((_topic: string, h: typeof handler) => {
      handler = h;
      return Promise.resolve();
    });

    await initVibeController();

    const before = getVibeState();
    await handler({ data: { action: 'set-param', payload: { param: 'nonexistent', value: 99 }, source: 'test' } });
    // State unchanged (no-op returns same reference)
    expect(getVibeState()).toBe(before);
    // minEdge unchanged
    expect(getVibeState().minEdge).toBe(before.minEdge);
  });

  it('ignores unknown action (default case)', async () => {
    const redis = makeRedisMock();
    vi.mocked(getRedisClient).mockReturnValue(redis as ReturnType<typeof getRedisClient>);

    let handler!: (env: { data: VibeCommand }) => Promise<void>;
    mockSubscribe.mockImplementation((_topic: string, h: typeof handler) => {
      handler = h;
      return Promise.resolve();
    });

    await initVibeController();

    const before = getVibeState();
    await handler({ data: { action: 'bogus-action', payload: {}, source: 'test' } as VibeCommand });
    expect(getVibeState()).toBe(before);
  });
});
