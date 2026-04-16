/**
 * IronClaw Fetch Proxy
 * Module-level fetch wrapper (NOT a global monkey-patch).
 * Import { ironclawFetch } in place of bare fetch for DLP-protected egress.
 *
 * Pipeline per call:
 *   match patterns → dispatch action → (redact? mutate) → real fetch → record → return
 */

import { randomUUID } from 'crypto';
import type { DlpPatternRegistry } from './dlp-pattern-registry';
import { matchPatterns } from '../audit/dlp-pattern-matcher';
import { dispatch, DlpBlockedError, requiresRedaction } from './dlp-action-dispatcher';
import { redactBody, redactHeaders } from './dlp-payload-redactor';
import { emitAlert, buildAlertEvent, type AlertEmitterConfig } from './dlp-alert-emitter';
import type { DlpOutboundRecorder } from '../audit/dlp-outbound-recorder';

export interface IronclawProxyOptions {
  subscriberId: string;
  registry: DlpPatternRegistry;
  recorder: DlpOutboundRecorder;
  alert?: AlertEmitterConfig;
  /** Override real fetch for tests. */
  fetchFn?: typeof fetch;
}

/**
 * DLP-protected fetch. Drop-in replacement for global fetch.
 * Throws DlpBlockedError when a block-action pattern matches.
 */
export async function ironclawFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  opts: IronclawProxyOptions,
): Promise<Response> {
  const url = typeof input === 'string' ? input : input.toString();
  const method = (init.method ?? 'GET').toUpperCase();
  const rawBody = typeof init.body === 'string' ? init.body : (init.body ? '[binary]' : '');

  // Flatten headers into Record<string, string>
  const headersObj: Record<string, string> = {};
  if (init.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((v, k) => { headersObj[k] = v; });
    } else if (Array.isArray(init.headers)) {
      for (const [k, v] of init.headers) headersObj[k] = v;
    } else {
      Object.assign(headersObj, init.headers);
    }
  }

  const patterns = await opts.registry.getPatterns();
  const matchTarget = { url, headers: headersObj, body: rawBody };
  const matchResult = matchPatterns(patterns, matchTarget);

  let finalBody = rawBody;
  let finalHeaders = headersObj;
  let resolvedAction: string = 'allow';
  let patternId: string | null = null;

  if (matchResult.matched) {
    const { pattern } = matchResult;
    patternId = pattern.id;

    // dispatch() throws DlpBlockedError for 'block' action
    const decision = dispatch(pattern.action, pattern.id, url);
    resolvedAction = decision.decision;

    if (requiresRedaction(decision)) {
      const bodyResult = redactBody(rawBody, patterns);
      const headerResult = redactHeaders(headersObj, patterns);
      finalBody = bodyResult.body;
      finalHeaders = headerResult.headers;
    }

    if (decision.decision === 'alert' || decision.decision === 'block') {
      if (opts.alert) {
        const eventType = decision.decision === 'block' ? 'block' : 'alert';
        emitAlert(
          buildAlertEvent(eventType, opts.subscriberId, url, pattern.id, pattern.name),
          opts.alert,
        ).catch(() => { /* best-effort */ });
      }
    }
  }

  // Record audit entry (non-blocking — fire and forget flush is scheduled)
  const ts = new Date().toISOString();
  opts.recorder.record({
    id: randomUUID(),
    subscriberId: opts.subscriberId,
    url,
    method,
    action: resolvedAction as 'allow' | 'redact' | 'block' | 'alert',
    patternId,
    body: rawBody,
    ts,
  }).catch(() => { /* best-effort */ });

  // Re-pack init with (possibly redacted) body/headers
  const finalInit: RequestInit = {
    ...init,
    headers: finalHeaders,
    body: finalBody || undefined,
  };

  const fn = opts.fetchFn ?? globalThis.fetch;
  return fn(input, finalInit);
}

/**
 * Create a bound proxy with fixed options — convenient for injection.
 */
export function createIronclawFetch(opts: IronclawProxyOptions) {
  return (input: RequestInfo | URL, init?: RequestInit) =>
    ironclawFetch(input, init ?? {}, opts);
}

export { DlpBlockedError };
