// OpenTelemetry tracing initialization
// Activate by setting OTEL_EXPORTER_OTLP_ENDPOINT env var
// Install @opentelemetry/api and @opentelemetry/sdk-trace-node to enable

// Minimal tracer interface — mirrors @opentelemetry/api Tracer
interface Tracer {
  startSpan(name: string): { end(): void };
}

// No-op tracer used when SDK is not installed
const noopTracer: Tracer = {
  startSpan: () => ({ end: () => undefined }),
};

let _tracer: Tracer = noopTracer;

export function getTracer(_name = 'cashclaw'): Tracer {
  return _tracer;
}

export function initTracing(): void {
  const endpoint = process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];
  if (!endpoint) return;

  try {
    // Dynamic import to avoid bundling SDK when not needed
    // Requires @opentelemetry/api and @opentelemetry/sdk-trace-node to be installed
    Promise.all([
      import('@opentelemetry/api' as string),
      import('@opentelemetry/sdk-trace-node' as string),
    ]).then(([otelApi, otelSdk]) => {
      const provider = new (otelSdk as { NodeTracerProvider: new () => { register(): void } }).NodeTracerProvider();
      provider.register();
      _tracer = (otelApi as { trace: { getTracer(name: string): Tracer } }).trace.getTracer('cashclaw');
    }).catch(() => {
      // SDK not installed — tracing disabled, noop tracer remains active
    });
  } catch {
    // Tracing not available
  }
}
