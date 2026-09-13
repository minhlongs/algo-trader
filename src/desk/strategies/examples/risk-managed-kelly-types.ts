/**
 * Risk-Managed Kelly Strategy — Types
 */

export interface Position {
  entryPrice: number;
  size: number;
  stopLoss: number;
  takeProfit: number;
  side: 'long' | 'short';
  timestamp: number;
}

export interface RiskMetrics {
  dailyPnL: number;
  peakBalance: number;
  currentBalance: number;
  openPosition: Position | null;
}

export interface KellyResult {
  size: number;
  confidence: number;
  stopPercent: number;
}

export interface RiskCheck {
  pass: boolean;
  reason?: string;
}

export interface TrailingStopResult {
  triggered: boolean;
  metadata?: Record<string, unknown>;
}

export interface WinStats {
  winRate: number;
  winLossRatio: number;
}
