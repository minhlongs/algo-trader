import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const wsClientFilePath = resolve(__dirname, '../../../src/ui/shared/ws-client.js');

class MockWebSocket {
  static OPEN = 1;
  readyState = 1;
  url: string;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  static lastInstance: MockWebSocket | null = null;

  constructor(url: string) {
    if (url === 'ws://throw-error') throw new Error('connection failed');
    this.url = url;
    MockWebSocket.lastInstance = this;
  }
  send(data: string) { this.sent.push(data); }
  close() { this.readyState = 3; }
}

describe('WebSocket Client Browser Compatibility & Lifecycle', () => {
  let wsModule: typeof import('../../../src/ui/shared/ws-client.js');
  let originalWebSocket: any;
  let originalDocument: any;
  let originalSessionStorage: any;
  let mockStorage: Record<string, string>;
  let mockDots: Array<{ classList: { add: any; remove: any } }>;

  beforeEach(async () => {
    vi.useFakeTimers();
    originalWebSocket = (globalThis as any).WebSocket;
    originalDocument = (globalThis as any).document;
    originalSessionStorage = (globalThis as any).sessionStorage;

    (globalThis as any).WebSocket = MockWebSocket;
    mockStorage = {};
    (globalThis as any).sessionStorage = {
      getItem: (k: string) => mockStorage[k] || null,
      setItem: (k: string, v: string) => { mockStorage[k] = v; },
    };

    mockDots = [{
      classList: {
        add: vi.fn(),
        remove: vi.fn(),
      },
    }];
    (globalThis as any).document = {
      querySelectorAll: vi.fn().mockReturnValue(mockDots),
    };

    wsModule = await import('../../../src/ui/shared/ws-client.js');
  });

  afterEach(() => {
    vi.useRealTimers();
    (globalThis as any).WebSocket = originalWebSocket;
    (globalThis as any).document = originalDocument;
    (globalThis as any).sessionStorage = originalSessionStorage;
  });

  it('does NOT contain Node.js TypeScript import of backend logger', () => {
    const content = readFileSync(wsClientFilePath, 'utf-8');
    expect(content).not.toContain("from '../../shared/utils/logger'");
    expect(content).not.toContain('from "../../shared/utils/logger"');
    expect(content).not.toMatch(/import\s+{[^}]+}\s+from\s+['"][^'"]*logger['"]/);
  });

  it('exports required functions and provides safe initial state', () => {
    expect(typeof wsModule.connect).toBe('function');
    expect(typeof wsModule.on).toBe('function');
    expect(typeof wsModule.getStatus).toBe('function');
    expect(typeof wsModule.getLastSeq).toBe('function');
    expect(typeof wsModule.forceReconnect).toBe('function');
    expect(wsModule.getStatus()).toBe('stale');
    expect(wsModule.getLastSeq('test-ch')).toBe(0);
  });

  it('handles connect, onopen, messages, deduplication, and replay protocol', () => {
    const events: string[] = [];
    const receivedMessages: any[] = [];
    const replayEvents: any[] = [];

    wsModule.on('open', () => events.push('open'));
    wsModule.on('close', () => events.push('close'));
    wsModule.on('message', (d) => receivedMessages.push(d));
    wsModule.on('replay_start', (d) => replayEvents.push(d));
    wsModule.on('exploding_handler', () => { throw new Error('boom'); });

    wsModule.connect('ws://127.0.0.1:8080');
    expect(wsModule.getStatus()).toBe('connecting');
    const ws = MockWebSocket.lastInstance!;
    expect(ws).toBeDefined();

    ws.onopen!();
    expect(wsModule.getStatus()).toBe('connected');
    expect(events).toContain('open');

    // Message processing & tracking
    ws.onmessage!({ data: JSON.stringify({ channel: 'trades', seq: 42, price: 100 }) });
    expect(wsModule.getLastSeq('trades')).toBe(42);
    expect(receivedMessages).toHaveLength(1);

    // Dedup check: same sequence ignored
    ws.onmessage!({ data: JSON.stringify({ channel: 'trades', seq: 42, price: 100 }) });
    expect(receivedMessages).toHaveLength(1);

    // Next sequence tracked
    ws.onmessage!({ data: JSON.stringify({ channel: 'trades', seq: 43, price: 105 }) });
    expect(wsModule.getLastSeq('trades')).toBe(43);
    expect(receivedMessages).toHaveLength(2);

    // Special replay control messages
    ws.onmessage!({ data: JSON.stringify({ type: 'replay_start', channel: 'trades' }) });
    expect(replayEvents).toHaveLength(1);

    // Non-JSON raw text payload
    ws.onmessage!({ data: 'plain text ping' });
    expect(receivedMessages).toContain('plain text ping');

    // Error and close handling
    ws.onerror!();
    expect(wsModule.getStatus()).toBe('error');

    ws.onclose!();
    expect(events).toContain('close');
    expect(wsModule.getStatus()).toBe('error');
  });

  it('handles constructor error and schedules reconnect with backoff', () => {
    wsModule.connect('ws://throw-error');
    expect(wsModule.getStatus()).toBe('error');

    // Advance timer to trigger reconnect
    vi.advanceTimersByTime(2000);
  });

  it('handles forceReconnect and sendReconnect with existing sequence numbers', () => {
    wsModule.connect('ws://127.0.0.1:8080');
    const ws1 = MockWebSocket.lastInstance!;
    ws1.onopen!();
    ws1.onmessage!({ data: JSON.stringify({ channel: 'orders', seq: 99 }) });
    expect(wsModule.getLastSeq('orders')).toBe(99);

    // Reconnecting sends previous sequence numbers
    wsModule.connect('ws://127.0.0.1:8080');
    const ws2 = MockWebSocket.lastInstance!;
    ws2.onopen!();
    expect(ws2.sent.some((s) => s.includes('"orders":99'))).toBe(true);

    // forceReconnect resets sequences
    wsModule.forceReconnect();
    expect(wsModule.getLastSeq('orders')).toBe(0);
  });

  it('triggers stale timer and supports storage URL fallback & dedup eviction', () => {
    mockStorage['cc-ws-url'] = 'ws://cached-url';
    wsModule.connect(); // url null -> retrieves from storage
    expect(wsModule.getStatus()).toBe('connecting');
    const ws = MockWebSocket.lastInstance!;
    ws.onopen!();
    expect(wsModule.getStatus()).toBe('connected');

    // Trigger stale timer timeout
    vi.advanceTimersByTime(65000);
    expect(wsModule.getStatus()).toBe('stale');

    // Feed > 5000 seqs to trigger cache eviction
    for (let i = 1; i <= 5005; i++) {
      ws.onmessage!({ data: JSON.stringify({ channel: 'stress', seq: i }) });
    }
    expect(wsModule.getLastSeq('stress')).toBe(5005);
  });

  it('runs safely in SSR environment when document is undefined', () => {
    delete (globalThis as any).document;
    expect(() => wsModule.connect('ws://127.0.0.1:9999')).not.toThrow();
  });
});
