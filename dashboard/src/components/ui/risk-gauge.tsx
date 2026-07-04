/**
 * RiskGauge — Semi-circle gauge showing current risk level vs threshold
 * Uses SVG with gradient arc and needle indicator
 */
import { COLORS } from '../../lib/stitch-design-tokens';

interface RiskGaugeProps {
  value: number; // 0-1
  threshold: number; // 0-1
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

const SIZE_MAP = {
  sm: { width: 120, height: 60, radius: 50, strokeWidth: 8 },
  md: { width: 180, height: 90, radius: 75, strokeWidth: 12 },
  lg: { width: 240, height: 120, radius: 100, strokeWidth: 16 },
};

export function RiskGauge({ value, threshold, size = 'md', label }: RiskGaugeProps) {
  const { width, height, radius, strokeWidth } = SIZE_MAP[size];
  const centerX = width / 2;
  const centerY = height; // bottom of semi-circle
  const startAngle = 180; // degrees (left)
  const endAngle = 0; // degrees (right)
  const angleRange = endAngle - startAngle; // -180

  // Convert value to angle
  const valueAngle = startAngle + value * angleRange;
  const thresholdAngle = startAngle + threshold * angleRange;

  // Convert angles to coordinates
  const polarToCartesian = (cx: number, cy: number, r: number, angleDeg: number) => {
    const angleRad = ((angleDeg - 180) * Math.PI) / 180; // adjust so 0 is at right
    return {
      x: cx + r * Math.cos(angleRad),
      y: cy + r * Math.sin(angleRad),
    };
  };

  // Arc path command
  const describeArc = (cx: number, cy: number, r: number, startDeg: number, endDeg: number) => {
    const start = polarToCartesian(cx, cy, r, endDeg);
    const end = polarToCartesian(cx, cy, r, startDeg);
    const largeArc = endDeg - startDeg <= 180 ? 0 : 1;
    return [
      'M', start.x, start.y,
      'A', r, r, 0, largeArc, 0, end.x, end.y,
    ].join(' ');
  };

  const backgroundArc = describeArc(centerX, centerY, radius, startAngle, endAngle);
  const valueArc = describeArc(centerX, centerY, radius, startAngle, valueAngle);
  const thresholdX = polarToCartesian(centerX, centerY, radius, thresholdAngle).x;

  // Needle tip
  const needleTip = polarToCartesian(centerX, centerY, radius - strokeWidth, valueAngle);

  // Determine color based on value
  const getColor = (v: number) => {
    if (v < 0.3) return COLORS.profit; // green
    if (v < 0.7) return COLORS.warning; // yellow
    return COLORS.loss; // red
  };
  const valueColor = getColor(value);

  return (
    <div className="flex flex-col items-center" style={{ color: COLORS.onSurface }}>
      {label && <span className="text-xs font-bold mb-2" style={{ color: COLORS.onSurfaceVariant }}>{label}</span>}
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* Background arc */}
        <path
          d={backgroundArc}
          fill="none"
          stroke={`${COLORS.outline}66`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Value arc */}
        <path
          d={valueArc}
          fill="none"
          stroke={valueColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Threshold marker */}
        <line
          x1={thresholdX}
          y1={centerY - radius + strokeWidth / 2}
          x2={thresholdX}
          y2={centerY - radius - strokeWidth / 2}
          stroke={COLORS.warning}
          strokeWidth={2}
        />
        {/* Needle */}
        <line
          x1={centerX}
          y1={centerY}
          x2={needleTip.x}
          y2={needleTip.y}
          stroke={COLORS.onSurface}
          strokeWidth={2}
        />
        {/* Center pivot */}
        <circle cx={centerX} cy={centerY} r={4} fill={COLORS.primary} />
      </svg>
      <div className="mt-2 text-sm font-mono" style={{ color: valueColor }}>
        {Math.round(value * 100)}%
      </div>
    </div>
  );
}
