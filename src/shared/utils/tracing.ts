/**
 * OpenTelemetry tracing initialisation — Pillar 2 observability.
 *
 * Activation: set OTEL_EXPORTER_OTLP_ENDPOINT (e.g. http://localhost:4318/v1/traces).
 * Unset → silent noop (zero prod risk when endpoint unreachable).
 *
 * Keeps dynamic import so the SDK is optional at runtime even though deps
 * ship in package.json (see `@opentelemetry/sdk-trace-node`, `exporter-trace-otlp-http`).
 */

import { logger } from './logger';
import {
  type Span,
  type Tracer,
  noopTracer,
  applyRegionAttributes,
  resolveActiveSpan,
} from './tracing-helpers';

export * from './tracing-helpers';

let _tracer: Tracer = noopTracer;
let _initPromise: Promise<void> | null = null;
let _otelApi: typeof import('@opentelemetry/api') | null = null;

/**
 * Add region and environment attributes to the active span
 */
export function withRegionAttributes<T>(fn: () => Promise<T>): Promise<T> {
  const span = _tracer.startSpan('with-region');
  try {
    applyRegionAttributes(span);
    return fn();
  } finally {
    span.end();
  }
}

/**
 * Set region on currently active span (if any)
 */
export function setRegionOnActiveSpan(): void {
  // Manual attribute setting in middleware via annotateActiveSpanWithRegion
}

export function getTracer(_name = 'algo-trader'): Tracer {
  return _tracer;
}

async function runInit(): Promise<void> {
  const endpoint = process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];
  if (!endpoint) return;

  try {
    const [otelApi, otelSdk, otelExporter] = await Promise.all([
      import('@opentelemetry/api'),
      import('@opentelemetry/sdk-trace-node'),
      import('@opentelemetry/exporter-trace-otlp-http'),
    ]);
    _otelApi = otelApi;

    const exporter = new otelExporter.OTLPTraceExporter({ url: endpoint });
    const provider = new otelSdk.NodeTracerProvider({
      spanProcessors: [new otelSdk.BatchSpanProcessor(exporter)],
    });
    provider.register();

    const realTracer = otelApi.trace.getTracer('algo-trader');
    _tracer = {
      startActiveSpan: <T>(name: string, fn: (s: Span) => Promise<T>) =>
        realTracer.startActiveSpan(name, async (span) => {
          try {
            return await fn(span as unknown as Span);
          } catch (err) {
            span.recordException(err as Error);
            throw err;
          } finally {
            span.end();
          }
        }),
      startSpan: (name: string) => realTracer.startSpan(name) as unknown as Span,
    };
    logger.info('[Tracing] OTLP exporter active', { endpoint });
  } catch (err) {
    logger.warn('[Tracing] SDK unavailable — spans disabled', { err: String(err) });
  }
}

/**
 * Initialise tracing. Idempotent — concurrent callers share the same in-flight
 * promise; subsequent calls after resolution are no-ops.
 */
export function initTracing(): Promise<void> {
  if (!_initPromise) _initPromise = runInit();
  return _initPromise;
}

/** Reset for test isolation only. */
export function resetTracingForTests(): void {
  _tracer = noopTracer;
  _initPromise = null;
  _otelApi = null;
}

/**
 * Get the currently active span from OpenTelemetry context.
 * Returns null if no active span or tracing disabled.
 */
export function getActiveSpan(): Span | null {
  return resolveActiveSpan(_otelApi);
}

/**
 * Set region and environment on the active span (call from middleware)
 */
export function annotateActiveSpanWithRegion(region: string): void {
  const span = getActiveSpan();
  if (span) {
    applyRegionAttributes(span, region);
  }
}
