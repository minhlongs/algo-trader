// SPDX-License-Identifier: MIT
/**
 * 25-Step Open-Core Public GitHub + SaaS Monetization Catalog
 * Canonical catalog mapping open-core OSS foundations to hosted RaaS monetization.
 *
 * @module desk/opencoresaas2026monetization/catalog
 */

import { OPEN_CORE_STEPS_1_TO_15 } from './catalog-phases-1-to-3';
import { OPEN_CORE_STEPS_16_TO_25 } from './catalog-phases-4-to-5';

export type OpenCorePhase =
  | 'PHASE_1_SPLIT_AND_HYGIENE'
  | 'PHASE_2_PLUGIN_AND_SEAMS'
  | 'PHASE_3_CLOUD_CONTROL_PLANE'
  | 'PHASE_4_ENTERPRISE_MONETIZATION'
  | 'PHASE_5_PLG_GROWTH_AND_GOVERNANCE';

export type TierLevel = 'BASIC' | 'PREMIUM' | 'ENTERPRISE' | 'MASTER';

export interface OpenCoreStep {
  readonly stepNumber: number;
  readonly id: string;
  readonly name: string;
  readonly phase: OpenCorePhase;
  readonly targetModule: string;
  readonly minTier: TierLevel;
  readonly isOssCore: boolean;
  readonly descriptionEn: string;
  readonly descriptionVi: string;
}

export const OPEN_CORE_25_STEPS: readonly OpenCoreStep[] = [
  ...OPEN_CORE_STEPS_1_TO_15,
  ...OPEN_CORE_STEPS_16_TO_25,
];
