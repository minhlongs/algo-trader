/**
 * IronClaw — DLP egress filter public API barrel.
 */

export { DlpPatternRegistry, DEFAULT_PATTERNS } from './dlp-pattern-registry';
export type { DlpPattern, DlpAction, DlpScope, MatchType, PatternStore } from './dlp-pattern-registry';

export { redactBody, redactHeaders } from './dlp-payload-redactor';
export type { RedactResult } from './dlp-payload-redactor';

export { dispatch, requiresRedaction, DlpBlockedError } from './dlp-action-dispatcher';
export type { DispatchDecision } from './dlp-action-dispatcher';

export { emitAlert, buildAlertEvent } from './dlp-alert-emitter';
export type { AlertEvent, AlertEmitterConfig } from './dlp-alert-emitter';

export { ironclawFetch, createIronclawFetch } from './ironclaw-fetch-proxy';
export type { IronclawProxyOptions } from './ironclaw-fetch-proxy';
