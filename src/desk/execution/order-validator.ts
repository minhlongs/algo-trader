/**
 * Order Validator
 * Validates orders before execution
 *
 * Validation rules:
 * - Minimum spread threshold
 * - Maximum position size
 * - Exchange balance check
 * - Rate limit compliance
 */

import { ArbitrageOpportunity } from '../arbitrage/spread-detector';
import {
  type ValidationResult,
  type ValidatorConfig,
  DEFAULT_VALIDATOR_CONFIG,
  evaluateOpportunityRules,
  computeMidnightMs,
  shouldResetDailyCounter,
} from './order-validator-rules';

export {
  type ValidationResult,
  type ValidatorConfig,
  DEFAULT_VALIDATOR_CONFIG,
  evaluateOpportunityRules,
  computeMidnightMs,
  shouldResetDailyCounter,
};

export class OrderValidator {
  private config: ValidatorConfig;
  private dailyTradeCount = 0;
  private dailyTradeResetTime = 0;

  constructor(config?: Partial<ValidatorConfig>) {
    this.config = {
      ...DEFAULT_VALIDATOR_CONFIG,
      ...config,
    };
  }

  /**
   * Validate arbitrage opportunity
   */
  validate(opportunity: ArbitrageOpportunity, amount: number): ValidationResult {
    this.checkDailyReset();
    return evaluateOpportunityRules(opportunity, amount, this.config, this.dailyTradeCount);
  }

  /**
   * Increment daily trade counter
   */
  incrementTradeCount(): void {
    this.checkDailyReset();
    this.dailyTradeCount++;
  }

  /**
   * Reset counter at midnight
   */
  private checkDailyReset(): void {
    const now = Date.now();
    const midnightMs = computeMidnightMs();

    if (shouldResetDailyCounter(now, this.dailyTradeResetTime, midnightMs)) {
      this.dailyTradeCount = 0;
      this.dailyTradeResetTime = midnightMs;
    }
  }

  /**
   * Get current trade count
   */
  getDailyTradeCount(): number {
    this.checkDailyReset();
    return this.dailyTradeCount;
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<ValidatorConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Get current config
   */
  getConfig(): ValidatorConfig {
    return { ...this.config };
  }
}
