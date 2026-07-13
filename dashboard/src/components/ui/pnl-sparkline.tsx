// @ts-ignore
import { COLORS } from '../../lib/stitch-design-tokens';

/**
 * PnlSparkline — Mini chart showing recent P&L trajectory with risk zone markers
 * SVG polyline with gradient fill below line
 */

interface PnlSparklineProps {
  values: number[]; // array of P&L values (most recent last)
  width?: number;
  height?: number;
  maxLossPerTrade?: number; // threshold line for risk zone
  showCurrent?: boolean;
}

export function PnlSparkline({
  values,
  width = 200,
  height = 60,
  maxLossPerTrade,
  showCurrent = true,
}: PnlSparklineProps) {
  if (values.length === 0) {
    return (
      <div className="flex items-center justify-center text-xs" style={{ color: COLORS.onSurfaceVariant }}>
        No data
      </div>
    );
  }

  const padding = 4;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  // Find min and max for scaling
  const min = Math.min(...values, maxLossPerTrade ?? 0);
  const max = Math.max(...values);
  const range = max - min || 1;

  // Scale point to SVG coordinates
  const getPoint = (index: number, value: number) => {
    const x = padding + (index / (values.length - 1)) * chartWidth;
    const y = padding + chartHeight - ((value - min) / range) * chartHeight;
    return { x, y };
  };

  // Build polyline points
  const points = values.map((v, i) => getPoint(i, v)).map(p => `${p.x},${p.y}`).join(' ');

  // Gradient fill polygon (close to bottom)
  const fillPoints = `${padding},${height - padding} ${points} ${width - padding},${height - padding}`;

  // Determine color of line based on latest value
  const lastValue = values[values.length - 1];
  const lineColor = lastValue >= 0 ? COLORS.profit : COLORS.loss;

  // Threshold line if provided
  const thresholdY = maxLossPerTrade !== undefined ? padding + chartHeight - ((maxLossPerTrade - min) / range) * chartHeight : null;

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {/* Gradient fill definition */}
      <defs>
        <linearGradient id="pnlSparklineGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity={0.4} />
          <stop offset="100%" stopColor={lineColor} stopOpacity={0.05} />
        </linearGradient>
      </defs>
      {/* Fill area */}
      <polygon points={fillPoints} fill="url(#pnlSparklineGradient)" />
      {/* Line */}
      <polyline points={points} fill="none" stroke={lineColor} strokeWidth={2} strokeLinejoin="round" />
      {/* Threshold line */}
      {thresholdY !== null && (
        <>
          <line
            x1={padding}
            y1={thresholdY}
            x2={width - padding}
            y2={thresholdY}
            stroke={COLORS.warning}
            strokeWidth={1}
            strokeDasharray="2 2"
          />
        </>
      )}
      {/* Current point */}
      {showCurrent && (
        <circle cx={width - padding} cy={getPoint(values.length - 1, lastValue).y} r={3} fill={lineColor} />
      )}
    </svg>
  );
}
