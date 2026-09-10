/**
 * Tests for ws-connection — connectWebSocket + waitForConnection.
 *
 * Both are stateful `this`-bound helpers on a BaseWebSocketClient. The global
 * WebSocket constructor is mocked so no real socket opens; the on* handlers
 * are captured and fired explicitly from the test. logger is mocked too so the
 * connection logging is a no-op.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { connectWebSocket, waitForConnection } from '../../../../src/desk/feeds/ws-connection';
import type { BaseWebSocketClient } from '../../../../src/desk/feeds/websocket-client';
import type { WebSocketConfig, ConnectionStats, WebSocketState } from '../../../../src/desk/feeds/ws-types';

class FakeWS extends EventEmitter {
  readyState = 1; // WebSocket.OPEN
  url = '';
  send = vi.fn();
  close = vi.fn();
  onopen: ((ev: any) => void) | null = null;
  onclose: ((ev: any) => void) | null = null;
  onerror: ((ev: any) => void) | null = null;
  onmessage: ((ev: any) => void) | null = null;

  // The real WebSocket dispatches on* properties, not EventEmitter listeners.
  emit(event: string, ...args: any[]): boolean {
    const handler = (this as unknown as Record<string, unknown>)['on' + event];
    if (typeof handler === 'function') (handler as (...a: any[]) => void)(...args);
    // Node throws on an EventEmitter 'error' event with no listener; swallow.
    if (event === 'error') return true;
    return super.emit(event, ...args);
  }
}

const connect = connectWebSocket as unknown as (this: FakeClient) => Promise<void>;
const waitFor = waitForConnection as unknown as (
  this: FakeClient,
  timeout: number,
) => Promise<boolean>;

class FakeClient extends EventEmitter implements Partial<BaseWebSocketClient> {
  ws = null as unknown as FakeWS;
  config: WebSocketConfig = {
    url: 'wss://example.test/ws',
    reconnectDelay: 1000,
    maxReconnectDelay: 30000,
    heartbeatInterval: 30000,
    reconnectMultiplier: 2,
    maxReconnectAttempts: 5,
    enableJitter: false,
    heartbeatTimeout: 10000,
    latencyTracking: false,
  };
  reconnectAttempts = 0;
  state: WebSocketState = 'disconnected';
  stats = {
    connectedAt: undefined,
    disconnectedAt: undefined,
    reconnectCount: 0,
    messageCount: 0,
    heartbeatCount: 0,
    lastLatency: undefined,
    avgLatency: 0,
    minLatency: 0,
    maxLatency: 0,
    p95Latency: 0,
    latencySamples: [],
    uptime: 0,
  } as ConnectionStats;
  lastMessageTime = 0;
  pendingHeartbeat = false;
  messageHandlers = new Set<(msg: any) => void>();
  startHeartbeat = vi.fn();
  stopHeartbeat = vi.fn();
  scheduleReconnect = vi.fn();
  recordLatency = vi.fn();
  handleMessage = vi.fn().mockReturnValue(null);
  isConnected = vi.fn().mockReturnValue(false);
}

describe('connectWebSocket', () => {
  let client: FakeClient;
  let fakeWs: FakeWS;
  let loggerSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    client = new FakeClient();
    fakeWs = new FakeWS();
    vi.stubGlobal(
      'WebSocket',
      function (this: unknown, url: string) {
        fakeWs.url = url;
        return fakeWs as unknown as WebSocket;
      } as unknown as typeof WebSocket,
    );
    loggerSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    loggerSpy.mockRestore();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('transitions to connecting and opens the socket', async () => {
    const p = connect.call(client);
    expect(client.state).toBe('connecting');
    expect(fakeWs.url).toBe('wss://example.test/ws');
    fakeWs.emit('open');
    await p;

    expect(client.state).toBe('connected');
    expect(client.stats.connectedAt).toBeGreaterThan(0);
    expect(client.reconnectAttempts).toBe(0);
    expect(client.lastMessageTime).toBeGreaterThan(0);
    expect(client.startHeartbeat).toHaveBeenCalledTimes(1);
  });

  it('emits connected event on open', async () => {
    const onConnected = vi.fn();
    client.on('connected', onConnected);
    const p = connect.call(client);
    fakeWs.emit('open');
    await p;
    expect(onConnected).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'wss://example.test/ws' }),
    );
  });

  it('schedules reconnect on close when under the attempt limit', async () => {
    const p = connect.call(client);
    fakeWs.emit('open');
    await p;
    client.reconnectAttempts = 2;
    fakeWs.emit('close', { code: 1001, reason: 'bye' });
    expect(client.state).toBe('disconnected');
    expect(client.stopHeartbeat).toHaveBeenCalledTimes(1);
    expect(client.scheduleReconnect).toHaveBeenCalledTimes(1);
  });

  it('marks failed when max reconnect attempts reached', async () => {
    const p = connect.call(client);
    fakeWs.emit('open');
    await p;
    client.reconnectAttempts = 5; // maxReconnectAttempts
    const onFailed = vi.fn();
    client.on('failed', onFailed);
    fakeWs.emit('close', { code: 1000, reason: 'done' });
    expect(client.state).toBe('failed');
    expect(onFailed).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'Max reconnect attempts reached' }),
    );
  });

  it('rejects and emits error on socket error', async () => {
    const onError = vi.fn();
    client.on('error', onError);
    const err = new Error('boom');
    const p = connect.call(client);
    fakeWs.emit('error', err);
    await expect(p).rejects.toBe(err);
    expect(client.state).toBe('disconnected');
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ error: err }),
    );
  });

  it('routes messages through handlers and emits message', async () => {
    const handler = vi.fn();
    client.messageHandlers.add(handler);
    client.handleMessage.mockReturnValue({ type: 'trade' } as any);
    const p = connect.call(client);
    fakeWs.emit('open');
    await p;

    const data = { type: 'trade', ts: Date.now() };
    const onMsg = vi.fn();
    client.on('message', onMsg);
    fakeWs.emit('message', { data: JSON.stringify(data) });
    expect(client.handleMessage).toHaveBeenCalledWith(data);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'trade' }),
    );
    expect(onMsg).toHaveBeenCalledTimes(1);
  });

  it('records latency when latencyTracking enabled and ts present', async () => {
    client.config.latencyTracking = true;
    client.handleMessage.mockReturnValue({ type: 'ticker' } as any);
    const p = connect.call(client);
    fakeWs.emit('open');
    await p;

    const now = 1_000_000;
    vi.setSystemTime(now);
    fakeWs.emit('message', { data: JSON.stringify({ type: 'ticker', ts: now - 50 }) });
    expect(client.recordLatency).toHaveBeenCalledWith(50);
  });

  it('emits parse error when message JSON is invalid', async () => {
    const p = connect.call(client);
    fakeWs.emit('open');
    await p;

    const onError = vi.fn();
    client.on('error', onError);
    fakeWs.emit('message', { data: 'not-json{' });
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'parse' }),
    );
  });

  it('rejects when the WebSocket constructor throws', async () => {
    vi.stubGlobal(
      'WebSocket',
      (function () {
        throw new Error('socket init failed');
      }) as unknown as typeof WebSocket,
    );
    await expect(connect.call(client)).rejects.toThrow('socket init failed');
    expect(client.state).toBe('disconnected');
  });
});

describe('waitForConnection', () => {
  let client: FakeClient;

  beforeEach(() => {
    vi.useFakeTimers();
    client = new FakeClient();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('resolves true immediately when already connected', async () => {
    client.isConnected.mockReturnValue(true);
    await expect(waitFor.call(client, 5000)).resolves.toBe(true);
  });

  it('resolves false on timeout', async () => {
    const p = waitFor.call(client, 1000);
    vi.advanceTimersByTime(1001);
    await expect(p).resolves.toBe(false);
  });

  it('resolves true when connected event fires', async () => {
    const p = waitFor.call(client, 5000);
    client.emit('connected');
    await expect(p).resolves.toBe(true);
  });

  it('resolves false when failed event fires', async () => {
    const p = waitFor.call(client, 5000);
    client.emit('failed');
    await expect(p).resolves.toBe(false);
  });
});