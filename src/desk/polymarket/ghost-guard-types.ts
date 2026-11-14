/**
 * Zod schemas and TypeScript contracts for `GhostGuard` webhook payloads,
 * bridge telemetry, and loopback HTTP server configuration.
 *
 * Matches `sidecars/ghost-guard/src/types.rs` (`FillVerdict` with `#[serde(tag = "verdict")]`
 * and `GhostFillEvent`) and `sidecars/ghost-guard/src/callback.rs`.
 */

import { z } from 'zod';
import type { PolyKillSwitch } from '../risk/poly-kill-switch';

export const txHashSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, 'Expected 32-byte 0x-prefixed hex transaction hash');

export const evmAddressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'Expected 20-byte 0x-prefixed hex EVM address');

export const fillVerdictRealSchema = z.object({
  verdict: z.literal('Real'),
  tx_hash: txHashSchema,
  block: z.number().int().nonnegative(),
});

export const fillVerdictGhostSchema = z.object({
  verdict: z.literal('Ghost'),
  tx_hash: txHashSchema,
  reason: z.string(),
  counterparty: evmAddressSchema.nullable().optional(),
});

export const fillVerdictTimeoutSchema = z.object({
  verdict: z.literal('Timeout'),
  tx_hash: txHashSchema,
});

export const fillVerdictSchema = z.discriminatedUnion('verdict', [
  fillVerdictRealSchema,
  fillVerdictGhostSchema,
  fillVerdictTimeoutSchema,
]);

export type FillVerdictReal = z.infer<typeof fillVerdictRealSchema>;
export type FillVerdictGhost = z.infer<typeof fillVerdictGhostSchema>;
export type FillVerdictTimeout = z.infer<typeof fillVerdictTimeoutSchema>;
export type FillVerdict = z.infer<typeof fillVerdictSchema>;

export const ghostFillEventSchema = z.object({
  tx_hash: txHashSchema,
  market: z.string(),
  side: z.string(),
  size: z.number().finite().nonnegative(),
  price: z.number().finite().nonnegative(),
  counterparty: evmAddressSchema.nullable().optional(),
  reason: z.string(),
  timestamp: z.number().int().nonnegative(),
});

export type GhostFillEvent = z.infer<typeof ghostFillEventSchema>;

export const ghostGuardWebhookPayloadSchema = z.union([
  fillVerdictSchema,
  ghostFillEventSchema,
]);

export type GhostGuardWebhookPayload = z.infer<typeof ghostGuardWebhookPayloadSchema>;

export type GhostGuardTriggerKind = 'Real' | 'Ghost' | 'Timeout' | 'GhostFillEvent';

export interface GhostGuardBridgeStats {
  totalPayloads: number;
  realVerdicts: number;
  ghostVerdicts: number;
  timeoutVerdicts: number;
  ghostFillEvents: number;
  killSwitchFires: number;
  idempotentReplays: number;
  invalidPayloads: number;
  unauthorizedRequests: number;
  lastTriggeredReason?: string;
  lastTxHash?: string;
}

export interface GhostGuardAlertSummary {
  kind: Exclude<GhostGuardTriggerKind, 'Real'>;
  txHash: string;
  reason: string;
  counterparty?: string | null;
  market?: string;
  fireReason: string;
  issued: boolean;
}

export interface GhostGuardBridgeOptions {
  stats?: GhostGuardBridgeStats;
  onGhostFill?: (alert: GhostGuardAlertSummary) => void;
  nowMs?: () => number;
}

export interface GhostGuardHandleResult {
  ok: boolean;
  kind?: GhostGuardTriggerKind;
  txHash?: string;
  latched: boolean;
  issued: boolean;
  latencyMs: number;
  fireReason?: string;
  error?: string;
}

export interface GhostGuardWebhookServerOptions {
  port?: number;
  host?: string;
  killSwitch: PolyKillSwitch;
  onGhostFill?: (alert: GhostGuardAlertSummary) => void;
  authToken?: string;
  nowMs?: () => number;
}

export interface GhostGuardWebhookServer {
  readonly host: string;
  readonly port: number;
  readonly url: string;
  getStats(): GhostGuardBridgeStats;
  close(): Promise<void>;
}

export function createEmptyGhostGuardStats(): GhostGuardBridgeStats {
  return {
    totalPayloads: 0,
    realVerdicts: 0,
    ghostVerdicts: 0,
    timeoutVerdicts: 0,
    ghostFillEvents: 0,
    killSwitchFires: 0,
    idempotentReplays: 0,
    invalidPayloads: 0,
    unauthorizedRequests: 0,
  };
}
