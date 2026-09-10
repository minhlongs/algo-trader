/**
 * Tests for nats-connection-manager — mocks the `nats` module so every
 * lifecycle branch (cached connect, production-token warning, connect
 * failure, getNatsConnection throw, isNatsConnected, closeNats, monitorConnection
 * status events) is exercised without a live server.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface FakeStatus {
  type: 'reconnecting' | 'reconnect' | 'disconnect' | 'error';
  data?: unknown;
}

interface FakeNc {
  url: string;
  isClosed: ReturnType<typeof vi.fn>;
  drain: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
}

const { mockLogger, connectMock } = vi.hoisted(() => ({
  mockLogger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  connectMock: vi.fn(),
}));

vi.mock('../../../../src/shared/utils/logger', () => ({ logger: mockLogger }));

vi.mock('nats', () => ({
  connect: connectMock,
  NatsConnection: {} as never,
  StringCodec: () => ({ encode: (s: string) => new TextEncoder().encode(s), decode: (b: Uint8Array) => new TextDecoder().decode(b) }),
}));

type Mod = typeof import('../../../../src/shared/messaging/nats-connection-manager');
let mod: Mod;

function makeNc(url = 'nats://localhost:4222'): FakeNc {
  let statuses: FakeStatus[] = [];
  return {
    url,
    isClosed: vi.fn(() => false),
    drain: vi.fn(async () => {
      statuses = [];
    }),
    status: vi.fn(() => {
      const s = statuses;
      statuses = [];
      let i = 0;
      return (async function* () {
        while (i < s.length) yield s[i++];
      })();
    }),
    __pushStatus(this: FakeNc, ...ev: FakeStatus[]) {
      statuses.push(...ev);
    },
  } as FakeNc & { __pushStatus: (...ev: FakeStatus[]) => void };
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  mod = await import('../../../../src/shared/messaging/nats-connection-manager');
});

afterEach(() => {
  delete process.env.NATS_TOKEN;
  delete process.env.NATS_URL;
  delete process.env.NATS_CLIENT_NAME;
  const orig = process.env.NODE_ENV;
  if (orig !== 'test') process.env.NODE_ENV = orig ?? 'test';
});

describe('connectNats', () => {
  it('returns the cached connection on a second call without reconnecting', async () => {
    const nc = makeNc();
    connectMock.mockResolvedValue(nc as never);

    const first = await mod.connectNats();
    const second = await mod.connectNats();

    expect(first).toBe(nc);
    expect(second).toBe(nc);
    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(mockLogger.info).toHaveBeenCalledWith('[NATS] Connected to nats://localhost:4222');
  });

  it('applies config overrides (url, name, token)', async () => {
    const nc = makeNc('nats://prod:4222');
    connectMock.mockResolvedValue(nc as never);
    process.env.NODE_ENV = 'production';

    // No override token → production warning branch
    await mod.connectNats({ url: 'nats://prod:4222', token: undefined });
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('No NATS_TOKEN configured in production'),
    );
    expect(connectMock).toHaveBeenCalledWith(
      expect.objectContaining({ servers: 'nats://prod:4222', token: undefined }),
    );
  });

  it('skips the production-token warning when a token is present', async () => {
    const nc = makeNc();
    connectMock.mockResolvedValue(nc as never);
    process.env.NODE_ENV = 'production';

    await mod.connectNats({ token: 'secret' });
    expect(mockLogger.warn).not.toHaveBeenCalledWith(
      expect.stringContaining('No NATS_TOKEN configured in production'),
    );
    expect(connectMock).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'secret' }),
    );
  });

  it('logs and rethrows when connect fails', async () => {
    const boom = new Error('connection refused');
    connectMock.mockRejectedValue(boom);

    await expect(mod.connectNats()).rejects.toThrow('connection refused');
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Connection failed: connection refused'),
    );
  });

  it('uses default config when no config is passed', async () => {
    const nc = makeNc();
    connectMock.mockResolvedValue(nc as never);
    await mod.connectNats();
    expect(connectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        servers: 'nats://localhost:4222',
        name: 'algo-trader',
        maxReconnectAttempts: -1,
        reconnectTimeWait: 2000,
      }),
    );
  });
});

describe('getNatsConnection', () => {
  it('throws when not connected', () => {
    expect(() => mod.getNatsConnection()).toThrow(
      '[NATS] Not connected. Call connectNats() first.',
    );
  });

  it('returns the connection after connectNats', async () => {
    const nc = makeNc();
    connectMock.mockResolvedValue(nc as never);
    const connected = await mod.connectNats();
    expect(mod.getNatsConnection()).toBe(connected);
  });
});

describe('isNatsConnected', () => {
  it('returns false when not connected', () => {
    expect(mod.isNatsConnected()).toBe(false);
  });

  it('returns true when connected and not closed', async () => {
    const nc = makeNc();
    connectMock.mockResolvedValue(nc as never);
    await mod.connectNats();
    expect(mod.isNatsConnected()).toBe(true);
  });

  it('returns false when the underlying connection is closed', async () => {
    const nc = makeNc();
    (nc.isClosed as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);
    connectMock.mockResolvedValue(nc as never);
    await mod.connectNats();
    expect(mod.isNatsConnected()).toBe(false);
  });
});

describe('getCodec', () => {
  it('returns a StringCodec with encode/decode', () => {
    const codec = mod.getCodec();
    const bytes = codec.encode('hello');
    expect(Array.from(bytes)).toEqual([104, 101, 108, 108, 111]);
    expect(codec.decode(bytes)).toBe('hello');
  });
});

describe('closeNats', () => {
  it('drains and nulls the connection when connected', async () => {
    const nc = makeNc();
    connectMock.mockResolvedValue(nc as never);
    await mod.connectNats();
    await mod.closeNats();
    expect(nc.drain).toHaveBeenCalledTimes(1);
    expect(mockLogger.info).toHaveBeenCalledWith('[NATS] Connection closed');
    expect(mod.isNatsConnected()).toBe(false);
  });

  it('is a no-op when not connected', async () => {
    await expect(mod.closeNats()).resolves.toBeUndefined();
    expect(connectMock).not.toHaveBeenCalled();
  });
});

describe('monitorConnection (status events)', () => {
  it('logs reconnecting, reconnect, disconnect and error statuses', async () => {
    const nc = makeNc();
    (nc as unknown as { __pushStatus: (...ev: FakeStatus[]) => void }).__pushStatus(
      { type: 'reconnecting' },
      { type: 'reconnect', data: 'nats://host' },
      { type: 'disconnect' },
      { type: 'error', data: new Error('boom') },
    );
    connectMock.mockResolvedValue(nc as never);

    await mod.connectNats();
    // monitorConnection runs the status iterator in the background; let it settle.
    await new Promise((r) => setTimeout(r, 10));

    expect(mockLogger.warn).toHaveBeenCalledWith('[NATS] Reconnecting...');
    expect(mockLogger.info).toHaveBeenCalledWith('[NATS] Reconnected to nats://host');
    expect(mockLogger.warn).toHaveBeenCalledWith('[NATS] Disconnected');
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('[NATS] Error: Error: boom'));
  });
});