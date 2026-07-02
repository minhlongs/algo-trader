/**
 * Risk Manager — V2 migration compatibility stub.
 *
 * Validates trade signals against risk parameters before execution.
 * NOTE: Placeholder for the desk-level risk management module.
 */
import { logger } from './logger';

export interface RiskManagerConfig {
  maxPositionSize: string;
  maxDrawdown: number;
  maxOpenPositions: number;
  stopLossPercent: number;
  maxLeverage: number;
}

export class RiskManager {
  constructor(config: RiskManagerConfig) {
    logger.debug('RiskManager stub created', 'RiskManager');
  }
}
