/**
 * DLP Alert Emitter
 * Fires HMAC-signed webhook on block/alert events.
 * Keeps I/O surface minimal — single POST per event (no retries for MVP).
 */

import { createHmac } from 'crypto';

export interface AlertEvent {
  eventType: 'block' | 'alert';
  subscriberId: string;
  url: string;
  patternId: string;
  patternName: string;
  ts: string;
}

export interface AlertEmitterConfig {
  webhookUrl: string;
  hmacSecret: string;
  /** Override fetch for tests. */
  fetchFn?: typeof fetch;
}

/**
 * Sign payload with HMAC-SHA256 and send to webhook URL.
 * Non-blocking: caller should not await in hot path.
 */
export async function emitAlert(
  event: AlertEvent,
  config: AlertEmitterConfig,
): Promise<void> {
  const body = JSON.stringify(event);
  const sig = createHmac('sha256', config.hmacSecret).update(body).digest('hex');

  const fn = config.fetchFn ?? globalThis.fetch;
  await fn(config.webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-IronClaw-Signature': `sha256=${sig}`,
    },
    body,
  });
}

/**
 * Build an AlertEvent from proxy context.
 */
export function buildAlertEvent(
  eventType: 'block' | 'alert',
  subscriberId: string,
  url: string,
  patternId: string,
  patternName: string,
): AlertEvent {
  return {
    eventType,
    subscriberId,
    url,
    patternId,
    patternName,
    ts: new Date().toISOString(),
  };
}
