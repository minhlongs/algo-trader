/**
 * Risk-Managed Kelly Lifecycle Helpers
 * Position building, trailing-stop close execution, signal construction, and status formatting.
 */

import type { ICandle, ISignal } from '../../interfaces/IStrategy';
import type { Position, RiskMetrics } from './risk-managed-kelly-helpers';
import {
  calculateDrawdown,
  calculateSma,
  closePositionResult,
  updateWinStats,
} from './risk-managed-kelly-helpers';

export function createKellyPosition(
  currentPrice: number,
  currentTime: number,
  kellyPosition: { size: number; confidence: number; stopPercent: number },
  side: 'long' | 'short',
): Position {
  return {
    entryPrice: currentPrice,
    size: kellyPosition.size,
    stopLoss: currentPrice * (1 - kellyPosition.stopPercent),
    takeProfit: currentPrice * (1 + kellyPosition.stopPercent * 2),
    side,
    timestamp: currentTime,
  };
}

export function createKellySignal(
  side: 'long' | 'short',
  confidence: number,
  position: Position,
  kellyFraction: number,
  winRate: number,
): ISignal {
  const crossoverLabel = side === 'long' ? 'bullish' : 'bearish';
  return {
    action: side === 'long' ? 'buy' : 'sell',
    confidence,
    reason: `SMA ${crossoverLabel} crossover + Kelly sizing`,
    metadata: {
      size: position.size,
      stopLoss: position.stopLoss,
      takeProfit: position.takeProfit,
      kellyFraction,
      confidence: winRate,
    },
  };
}

export function checkSmaCrossover(priceHistory: ICandle[]): 'long' | 'short' | null {
  if (priceHistory.length < 30) return null;
  const closes = priceHistory.map((c) => c.close);
  const sma10 = calculateSma(closes, 10);
  const sma30 = calculateSma(closes, 30);
  const prevSma10 = calculateSma(closes.slice(0, -1), 10);
  const prevSma30 = calculateSma(closes.slice(0, -1), 30);

  if (prevSma10 <= prevSma30 && sma10 > sma30) return 'long';
  if (prevSma10 >= prevSma30 && sma10 < sma30) return 'short';
  return null;
}

export function executeKellyClose(
  position: Position,
  exitPrice: number,
  riskMetrics: RiskMetrics,
  recentTrades: Array<{ pnl: number; timestamp: number }>,
): {
  updatedMetrics: RiskMetrics;
  updatedTrades: Array<{ pnl: number; timestamp: number }>;
  winRate: number;
  winLossRatio: number;
  pnl: number;
} {
  const { updatedMetrics, updatedTrades, pnl } = closePositionResult(
    position,
    exitPrice,
    riskMetrics,
    recentTrades,
  );
  const { winRate, winLossRatio } = updateWinStats(updatedTrades);
  return { updatedMetrics, updatedTrades, winRate, winLossRatio, pnl };
}

export function formatKellyStatus(
  strategyName: string,
  priceHistory: ICandle[],
  riskMetrics: RiskMetrics,
  winRate: number,
  winLossRatio: number,
): Record<string, unknown> {
  const closes = priceHistory.map((c) => c.close);
  return {
    name: strategyName,
    candles: priceHistory.length,
    balance: riskMetrics.currentBalance,
    dailyPnL: riskMetrics.dailyPnL,
    drawdown: calculateDrawdown(riskMetrics.peakBalance, riskMetrics.currentBalance),
    peakBalance: riskMetrics.peakBalance,
    openPosition: riskMetrics.openPosition,
    sma10: calculateSma(closes, 10),
    sma30: calculateSma(closes, 30),
    winRate,
    winLossRatio,
  };
}
