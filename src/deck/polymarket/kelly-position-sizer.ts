/**
 * Kelly Criterion Position Sizer — type definitions for strategy consumption.
 */

export interface KellyPositionSizer {
  calculateSize(params: {
    probability: number;
    odds: number;
    bankroll: number;
    maxFraction?: number;
  }): number;
  getOptimalFraction(winRate: number, avgWin: number, avgLoss: number): number;
  /** Get recommended position size for a named strategy */
  getSize(strategyName: string): { size: number };
}
