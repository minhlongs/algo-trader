/**
 * Telemetry Types & Strict Zod Schemas
 * Cross-engine telemetry, consolidated portfolio snapshot, and PnL attribution models.
 */

import * as z from 'zod';
import { EngineIdSchema, type EngineId } from '../portfolio/types';

export { EngineIdSchema, type EngineId };

export const EngineTelemetrySnapshotSchema = z.object({
  engineId: EngineIdSchema,
  allocatedCapitalUsd: z.number().min(0),
  mtmPnlUsd: z.number(),
  marginUsedUsd: z.number().min(0),
  tradeCount: z.number().int().min(0),
  realizedPnlUsd: z.number().optional(),
  unrealizedPnlUsd: z.number().optional(),
  netCashFlowUsd: z.number().optional(),
  openPositionsCount: z.number().int().min(0).optional(),
  lastUpdated: z.number().int().nonnegative().optional(),
});
export type EngineTelemetrySnapshot = z.infer<typeof EngineTelemetrySnapshotSchema>;

export const ConsolidatedPortfolioSnapshotSchema = z.object({
  timestamp: z.number().int().nonnegative(),
  totalEquityUsd: z.number(),
  unallocatedCashUsd: z.number().min(0),
  allocatedCapitalUsd: z.number().min(0),
  totalMtmPnlUsd: z.number(),
  grossLeverage: z.number().nonnegative(),
  marginUtilizationRatio: z.number().min(0),
  roceAnnualized: z.number(),
  accountingDriftUsd: z.number().min(0),
  engineSnapshots: z.record(EngineIdSchema, EngineTelemetrySnapshotSchema),
});
export type ConsolidatedPortfolioSnapshot = z.infer<typeof ConsolidatedPortfolioSnapshotSchema>;

export const PnLAttributionSchema = z.object({
  engineId: EngineIdSchema,
  realizedPnlUsd: z.number(),
  unrealizedPnlUsd: z.number(),
  totalMtmPnlUsd: z.number(),
  netCashFlowUsd: z.number(),
  feesPaidUsd: z.number().nonnegative(),
  gasPaidUsd: z.number().nonnegative(),
  timestamp: z.number().int().nonnegative(),
});
export type PnLAttribution = z.infer<typeof PnLAttributionSchema>;

export const MarginUtilizationSchema = z.object({
  engineId: EngineIdSchema.optional(),
  initialMarginUsd: z.number().min(0),
  maintenanceMarginUsd: z.number().min(0),
  totalMarginUsedUsd: z.number().min(0),
  capitalBaseUsd: z.number().min(0),
  marginUtilizationRatio: z.number().min(0),
  grossLeverage: z.number().nonnegative(),
  warningThresholdBreached: z.boolean(),
  criticalThresholdBreached: z.boolean(),
});
export type MarginUtilization = z.infer<typeof MarginUtilizationSchema>;

export const RoceReportSchema = z.object({
  engineId: EngineIdSchema.optional(),
  totalPnlUsd: z.number(),
  capitalEmployedUsd: z.number().min(0),
  daysElapsed: z.number().nonnegative(),
  roce: z.number(),
  roceAnnualized: z.number(),
  timestamp: z.number().int().nonnegative(),
});
export type RoceReport = z.infer<typeof RoceReportSchema>;

export const RiskLedgerEntrySchema = z.object({
  sequenceNumber: z.number().int().positive(),
  timestamp: z.number().int().nonnegative(),
  totalNavUsd: z.number(),
  allocations: z.record(EngineIdSchema, z.number().min(0)),
  pnlSnapshot: z.record(EngineIdSchema, z.number()),
  prevHash: z.string().min(1),
  currentHash: z.string().length(64),
  date: z.string().optional(),
  unallocatedCashUsd: z.number().optional(),
  marginUtilizationRatio: z.number().optional(),
  grossLeverage: z.number().optional(),
});
export type RiskLedgerEntry = z.infer<typeof RiskLedgerEntrySchema>;
export type RiskLedgerRecord = RiskLedgerEntry;

export const ProvenanceRunCardSchema = z.object({
  runCardId: z.string(),
  date: z.string(),
  generatedAt: z.number().int().nonnegative(),
  totalSnapshots: z.number().int().nonnegative(),
  chainIntegrityValid: z.boolean(),
  totalNavUsd: z.number(),
  totalMtmPnlUsd: z.number(),
  annualizedRoce: z.number(),
  markdownContent: z.string(),
  filePath: z.string().optional(),
});
export type ProvenanceRunCard = z.infer<typeof ProvenanceRunCardSchema>;
