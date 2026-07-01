/**
 * Example 1: Hello World Strategy
 *
 * This is the simplest possible strategy - it always returns "wait".
 * Use this as a starting point to understand the strategy structure.
 *
 * LEARNING OBJECTIVES:
 * - Understand the IStrategy interface
 * - See how to implement required methods
 * - Learn the signal structure
 *
 * NEXT STEPS:
 * - Modify to return 'buy' when price increases
 * - Add simple moving average logic (see 02-sma-crossover.ts)
 */

import type { IStrategy, ICandle, ISignal } from '../../interfaces/IStrategy';
import { logger } from '../../../shared/utils/logger';

const STRATEGY_NAME = 'HelloWorld';

export class HelloWorldStrategy implements IStrategy {
  private priceHistory: ICandle[] = [];

  getName(): string {
    return STRATEGY_NAME;
  }

  /**
   * Initialize the strategy
   * Called once when the strategy starts
   * Use this to load models, establish connections, etc.
   */
  async initialize(): Promise<void> {
    logger.info('[HelloWorld] Strategy initialized', STRATEGY_NAME);
    // No initialization needed for this simple example
  }

  /**
   * Main execution method
   * Called on each new candle/data point
   * Must return a trading signal
   */
  async execute(candles: ICandle[]): Promise<ISignal> {
    // Store price history for future analysis
    this.priceHistory.push(...candles);
    this.priceHistory = this.priceHistory.slice(-100); // Keep last 100 candles

    // For now, always wait (no trading)
    return this.waitSignal('Hello World strategy - not yet implemented');
  }

  /**
   * Helper: Create a buy signal
   */
  private buySignal(confidence: number, reason: string, metadata?: Record<string, any>): ISignal {
    return {
      action: 'buy',
      confidence: Math.min(Math.max(confidence, 0), 1), // Clamp 0-1
      reason,
      metadata,
    };
  }

  /**
   * Helper: Create a sell signal
   */
  private sellSignal(confidence: number, reason: string, metadata?: Record<string, any>): ISignal {
    return {
      action: 'sell',
      confidence: Math.min(Math.max(confidence, 0), 1),
      reason,
      metadata,
    };
  }

  /**
   * Helper: Create a wait signal
   */
  private waitSignal(reason: string, metadata?: Record<string, any>): ISignal {
    return {
      action: 'wait',
      confidence: 0,
      reason,
      metadata,
    };
  }

  /**
   * Optional: Get strategy status for monitoring
   */
  getStatus?(): Record<string, any> {
    return {
      name: STRATEGY_NAME,
      candlesProcessed: this.priceHistory.length,
      ready: true,
    };
  }

  /**
   * Optional: Cleanup when strategy stops
   */
  dispose?(): void {
    logger.info('[HelloWorld] Strategy disposed', STRATEGY_NAME);
  }
}
