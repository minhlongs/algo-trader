/**
 * Desk Status Server Types & Schemas
 * Milestone M4: Telemetry & HTTP Status Server
 */

import * as z from 'zod';
import type { DeskMetricsRegistry } from '../telemetry/desk-metrics-registry';

export const DeskHealthResponseSchema = z.object({
  status: z.literal('ok'),
  uptimeSeconds: z.number().nonnegative(),
  timestamp: z.string(),
});
export type DeskHealthResponse = z.infer<typeof DeskHealthResponseSchema>;

export const DeskStatusEngineEntrySchema = z.object({
  status: z.string(),
  allocatedCapitalUsd: z.number().nonnegative(),
  lastSignalTime: z.number().optional(),
  activeOrders: z.number().optional(),
  error: z.string().optional(),
});
export type DeskStatusEngineEntry = z.infer<typeof DeskStatusEngineEntrySchema>;

export const DeskStatusResponseSchema = z.object({
  status: z.string(),
  mode: z.string(),
  circuitBreakerTier: z.string(),
  navUsd: z.number(),
  driftUsd: z.number(),
  engines: z.record(z.string(), DeskStatusEngineEntrySchema),
  uptimeSeconds: z.number().nonnegative().optional(),
  cycleCount: z.number().nonnegative().optional(),
  allocatedCapitalUsd: z.record(z.string(), z.number()).optional(),
  unallocatedCashUsd: z.number().optional(),
});
export type DeskStatusResponse = z.infer<typeof DeskStatusResponseSchema>;

export const DeskAllocationsResponseSchema = z.object({
  totalNavUsd: z.number(),
  unallocatedCashUsd: z.number(),
  cashBufferRatio: z.number(),
  allocations: z.record(z.string(), z.number()),
  allocatedCapitalUsd: z.record(z.string(), z.number()).optional(),
  driftUsd: z.number(),
  isZeroDrift: z.boolean(),
});
export type DeskAllocationsResponse = z.infer<typeof DeskAllocationsResponseSchema>;

export const DeskStatusServerConfigSchema = z.object({
  port: z.number().int().min(0).max(65535).default(9100),
  host: z.string().default('127.0.0.1'),
});
export type DeskStatusServerConfig = z.infer<typeof DeskStatusServerConfigSchema>;

export interface IDeskStatusDataProvider {
  getUptimeSeconds?: () => number;
  getStatus?: () => DeskStatusResponse | Promise<DeskStatusResponse>;
  getAllocations?: () => DeskAllocationsResponse | Promise<DeskAllocationsResponse>;
  getMetricsText?: () => string | Promise<string>;
}

export interface DeskStatusServerOptions {
  readonly port?: number;
  readonly host?: string;
  readonly dataProvider?: IDeskStatusDataProvider;
  readonly metricsRegistry?: DeskMetricsRegistry;
}
