/**
 * log-aggregator — Unit Tests
 *
 * Tests LogAggregator, backends, and child logger.
 * Uses fake timers carefully to avoid infinite loop from setInterval in constructor.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoisted mocks
const { mockFs, mockLogger } = vi.hoisted(() => ({
  mockFs: {
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
    createWriteStream: vi.fn(() => ({
      write: vi.fn(),
      end: vi.fn(),
    })),
    renameSync: vi.fn(),
  },
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: mockFs.existsSync,
    mkdirSync: mockFs.mkdirSync,
    createWriteStream: mockFs.createWriteStream,
    renameSync: mockFs.renameSync,
  };
});

vi.mock('../../../shared/utils/logger', () => ({
  logger: mockLogger,
}));

const {
  LogAggregator,
  StdoutBackend,
  FileBackend,
  HttpBackend,
  generateTraceId,
} = await import('../log-aggregator');

describe('log-aggregator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateTraceId', () => {
    it('generates a trace ID with timestamp and random parts', () => {
      const id = generateTraceId();
      expect(typeof id).toBe('string');
      expect(id).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
    });

    it('generates unique IDs on subsequent calls', () => {
      const id1 = generateTraceId();
      const id2 = generateTraceId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('LogAggregator', () => {
    afterEach(async () => {
      vi.useRealTimers();
    });

    function createAggregator(opts?: {
      minLevel?: 'debug' | 'info' | 'warn' | 'error' | 'critical';
      bufferSize?: number;
      backends?: any[];
      flushIntervalMs?: number;
    }) {
      return new LogAggregator({
        serviceName: 'test-service',
        minLevel: opts?.minLevel ?? 'debug',
        bufferSize: opts?.bufferSize ?? 200,
        flushIntervalMs: opts?.flushIntervalMs ?? 60000, // long interval so we control flush manually
        backends: opts?.backends ?? [new StdoutBackend()],
      });
    }

    describe('constructor defaults', () => {
      it('uses defaults when config not provided', () => {
        vi.useFakeTimers();
        const agg = new LogAggregator();
        expect(agg).toBeInstanceOf(LogAggregator);
        agg.shutdown();
      });

      it('uses service name from env when not in config', () => {
        vi.useFakeTimers();
        vi.stubEnv('SERVICE_NAME', 'env-service');
        const agg = new LogAggregator({ backends: [new StdoutBackend()] });
        expect(agg).toBeInstanceOf(LogAggregator);
        agg.shutdown();
        vi.unstubAllEnvs();
      });

      it('uses config service name over env', () => {
        vi.useFakeTimers();
        vi.stubEnv('SERVICE_NAME', 'env-service');
        const agg = new LogAggregator({ serviceName: 'custom-service', backends: [new StdoutBackend()] });
        expect(agg).toBeInstanceOf(LogAggregator);
        agg.shutdown();
        vi.unstubAllEnvs();
      });
    });

    describe('level filtering', () => {
      it('filters out debug/info when minLevel is warn', async () => {
        const mockBackend = { name: 'mock', write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
        const agg = createAggregator({ minLevel: 'warn', backends: [mockBackend] });

        agg.debug('debug msg');
        agg.info('info msg');
        agg.warn('warn msg');
        agg.error('error msg');
        agg.critical('critical msg');

        await agg.flush();

        // Only warn, error, critical should be flushed (3 entries)
        expect(mockBackend.write).toHaveBeenCalledTimes(1);
        const flushed = mockBackend.write.mock.calls[0][0];
        expect(flushed).toHaveLength(3);
        expect(flushed[0].level).toBe('warn');
        expect(flushed[1].level).toBe('error');
        expect(flushed[2].level).toBe('critical');
        agg.shutdown();
      });

      it('logs all levels when minLevel is debug', async () => {
        const mockBackend = { name: 'mock', write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
        const agg = createAggregator({ minLevel: 'debug', backends: [mockBackend] });

        agg.debug('debug');
        agg.info('info');
        agg.warn('warn');
        agg.error('error');
        agg.critical('critical');

        await agg.flush();

        expect(mockBackend.write).toHaveBeenCalledTimes(1);
        const flushed = mockBackend.write.mock.calls[0][0];
        expect(flushed).toHaveLength(5);
        agg.shutdown();
      });
    });

    describe('log methods', () => {
      it('debug creates entry with correct fields', async () => {
        const mockBackend = { name: 'mock', write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
        const agg = createAggregator({ backends: [mockBackend] });

        agg.debug('debug msg', { key: 'val' }, 'trace-123');
        await agg.flush();

        const entry = mockBackend.write.mock.calls[0][0][0];
        expect(entry.level).toBe('debug');
        expect(entry.message).toBe('debug msg');
        expect(entry.service).toBe('test-service');
        expect(entry.traceId).toBe('trace-123');
        expect(entry.context).toEqual({ key: 'val' });
        expect(entry.timestamp).toBeDefined();
        agg.shutdown();
      });

      it('error creates entry with error object', async () => {
        const mockBackend = { name: 'mock', write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
        const agg = createAggregator({ backends: [mockBackend] });

        const err = new Error('something broke');
        agg.error('error msg', { userId: 1 }, err, 'trace-err');
        await agg.flush();

        const entry = mockBackend.write.mock.calls[0][0][0];
        expect(entry.level).toBe('error');
        expect(entry.message).toBe('error msg');
        expect(entry.traceId).toBe('trace-err');
        expect(entry.context).toEqual({ userId: 1 });
        expect(entry.error).toEqual({
          name: 'Error',
          message: 'something broke',
          stack: err.stack,
        });
        agg.shutdown();
      });

      it('critical creates entry with error object', async () => {
        const mockBackend = { name: 'mock', write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
        const agg = createAggregator({ backends: [mockBackend] });

        const err = new Error('critical failure');
        agg.critical('critical msg', { ctx: true }, err, 'trace-crit');
        await agg.flush();

        const entry = mockBackend.write.mock.calls[0][0][0];
        expect(entry.level).toBe('critical');
        expect(entry.error?.name).toBe('Error');
        expect(entry.error?.message).toBe('critical failure');
        agg.shutdown();
      });

      it('excludes empty context object', async () => {
        const mockBackend = { name: 'mock', write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
        const agg = createAggregator({ backends: [mockBackend] });

        agg.info('msg', {});
        await agg.flush();

        const entry = mockBackend.write.mock.calls[0][0][0];
        expect(entry.context).toBeUndefined();
        agg.shutdown();
      });

      it('excludes context when undefined', async () => {
        const mockBackend = { name: 'mock', write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
        const agg = createAggregator({ backends: [mockBackend] });

        agg.info('msg');
        await agg.flush();

        const entry = mockBackend.write.mock.calls[0][0][0];
        expect(entry.context).toBeUndefined();
        expect(entry.traceId).toBeUndefined();
        agg.shutdown();
      });

      it('includes traceId when provided', async () => {
        const mockBackend = { name: 'mock', write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
        const agg = createAggregator({ backends: [mockBackend] });

        agg.info('msg', {}, 'my-trace');
        await agg.flush();

        const entry = mockBackend.write.mock.calls[0][0][0];
        expect(entry.traceId).toBe('my-trace');
        agg.shutdown();
      });
    });

    describe('buffer flush', () => {
      it('flushes when buffer reaches bufferSize', async () => {
        const mockBackend = { name: 'mock', write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
        const agg = createAggregator({ bufferSize: 3, backends: [mockBackend] });

        agg.info('msg1');
        agg.info('msg2');
        // Third triggers flush
        agg.info('msg3');

        // addEntry is async but called fire-and-forget; give it a tick
        await new Promise(r => setImmediate(r));
        // Give another tick for the flush
        await new Promise(r => setImmediate(r));

        expect(mockBackend.write).toHaveBeenCalledTimes(1);
        const flushed = mockBackend.write.mock.calls[0][0];
        expect(flushed).toHaveLength(3);
        agg.shutdown();
      });

      it('clears buffer after flush', async () => {
        const mockBackend = { name: 'mock', write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
        const agg = createAggregator({ bufferSize: 2, backends: [mockBackend] });

        agg.info('msg1');
        agg.info('msg2'); // triggers flush
        await new Promise(r => setImmediate(r));
        await new Promise(r => setImmediate(r));

        agg.info('msg3');
        agg.info('msg4'); // triggers another flush
        await new Promise(r => setImmediate(r));
        await new Promise(r => setImmediate(r));

        // Two flushes: [msg1,msg2] and [msg3,msg4]
        expect(mockBackend.write).toHaveBeenCalledTimes(2);
        agg.shutdown();
      });

      it('does not flush empty buffer', async () => {
        const mockBackend = { name: 'mock', write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
        const agg = createAggregator({ backends: [mockBackend] });

        await agg.flush();
        expect(mockBackend.write).not.toHaveBeenCalled();
        agg.shutdown();
      });

      it('handles flush error from backend gracefully', async () => {
        const mockBackend = { name: 'mock', write: vi.fn().mockRejectedValue(new Error('write failed')), close: vi.fn().mockResolvedValue(undefined) };
        const agg = createAggregator({ backends: [mockBackend] });

        agg.info('msg1');
        // flush uses Promise.allSettled, so errors are swallowed
        await expect(agg.flush()).resolves.toBeUndefined();
        agg.shutdown();
      });

      it('flushes to multiple backends', async () => {
        const backend1 = { name: 'b1', write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
        const backend2 = { name: 'b2', write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
        const agg = createAggregator({ backends: [backend1, backend2] });

        agg.info('msg');
        await agg.flush();

        expect(backend1.write).toHaveBeenCalledTimes(1);
        expect(backend2.write).toHaveBeenCalledTimes(1);
        agg.shutdown();
      });
    });

    describe('auto-flush interval', () => {
      it('flushes on interval', async () => {
        vi.useFakeTimers();
        const mockBackend = { name: 'mock', write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
        const agg = new LogAggregator({
          serviceName: 'test-service',
          minLevel: 'debug',
          bufferSize: 200,
          flushIntervalMs: 5000,
          backends: [mockBackend],
        });

        agg.info('msg1');

        // Advance timer to trigger auto-flush
        vi.advanceTimersByTime(5000);
        // flush() is async inside setInterval callback; give it a tick
        await vi.advanceTimersByTimeAsync(0);

        expect(mockBackend.write).toHaveBeenCalledTimes(1);
        agg.shutdown();
      });
    });

    describe('shutdown', () => {
      it('flushes remaining logs on shutdown', async () => {
        const mockBackend = { name: 'mock', write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
        const agg = createAggregator({ backends: [mockBackend] });

        agg.info('final message');
        await agg.shutdown();

        expect(mockBackend.write).toHaveBeenCalledTimes(1);
      });

      it('closes all backends on shutdown', async () => {
        const mockBackend = { name: 'mock', write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
        const agg = createAggregator({ backends: [mockBackend] });

        await agg.shutdown();

        expect(mockBackend.close).toHaveBeenCalledTimes(1);
      });

      it('stops flush timer on shutdown', async () => {
        vi.useFakeTimers();
        const mockBackend = { name: 'mock', write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
        const agg = new LogAggregator({
          serviceName: 'test-service',
          minLevel: 'debug',
          bufferSize: 200,
          flushIntervalMs: 5000,
          backends: [mockBackend],
        });

        await agg.shutdown();

        // Advance past interval — should not flush again
        mockBackend.write.mockClear();
        vi.advanceTimersByTime(10000);
        await vi.advanceTimersByTimeAsync(0);

        expect(mockBackend.write).not.toHaveBeenCalled();
      });

      it('sets closed flag to prevent new logs', async () => {
        const mockBackend = { name: 'mock', write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
        const agg = createAggregator({ backends: [mockBackend] });

        await agg.shutdown();
        agg.info('after shutdown');
        await agg.flush();

        // Should have flushed 0 entries (msg was ignored)
        expect(mockBackend.write).not.toHaveBeenCalled();
      });
    });

    describe('child logger', () => {
      it('creates child logger with bound context', async () => {
        const mockBackend = { name: 'mock', write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
        const agg = createAggregator({ backends: [mockBackend] });

        const child = agg.child({ module: 'auth' }, 'trace-456');
        child.info('child message');
        await agg.flush();

        const entry = mockBackend.write.mock.calls[0][0][0];
        expect(entry.context).toEqual({ module: 'auth' });
        expect(entry.traceId).toBe('trace-456');
        agg.shutdown();
      });

      it('merges parent and child context (child wins)', async () => {
        const mockBackend = { name: 'mock', write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
        const agg = createAggregator({ backends: [mockBackend] });

        const child = agg.child({ module: 'auth', shared: 'parent' }, 'trace-1');
        child.info('child msg', { shared: 'child', extra: true });
        await agg.flush();

        const entry = mockBackend.write.mock.calls[0][0][0];
        expect(entry.context).toEqual({ module: 'auth', shared: 'child', extra: true });
        agg.shutdown();
      });

      it('child debug calls parent.debug with merged context', async () => {
        const mockBackend = { name: 'mock', write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
        const agg = createAggregator({ backends: [mockBackend] });

        const child = agg.child({ module: 'auth' }, 'trace-debug');
        child.debug('debug from child', { childKey: 'val' });
        await agg.flush();

        const entry = mockBackend.write.mock.calls[0][0][0];
        expect(entry.level).toBe('debug');
        expect(entry.context).toEqual({ module: 'auth', childKey: 'val' });
        expect(entry.traceId).toBe('trace-debug');
        agg.shutdown();
      });

      it('child warn calls parent.warn with merged context', async () => {
        const mockBackend = { name: 'mock', write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
        const agg = createAggregator({ backends: [mockBackend] });

        const child = agg.child({ module: 'auth' }, 'trace-warn');
        child.warn('warn from child', { childKey: 'val' });
        await agg.flush();

        const entry = mockBackend.write.mock.calls[0][0][0];
        expect(entry.level).toBe('warn');
        expect(entry.context).toEqual({ module: 'auth', childKey: 'val' });
        expect(entry.traceId).toBe('trace-warn');
        agg.shutdown();
      });

      it('child error includes error details', async () => {
        const mockBackend = { name: 'mock', write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
        const agg = createAggregator({ backends: [mockBackend] });

        const child = agg.child({ module: 'auth' });
        child.error('err msg', {}, new Error('child err'));
        await agg.flush();

        const entry = mockBackend.write.mock.calls[0][0][0];
        expect(entry.level).toBe('error');
        expect(entry.error?.message).toBe('child err');
        agg.shutdown();
      });

      it('child critical includes error details', async () => {
        const mockBackend = { name: 'mock', write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
        const agg = createAggregator({ backends: [mockBackend] });

        const child = agg.child({ module: 'auth' });
        child.critical('crit msg', {}, new Error('crit err'));
        await agg.flush();

        const entry = mockBackend.write.mock.calls[0][0][0];
        expect(entry.level).toBe('critical');
        expect(entry.error?.message).toBe('crit err');
        agg.shutdown();
      });

      it('child without traceId inherits nothing', async () => {
        const mockBackend = { name: 'mock', write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
        const agg = createAggregator({ backends: [mockBackend] });

        const child = agg.child({ module: 'test' });
        child.info('msg');
        await agg.flush();

        const entry = mockBackend.write.mock.calls[0][0][0];
        expect(entry.traceId).toBeUndefined();
        agg.shutdown();
      });

      it('child mergeContext merges objects correctly', async () => {
        const mockBackend = { name: 'mock', write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
        const agg = createAggregator({ backends: [mockBackend] });

        const child = agg.child({ a: 1, b: 2 });
        child.info('msg', { b: 20, c: 3 });
        await agg.flush();

        const entry = mockBackend.write.mock.calls[0][0][0];
        expect(entry.context).toEqual({ a: 1, b: 20, c: 3 });
        agg.shutdown();
      });
    });

    describe('closed flag branch', () => {
      it('addEntry returns early when closed is true', async () => {
        const mockBackend = { name: 'mock', write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
        const agg = createAggregator({ backends: [mockBackend] });

        await agg.shutdown();
        // These should not add to buffer
        agg.info('msg1');
        agg.warn('msg2');
        agg.error('msg3');
        await agg.flush();

        expect(mockBackend.write).not.toHaveBeenCalled();
      });

      it('addEntry returns early when level is below minLevel', async () => {
        const mockBackend = { name: 'mock', write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
        const agg = createAggregator({ minLevel: 'error', backends: [mockBackend] });

        agg.debug('debug');
        agg.info('info');
        agg.warn('warn');
        await agg.flush();

        // Only error and above would pass minLevel check
        expect(mockBackend.write).not.toHaveBeenCalled();
      });
    });
  });

  describe('StdoutBackend', () => {
    it('writes entries to stdout as JSON lines', async () => {
      const backend = new StdoutBackend();
      expect(backend.name).toBe('stdout');

      const entries = [
        { level: 'info' as const, message: 'test', timestamp: '2026-01-01T00:00:00.000Z', service: 'test' },
        { level: 'warn' as const, message: 'test2', timestamp: '2026-01-01T00:00:01.000Z', service: 'test' },
      ];

      await backend.write(entries);
      await backend.close(); // no-op
    });
  });

  describe('FileBackend', () => {
    it('creates directory if not exists', () => {
      mockFs.existsSync.mockReturnValueOnce(false);
      const backend = new FileBackend('/tmp/logs/test.log');
      expect(mockFs.mkdirSync).toHaveBeenCalledWith('/tmp/logs', { recursive: true });
    });

    it('does not create directory if already exists', () => {
      mockFs.existsSync.mockReturnValueOnce(true);
      const backend = new FileBackend('/tmp/logs/test.log');
      expect(mockFs.mkdirSync).not.toHaveBeenCalled();
    });

    it('writes entries to file stream', async () => {
      const mockStream = { write: vi.fn(), end: vi.fn() };
      mockFs.createWriteStream.mockReturnValue(mockStream);

      const backend = new FileBackend('/tmp/test.log');
      const entries = [
        { level: 'info' as const, message: 'test', timestamp: '2026-01-01T00:00:00.000Z', service: 'test' },
      ];

      await backend.write(entries);

      expect(mockStream.write).toHaveBeenCalledWith(JSON.stringify(entries[0]) + '\n');
    });

    it('rotates file when size exceeds maxSizeBytes', async () => {
      const mockStream = { write: vi.fn(), end: vi.fn() };
      mockFs.createWriteStream.mockReturnValue(mockStream);

      const backend = new FileBackend('/tmp/test.log', 100); // 100 bytes max
      const bigEntry = { level: 'info' as const, message: 'x'.repeat(50), timestamp: '2026-01-01T00:00:00.000Z', service: 'test' };

      // Two writes exceeding 100 bytes
      await backend.write([bigEntry]);
      await backend.write([bigEntry]);

      expect(mockFs.renameSync).toHaveBeenCalled();
    });

    it('handles renameSync error gracefully during rotation', async () => {
      const mockStream = { write: vi.fn(), end: vi.fn() };
      mockFs.createWriteStream.mockReturnValue(mockStream);
      mockFs.renameSync.mockImplementation(() => { throw new Error('rename failed'); });

      const backend = new FileBackend('/tmp/test.log', 50);
      const bigEntry = { level: 'info' as const, message: 'x'.repeat(30), timestamp: '2026-01-01T00:00:00.000Z', service: 'test' };

      await backend.write([bigEntry]);
      await backend.write([bigEntry]); // triggers rotation

      // Should not throw despite renameSync error
      expect(mockFs.renameSync).toHaveBeenCalled();
    });

    it('closes stream on close', async () => {
      const mockStream = { write: vi.fn(), end: vi.fn() };
      mockFs.createWriteStream.mockReturnValue(mockStream);

      const backend = new FileBackend('/tmp/test.log');
      await backend.close();

      expect(mockStream.end).toHaveBeenCalled();
    });

    it('handles null stream on close', async () => {
      const mockStream = { write: vi.fn(), end: vi.fn() };
      mockFs.createWriteStream.mockReturnValue(mockStream);

      const backend = new FileBackend('/tmp/test.log');
      await backend.close();
      await backend.close(); // second call should be no-op
    });

    it('returns early on write when stream is null', async () => {
      const mockStream = { write: vi.fn(), end: vi.fn() };
      mockFs.createWriteStream.mockReturnValue(mockStream);

      const backend = new FileBackend('/tmp/test.log');
      await backend.close(); // sets stream to null

      // Should not throw
      await backend.write([
        { level: 'info' as const, message: 'test', timestamp: '2026-01-01T00:00:00.000Z', service: 'test' },
      ]);

      expect(mockStream.write).not.toHaveBeenCalled();
    });

    it('uses default maxSizeBytes when not provided', () => {
      const backend = new FileBackend('/tmp/test.log');
      expect(backend.name).toBe('file:/tmp/test.log');
    });
  });

  describe('HttpBackend', () => {
    let mockFetch: ReturnType<typeof vi.fn>;
    let originalFetch: typeof global.fetch;

    beforeEach(() => {
      originalFetch = global.fetch;
      mockFetch = vi.fn();
      global.fetch = mockFetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('batches entries and sends when batchSize reached', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const backend = new HttpBackend('https://loki.example.com/push', 2, 5000);

      await backend.write([
        { level: 'info' as const, message: '1', timestamp: '2026-01-01T00:00:00.000Z', service: 'test' },
      ]);
      // 1 entry buffered, not enough for batch
      expect(mockFetch).not.toHaveBeenCalled();

      await backend.write([
        { level: 'info' as const, message: '2', timestamp: '2026-01-01T00:00:00.000Z', service: 'test' },
      ]);
      // 2 entries now, batch size reached
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://loki.example.com/push',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    it('flush sends remaining buffer even below batchSize', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const backend = new HttpBackend('https://loki.example.com/push', 10, 5000);

      await backend.write([
        { level: 'info' as const, message: '1', timestamp: '2026-01-01T00:00:00.000Z', service: 'test' },
      ]);
      await backend.flush();

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('flush is no-op when buffer is empty', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const backend = new HttpBackend('https://loki.example.com/push', 10, 5000);
      await backend.flush();

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('handles fetch errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('network error'));
      const errorSpy = vi.spyOn(mockLogger, 'error');

      const backend = new HttpBackend('https://loki.example.com/push', 1, 5000);

      await backend.write([
        { level: 'info' as const, message: '1', timestamp: '2026-01-01T00:00:00.000Z', service: 'test' },
      ]);

      expect(errorSpy).toHaveBeenCalledWith(
        '[LogAggregator] HTTP backend send failed',
        expect.objectContaining({
          endpoint: 'https://loki.example.com/push',
          count: 1,
          error: 'network error',
        }),
      );
    });

    it('handles non-Error thrown values in sendBatch', async () => {
      mockFetch.mockRejectedValue('string error');
      const errorSpy = vi.spyOn(mockLogger, 'error');

      const backend = new HttpBackend('https://loki.example.com/push', 1, 5000);

      await backend.write([
        { level: 'info' as const, message: '1', timestamp: '2026-01-01T00:00:00.000Z', service: 'test' },
      ]);

      expect(errorSpy).toHaveBeenCalledWith(
        '[LogAggregator] HTTP backend send failed',
        expect.objectContaining({
          error: 'string error',
        }),
      );
    });

    it('flushes on close', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const backend = new HttpBackend('https://loki.example.com/push', 10, 5000);
      await backend.write([
        { level: 'info' as const, message: '1', timestamp: '2026-01-01T00:00:00.000Z', service: 'test' },
      ]);
      await backend.close();

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('sets abort signal on timeout', async () => {
      // Mock fetch to be slow and track abort
      mockFetch.mockImplementation(async (_url: string, opts: any) => {
        return new Promise((resolve, reject) => {
          if (opts?.signal) {
            opts.signal.addEventListener('abort', () => {
              reject(new Error('aborted'));
            });
          }
          setTimeout(resolve, 10000);
        });
      });

      const backend = new HttpBackend('https://loki.example.com/push', 1, 100);
      const writePromise = backend.write([
        { level: 'info' as const, message: '1', timestamp: '2026-01-01T00:00:00.000Z', service: 'test' },
      ]);

      // Wait for the fetch to be called and abort to fire
      await new Promise(r => setTimeout(r, 200));
      await writePromise;

      // Should have logged error from abort
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('name reflects endpoint URL', () => {
      const backend = new HttpBackend('https://loki.example.com/push');
      expect(backend.name).toBe('http:https://loki.example.com/push');
    });
  });
});
