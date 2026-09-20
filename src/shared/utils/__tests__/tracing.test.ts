/**
 * Tracing initialization unit tests — part 1: noop + init gate
 *
 * Exercises src/shared/utils/tracing.ts default behavior and env-gated
 * init paths.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockSpan = {
  end: vi.fn(),
  setAttribute: vi.fn(),
  recordException: vi.fn(),
};

const mockTracer = {
  startActiveSpan: vi.fn(),
  startSpan: vi.fn(() => mockSpan),
};

const mockOTelApi = {
  trace: {
    getTracer: vi.fn(() => mockTracer),
    getActiveSpan: vi.fn(),
  },
};

class FakeProvider {
  register = vi.fn();
}

vi.mock('@opentelemetry/api', () => mockOTelApi);
vi.mock('@opentelemetry/sdk-trace-node', () => ({
  NodeTracerProvider: FakeProvider,
  BatchSpanProcessor: vi.fn(),
}));
vi.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: vi.fn(),
}));
vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  getTracer,
  initTracing,
  resetTracingForTests,
  withRegionAttributes,
  setRegionOnActiveSpan,
  annotateActiveSpanWithRegion,
  getActiveSpan,
} from '../tracing';

describe('tracing', () => {
  const originalEnv = { ...process.env };
  const originalGlobalRequest = (globalThis as { request?: unknown }).request;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTracer.startSpan.mockReturnValue(mockSpan);
    mockOTelApi.trace.getTracer.mockReturnValue(mockTracer);
    process.env = { ...originalEnv };
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete process.env.REGION;
    delete process.env.ENVIRONMENT;
    (globalThis as { request?: unknown }).request = undefined;
    resetTracingForTests();
  });

  afterEach(() => {
    process.env = originalEnv;
    (globalThis as { request?: unknown }).request = originalGlobalRequest;
    resetTracingForTests();
  });

  describe('getTracer', () => {
    it('returns a tracer with startActiveSpan and startSpan methods', () => {
      const tracer = getTracer();
      expect(tracer).toBeDefined();
      expect(typeof tracer.startActiveSpan).toBe('function');
      expect(typeof tracer.startSpan).toBe('function');
    });

    it('ignores the name parameter and returns the module tracer', () => {
      const tracer = getTracer('custom-name');
      expect(tracer).toBe(getTracer());
    });
  });

  describe('noop default behavior', () => {
    it('startActiveSpan invokes callback and returns its result when tracing disabled', async () => {
      const tracer = getTracer();
      const result = await tracer.startActiveSpan('test', async () => 'ok');
      expect(result).toBe('ok');
    });

    it('startSpan returns a span-like object when tracing disabled', () => {
      const tracer = getTracer();
      const span = tracer.startSpan('noop');
      expect(typeof span.end).toBe('function');
      expect(typeof span.setAttribute).toBe('function');
    });

    it('withRegionAttributes invokes callback when tracing disabled', async () => {
      const result = await withRegionAttributes(async () => 'noop-result');
      expect(result).toBe('noop-result');
    });
  });

  describe('initTracing — env gate', () => {
    it('returns early without calling dynamic imports when endpoint is unset', async () => {
      delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
      await initTracing();
      expect(mockOTelApi.trace.getTracer).not.toHaveBeenCalled();
    });

    it('is idempotent — concurrent callers share the same promise', () => {
      delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
      const p1 = initTracing();
      const p2 = initTracing();
      expect(p1).toBe(p2);
    });

    it('initializes OTEL tracer when endpoint is set', async () => {
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318/v1/traces';

      await initTracing();

      expect(mockOTelApi.trace.getTracer).toHaveBeenCalledWith('algo-trader');

      const tracer = getTracer();
      expect(typeof tracer.startActiveSpan).toBe('function');
    });
  });

  describe('setRegionOnActiveSpan', () => {
    it('is a no-op function that does not throw', () => {
      expect(() => setRegionOnActiveSpan()).not.toThrow();
    });
  });

  describe('annotateActiveSpanWithRegion', () => {
    it('does not throw when called (no-op when no active span)', () => {
      expect(() => annotateActiveSpanWithRegion('DFW')).not.toThrow();
    });

    it('is callable with various region values', () => {
      expect(() => annotateActiveSpanWithRegion('SFO')).not.toThrow();
      expect(() => annotateActiveSpanWithRegion('IAD')).not.toThrow();
      expect(() => annotateActiveSpanWithRegion('')).not.toThrow();
    });
  });

  describe('getActiveSpan', () => {
    it('returns null when no active span exists (try/catch path)', () => {
      expect(getActiveSpan()).toBeNull();
    });

    it('does not throw when called', () => {
      expect(() => getActiveSpan()).not.toThrow();
    });
  });

  describe('resetTracingForTests', () => {
    it('resets tracer to noop after init attempt', async () => {
      delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
      await initTracing();
      resetTracingForTests();
      const tracer = getTracer();
      const result = await tracer.startActiveSpan('test', async () => 'reset');
      expect(result).toBe('reset');
    });
  });
});
