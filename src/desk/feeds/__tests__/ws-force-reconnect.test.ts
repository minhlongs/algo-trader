/**
 * Tests for ws-force-reconnect — forceReconnect orchestration.
 *
 * Stateful helper bound to a BaseWebSocketClient via `this`; tested via
 * .call(client, ...) with a hand-rolled client stub. Logger is mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../shared/utils/logger', () => ({ logger: mockLogger }));

import { forceReconnect } from '../ws-force-reconnect';

interface ClientStub {
  emit: ReturnType<typeof vi.fn>;
  reconnectTimer: NodeJS.Timeout | null;
  reconnectAttempts: number;
  ws: { close: ReturnType<typeof vi.fn> } | null;
  scheduleReconnect: ReturnType<typeof vi.fn>;
}

function makeClient(overrides: Partial<ClientStub> = {}): ClientStub {
  return {
    emit: vi.fn(),
    reconnectTimer: null,
    reconnectAttempts: 0,
    ws: null,
    scheduleReconnect: vi.fn(),
    ...overrides,
  };
}

describe('forceReconnect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs the reason with the client', () => {
    const client = makeClient();
    forceReconnect.call(client as never, 'heartbeat timeout');
    expect(mockLogger.info).toHaveBeenCalledWith('[WebSocket] Force reconnect: heartbeat timeout');
  });

  it('emits a forceReconnect event with reason and timestamp', () => {
    const client = makeClient();
    forceReconnect.call(client as never, 'manual');
    expect(client.emit).toHaveBeenCalledWith('forceReconnect', {
      reason: 'manual',
      timestamp: expect.any(Number),
    });
  });

  it('clears an existing reconnect timer before reconnecting', () => {
    const fakeTimer = {} as NodeJS.Timeout;
    const client = makeClient({ reconnectTimer: fakeTimer });
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout').mockImplementation(() => {});
    forceReconnect.call(client as never, 'stale timer');
    expect(clearTimeoutSpy).toHaveBeenCalledWith(fakeTimer);
    expect(client.reconnectTimer).toBeNull();
    clearTimeoutSpy.mockRestore();
  });

  it('does not call clearTimeout when no timer is set', () => {
    const client = makeClient();
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout').mockImplementation(() => {});
    forceReconnect.call(client as never, 'no timer');
    expect(clearTimeoutSpy).not.toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it('closes the underlying socket when connected', () => {
    const close = vi.fn();
    const client = makeClient({ ws: { close } });
    forceReconnect.call(client as never, 'socket close');
    expect(close).toHaveBeenCalledTimes(1);
    expect(client.ws).toBeNull();
  });

  it('does not close the socket when none is open', () => {
    const client = makeClient({ ws: null });
    forceReconnect.call(client as never, 'no socket');
    // emit still fired; nothing threw
    expect(client.emit).toHaveBeenCalled();
  });

  it('resets reconnect attempts to zero', () => {
    const client = makeClient({ reconnectAttempts: 7 });
    forceReconnect.call(client as never, 'reset');
    expect(client.reconnectAttempts).toBe(0);
  });

  it('reschedules the reconnect at the end', () => {
    const client = makeClient();
    forceReconnect.call(client as never, 'reschedule');
    expect(client.scheduleReconnect).toHaveBeenCalledTimes(1);
  });
});
