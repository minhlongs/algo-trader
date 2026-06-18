/**
 * WhatIfCalculator — Estimate potential outcomes for a trade based on risk settings
 */
import { useState } from 'react';
import { useRiskPreferencesStore } from '../../stores/risk-preferences-store';
import { StitchInput, StitchCard, StitchCardBody } from '../ui/stitch-components';
import { COLORS } from '../../lib/stitch-design-tokens';

export function WhatIfCalculator() {
  const preferences = useRiskPreferencesStore();
  const [positionSize, setPositionSize] = useState('');

  const profitPercent = preferences.profitTargetPercent;
  const lossPercent = preferences.stopLossPercent;

  const positionSizeNum = parseFloat(positionSize) || 0;

  const potentialProfit = positionSizeNum * profitPercent;
  const potentialLoss = positionSizeNum * lossPercent;
  const riskReward = potentialLoss > 0 ? potentialProfit / potentialLoss : 0;

  const formatCurrency = (value: number) => {
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <StitchCard className="overflow-hidden">
      <StitchCardBody>
        <div className="space-y-4">
          <h3 className="text-sm font-bold" style={{ color: COLORS.onSurface }}>What-If Calculator</h3>

          <StitchInput
            label="Position Size (USD)"
            value={positionSize}
            onChange={setPositionSize}
            type="number"
            min="0"
            step="100"
            placeholder="e.g., 1000"
          />

          {positionSize === '' ? (
            <div className="text-xs text-center" style={{ color: COLORS.onSurfaceVariant }}>
              Enter a position size to see estimated outcomes
            </div>
          ) : (
            <div className="space-y-3 p-3 rounded" style={{ backgroundColor: `${COLORS.surfaceHigh}33` }}>
              <div className="flex justify-between items-center">
                <span className="text-xs" style={{ color: COLORS.onSurfaceVariant }}>Potential Profit</span>
                <span className="text-sm font-mono" style={{ color: COLORS.profit }}>{formatCurrency(potentialProfit)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs" style={{ color: COLORS.onSurfaceVariant }}>Potential Loss</span>
                <span className="text-sm font-mono" style={{ color: COLORS.loss }}>{formatCurrency(potentialLoss)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs" style={{ color: COLORS.onSurfaceVariant }}>Risk/Reward Ratio</span>
                <span className="text-sm font-mono" style={{ color: riskReward >= 1 ? COLORS.profit : COLORS.warning }}>
                  {riskReward.toFixed(2)}
                </span>
              </div>
              <div className="text-[10px] text-center" style={{ color: COLORS.onSurfaceVariant }}>
                Based on profit target {(profitPercent*100).toFixed(1)}% / stop loss {(lossPercent*100).toFixed(1)}%
              </div>
            </div>
          )}
        </div>
      </StitchCardBody>
    </StitchCard>
  );
}
