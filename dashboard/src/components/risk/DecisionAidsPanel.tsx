/**
 * DecisionAidsPanel — Trade decision support tools
 */
import { useMemo } from 'react';
import { useTradingStore } from '../../stores/trading-store';
import { WhatIfCalculator } from './WhatIfCalculator';
import { ConfidenceScore } from './ConfidenceScore';
import { StitchCard, StitchCardBody } from '../ui/stitch-card';
import { COLORS } from '../../lib/stitch-design-tokens';

export function DecisionAidsPanel() {
  const trades = useTradingStore((state) => state.trades);

  // Calculate confidence based on recent trade win rate (last 20 trades)
  const confidence = useMemo(() => {
    if (trades.length === 0) return 0.5; // neutral if no history
    const recentTrades = trades.slice(0, 20);
    const wins = recentTrades.filter((t) => t.pnl > 0).length;
    return wins / recentTrades.length;
  }, [trades]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* What-If Calculator */}
      <WhatIfCalculator />

      {/* System Confidence */}
      <StitchCard className="overflow-hidden">
        <StitchCardBody>
          <div className="space-y-4">
            <h3 className="text-sm font-bold" style={{ color: COLORS.onSurface }}>System Confidence</h3>
            <ConfidenceScore score={confidence} label="Signal Accuracy" size="medium" />

            <div className="p-3 rounded" style={{ backgroundColor: `${COLORS.surfaceHigh}33` }}>
              <div className="text-xs mb-2" style={{ color: COLORS.onSurfaceVariant }}>Based on last 20 trades</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="opacity-70 mb-1" style={{ color: COLORS.onSurfaceVariant }}>Total</div>
                  <div className="text-sm font-mono" style={{ color: COLORS.onSurface }}>{Math.min(trades.length, 20)}</div>
                </div>
                <div>
                  <div className="opacity-70 mb-1" style={{ color: COLORS.onSurfaceVariant }}>Win Rate</div>
                  <div className="text-sm font-mono" style={{ color: COLORS.onSurface }}>
                    {trades.length > 0 ? `${Math.round(confidence * 100)}%` : 'N/A'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </StitchCardBody>
      </StitchCard>
    </div>
  );
}
