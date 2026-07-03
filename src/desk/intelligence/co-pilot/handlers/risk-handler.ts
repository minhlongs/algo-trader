/**
 * Risk Handler
 * Gathers risk assessment data from KellyPositionSizer, DrawdownMonitor,
 * CircuitBreaker, and PositionManager.
 */

import type { CopilotResponse } from '../response-formatter';
import { KellyPositionSizer } from '../../../risk/kelly-position-sizer';
import { DrawdownMonitor } from '../../../risk/drawdown-monitor';
import { CircuitBreaker } from '../../../risk/circuit-breaker';
import { PositionManager } from '../../../risk/position-manager';

export interface RiskData {
  riskScore: number;
  drawdown: number;
  maxDrawdown: number;
  circuitState: string;
  positionsCount: number;
  largestPosition: string;
  warnings: string[];
}

/**
 * Handle a risk assessment query.
 * Accepts optional injected dependencies for testing; creates real instances by default.
 */
export async function handleRiskQuery(
  context?: { page?: string; strategyId?: string },
  deps?: {
    kellySizer?: KellyPositionSizer;
    drawdownMonitor?: DrawdownMonitor;
    circuitBreaker?: CircuitBreaker;
    positionManager?: PositionManager;
  },
): Promise<CopilotResponse> {
  const _kellySizer = deps?.kellySizer ?? new KellyPositionSizer();
  const drawdownMonitor = deps?.drawdownMonitor ?? new DrawdownMonitor();
  const circuitBreaker = deps?.circuitBreaker ?? new CircuitBreaker();
  const positionManager = deps?.positionManager ?? new PositionManager();

  const [metrics, circuitStatus, positions, _exposure] = await Promise.all([
    drawdownMonitor.getMetrics(),
    circuitBreaker.getStatus(),
    positionManager.getAllPositions(),
    context?.strategyId
      ? positionManager.getExposureSummary()
      : Promise.resolve(null),
  ]);

  // Compute a simple risk score 0-10 based on drawdown
  const drawdownPct = metrics ? metrics.currentDrawdown * 100 : 0;
  const riskScore = Math.min(10, Math.round((drawdownPct / 15) * 10));

  // Sort positions by size for largest position string
  const sorted = [...positions].sort((a, b) => b.currentValue - a.currentValue);
  const largestPos = sorted.length > 0
    ? `${sorted[0].symbol}/${sorted[0].exchange} at ${((sorted[0].currentValue / (metrics?.currentValue || 1)) * 100).toFixed(1)}%`
    : 'none';

  // Determine warnings
  const warnings: string[] = [];
  if (metrics?.isHalted) {
    warnings.push('Trading is halted due to drawdown breach');
  }
  if (circuitStatus.state !== 'CLOSED') {
    warnings.push(`Circuit breaker is ${circuitStatus.state}${circuitStatus.reason ? `: ${circuitStatus.reason}` : ''}`);
  }
  if (metrics && metrics.consecutiveLosses >= 3) {
    warnings.push(`${metrics.consecutiveLosses} consecutive losses detected`);
  }

  const answer = [
    '**Risk Assessment**',
    `- Risk score: ${riskScore}/10 (${riskScore <= 3 ? 'low' : riskScore <= 6 ? 'moderate' : 'high'})`,
    `- Drawdown: ${drawdownPct.toFixed(2)}%${metrics?.maxDrawdown ? ` (max: ${(metrics.maxDrawdown * 100).toFixed(2)}%)` : ''}`,
    `- Circuit breaker: ${circuitStatus.state}`,
    `- Positions: ${positions.length} open`,
    `- Largest position: ${largestPos}`,
    ...(warnings.length > 0 ? ['', '**Warnings:**', ...warnings.map(w => `- ${w}`)] : []),
  ].join('\n');

  return {
    answer,
    actions: [
      { label: 'View Positions', action: 'navigate', payload: '/positions' },
      { label: 'Adjust Risk', action: 'execute', payload: 'risk_settings' },
    ],
    sourceData: {
      riskScore,
      drawdown: drawdownPct,
      circuitState: circuitStatus.state,
      warnings,
    },
  };
}
