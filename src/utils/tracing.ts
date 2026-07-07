/**
 * OpenTelemetry tracing initialization (stub)
 * No-op unless OTEL_EXPORTER_OTLP_ENDPOINT is configured.
 */
export async function initTracing(): Promise<void> {
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return;
  // OTel provider — skip if not installed
  try {
    const { NodeSDK } = require('@opentelemetry/sdk-node');
    const sdk = new NodeSDK();
    await sdk.start();
  } catch {
    // OTel not installed — no-op
  }
}
