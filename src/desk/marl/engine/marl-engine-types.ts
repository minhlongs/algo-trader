/**
 * Type definitions and configuration schemas for MARL Engine master orchestrator.
 *
 * @module desk/marl/engine/marl-engine-types
 */

import { z } from 'zod';
import { AvellanedaStoikovConfigSchema } from '../types/marl-config-types';
import { DeltaNeutralCoordinatorConfigSchema } from '../hedging/delta-neutral-coordinator';
import { AdverseSelectionGuardConfigSchema } from '../microstructure/adverse-selection-guard';
import { MarlRiskConfigSchema } from '../risk/marl-risk-types';

export const MarlEngineConfigSchema = z.object({
  symbol: z.string().default('BTC/USDT'),
  asConfig: AvellanedaStoikovConfigSchema.optional().default(() =>
    AvellanedaStoikovConfigSchema.parse({}),
  ),
  deltaHedgeConfig: DeltaNeutralCoordinatorConfigSchema.optional().default(() =>
    DeltaNeutralCoordinatorConfigSchema.parse({}),
  ),
  adverseSelectionConfig: AdverseSelectionGuardConfigSchema.optional().default(() =>
    AdverseSelectionGuardConfigSchema.parse({}),
  ),
  riskConfig: MarlRiskConfigSchema.optional().default(() =>
    MarlRiskConfigSchema.parse({}),
  ),
  auditSecret: z.string().optional(),
});

export type MarlEngineConfig = z.infer<typeof MarlEngineConfigSchema>;

export interface MarlEngineStatus {
  isRunning: boolean;
  symbol: string;
  inventory: number;
  netDelta: number;
  portfolioCapital: number;
  toxicityTripwireActive: boolean;
  riskHalted: boolean;
}

export interface MarlQuoteOutput {
  reservationPrice: number;
  bidPrice: number;
  askPrice: number;
  bidSpread: number;
  askSpread: number;
  totalSpread: number;
  wideningMultiplier: number;
  clamped: boolean;
}
