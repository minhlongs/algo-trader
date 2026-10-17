/**
 * Wave 241: Almgren & Chriss (2000) Non-Linear Power-Law Execution Engine
 * Strictly < 50 LOC, zero :any.
 */

import { AlmgrenPowerLawConfig, AlmgrenPowerLawSchedule } from './almgren-power-law-types';
import { computeAlmgrenPowerLawSchedule } from './almgren-power-law-math';

export class AlmgrenPowerLawEngine {
  private readonly config: AlmgrenPowerLawConfig;

  constructor(config: AlmgrenPowerLawConfig) {
    if (config.totalInventoryX0 < 0) {
      throw new Error('totalInventoryX0 must be non-negative');
    }
    this.config = config;
  }

  public generateSchedule(intervalsN: number = 10): AlmgrenPowerLawSchedule {
    return computeAlmgrenPowerLawSchedule(this.config, intervalsN);
  }
}
