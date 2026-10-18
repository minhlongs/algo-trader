/**
 * Tracing initialization unit tests — part 1: noop + init gate
 * Exercises src/shared/utils/tracing.ts default behavior and env-gated init paths.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockSpan = { end: vi.fn(), setAttribute: vi.fn(), recordException: vi.fn() };
const mockTracer = { startActiveSpan: vi.fn(), startSpan: vi.fn(() => mockSpan) };
const mockOTelApi = { trace: { getTracer: vi.fn(() => mockTracer), getActiveSpan: vi.fn() } };

class FakeProvider { register = vi.fn(); }

vi.mock('@opentelemetry/api', () => mockOTelApi);
vi.mock('@opentelemetry/sdk-trace-node', () => ({
  NodeTracerProvider: FakeProvider,
  BatchSpanProcessor: vi.fn(),
}));
vi.mock('@opentelemetry/exporter-trace-otlp-http', () => ({ OTLPTraceExporter: vi.fn() }));
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
    it('returns a tracer with startActiveSpan and startSpan methods and ignores name param', () => {
      const tracer = getTracer();
      expect(tracer).toBeDefined();
      expect(typeof tracer.startActiveSpan).toBe('function');
      expect(typeof tracer.startSpan).toBe('function');
      expect(getTracer('custom-name')).toBe(getTracer());
    });
  });

  describe('noop default behavior', () => {
    it('startActiveSpan, startSpan, and withRegionAttributes work when tracing disabled', async () => {
      expect(await getTracer().startActiveSpan('test', async () => 'ok')).toBe('ok');
      const span = getTracer().startSpan('noop');
      expect(typeof span.end).toBe('function');
      expect(typeof span.setAttribute).toBe('function');
      expect(await withRegionAttributes(async () => 'noop-result')).toBe('noop-result');
    });
  });

  describe('initTracing — env gate', () => {
    it('returns early without calling dynamic imports when endpoint is unset and is idempotent', async () => {
      delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
      await initTracing();
      expect(mockOTelApi.trace.getTracer).not.toHaveBeenCalled();
      expect(initTracing()).toBe(initTracing());
    });

    it('initializes OTEL tracer when endpoint is set', async () => {
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318/v1/traces';
      await initTracing();
      expect(mockOTelApi.trace.getTracer).toHaveBeenCalledWith('algo-trader');
      expect(typeof getTracer().startActiveSpan).toBe('function');
    });
  });

  describe('region & active span helpers', () => {
    it('setRegionOnActiveSpan and annotateActiveSpanWithRegion do not throw', () => {
      expect(() => setRegionOnActiveSpan()).not.toThrow();
      for (const region of ['DFW', 'SFO', 'IAD', '']) {
        expect(() => annotateActiveSpanWithRegion(region)).not.toThrow();
      }
    });

    it('getActiveSpan returns null when no active span exists and does not throw', () => {
      expect(() => getActiveSpan()).not.toThrow();
      expect(getActiveSpan()).toBeNull();
    });
  });

  describe('resetTracingForTests', () => {
    it('resets tracer to noop after init attempt', async () => {
      delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
      await initTracing();
      resetTracingForTests();
      expect(await getTracer().startActiveSpan('test', async () => 'reset')).toBe('reset');
    });
  });
});
