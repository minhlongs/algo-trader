// SPDX-License-Identifier: MIT
/**
 * Zod Validation Schemas for Stitch UI Cockpit API Routes
 * Extracted from `stitch-cockpit-routes.ts` for <95 LOC modularity.
 */

import { z } from 'zod';

export const snapshotQuerySchema = z.object({
  tenantId: z.string().min(1).default('tenant-demo-01'),
  tier: z.enum(['BASIC', 'PREMIUM', 'ENTERPRISE', 'MASTER']).default('PREMIUM'),
  theme: z
    .enum(['OBSIDIAN_QUANTUM', 'BENTO_RAAS_GLASS', 'NORDIC_MINIMALIST_QUANT'])
    .default('OBSIDIAN_QUANTUM'),
});

export const killSwitchBodySchema = z.object({
  tenantId: z.string().min(1),
  reason: z.string().min(3).max(240),
});

export const sorMeshQuerySchema = z.object({
  algorithm: z
    .enum([
      'ALMGREN_CHRISS_OPTIMAL',
      'VOLUME_IN_LINE_VIL',
      'IMPLEMENTATION_SHORTFALL',
      'DARK_POOL_ICEBERG',
    ])
    .default('ALMGREN_CHRISS_OPTIMAL'),
  parentOrderNotionalUsd: z.coerce.number().positive().default(2500000),
});

export const regimeKellyQuerySchema = z.object({
  activeRegime: z
    .enum(['BULL_QUIET', 'NORMAL_LIQUID', 'VOL_EXPANSION', 'TOXIC_FLASH_CRASH'])
    .default('NORMAL_LIQUID'),
  portfolioEquityUsd: z.coerce.number().positive().default(1248500),
});

export const hawkesRadarQuerySchema = z.object({
  inventoryUnits: z.coerce.number().min(-1000).max(1000).default(4.5),
  riskAversionGamma: z.coerce.number().positive().max(10).default(0.15),
});

export const queueReactiveQuerySchema = z.object({
  bestBidQueueSizeLots: z.coerce.number().positive().max(10000).default(18.4),
  bestAskQueueSizeLots: z.coerce.number().positive().max(10000).default(9.6),
});

export const avellanedaLipkinQuerySchema = z.object({
  inventoryUnits: z.coerce.number().min(-1000).max(1000).default(4.5),
  riskAversionGamma: z.coerce.number().positive().max(10).default(0.5),
  volatilitySigma: z.coerce.number().positive().max(1).default(0.05),
  midPrice: z.coerce.number().positive().default(100),
});

export const statarbGlostenMilgromQuerySchema = z.object({
  informedTraderShareAlpha: z.coerce.number().min(0).max(1).default(0.3),
  priorProbHighMu: z.coerce.number().min(0.000001).max(0.999999).default(0.6),
});
