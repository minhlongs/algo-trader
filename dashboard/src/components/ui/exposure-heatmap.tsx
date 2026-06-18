/**
 * ExposureHeatmap — Grid visualization of market exposure by asset
 * Color intensity based on absolute exposure, sign indicated by border
 */
import { useState } from 'react';
import { COLORS } from '../../lib/stitch-design-tokens';

interface ExposureHeatmapProps {
  data: Array<{
    marketId: string;
    marketName: string;
    exposure: number; // positive = long, negative = short
    notional: number; // USD
  }>;
  maxExposure?: number; // for color scaling; if not provided, uses max absolute value in data
}

export function ExposureHeatmap({ data, maxExposure: propMaxExposure }: ExposureHeatmapProps) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; data: typeof data[0] } | null>(null);

  if (data.length === 0) {
    return (
      <div className="p-4 text-center" style={{ color: COLORS.onSurfaceVariant }}>
        No exposure data
      </div>
    );
  }

  const maxExp = propMaxExposure ?? Math.max(...data.map(d => Math.abs(d.exposure)));

  const getColorIntensity = (absExp: number) => {
    const intensity = maxExp > 0 ? absExp / maxExp : 0;
    // Interpolate between surfaceHigh (low) and primary (high)
    // Use opacity for intensity: 0.2 to 0.9
    const opacity = 0.2 + intensity * 0.7;
    return `${COLORS.primary}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`;
  };

  const getBorderColor = (exp: number) => {
    return exp >= 0 ? COLORS.profit : COLORS.loss; // green for long, red for short
  };

  return (
    <div className="relative">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {data.map((item) => {
          const absExp = Math.abs(item.exposure);
          const bgColor = getColorIntensity(absExp);
          const borderColor = getBorderColor(item.exposure);
          return (
            <div
              key={item.marketId}
              className="relative p-2 rounded border"
              style={{
                backgroundColor: bgColor,
                borderColor: borderColor,
                borderWidth: 2,
              }}
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setTooltip({
                  x: rect.left + rect.width / 2,
                  y: rect.top - 8,
                  data: item,
                });
              }}
              onMouseLeave={() => setTooltip(null)}
            >
              <div className="text-xs font-bold truncate" style={{ color: COLORS.onSurface }}>
                {item.marketName}
              </div>
              <div className="text-[10px] mt-1" style={{ color: COLORS.onSurfaceVariant }}>
                ${item.notional.toLocaleString()}
              </div>
              <div className="text-xs font-mono mt-1" style={{ color: borderColor }}>
                {item.exposure >= 0 ? '+' : ''}{item.exposure.toFixed(2)}
              </div>
            </div>
          );
        })}
      </div>

      {tooltip && (
        <div
          className="fixed z-50 px-3 py-2 rounded text-xs pointer-events-none border"
          style={{
            backgroundColor: `${COLORS.surfaceHigh}ee`,
            borderColor: COLORS.outline,
            color: COLORS.onSurface,
            transform: 'translate(-50%, -100%)',
            left: tooltip.x,
            top: tooltip.y,
          }}
        >
          <div className="font-bold">{tooltip.data.marketName}</div>
          <div>Exposure: {tooltip.data.exposure >= 0 ? '+' : ''}{tooltip.data.exposure.toFixed(2)}</div>
          <div>Notional: ${tooltip.data.notional.toLocaleString()}</div>
          <div>Intensity: {(Math.abs(tooltip.data.exposure) / maxExp * 100).toFixed(0)}%</div>
        </div>
      )}
    </div>
  );
}
