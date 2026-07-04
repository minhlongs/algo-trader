/**
 * ConfidenceScore — Visual indicator of confidence level for trade suggestions
 */
import { COLORS } from '../../lib/stitch-design-tokens';

interface ConfidenceScoreProps {
  score: number; // 0-1
  label?: string;
  size?: 'small' | 'medium';
}

export function ConfidenceScore({ score, label, size = 'medium' }: ConfidenceScoreProps) {
  const percentage = Math.round(score * 100);
  const getColor = (s: number) => {
    if (s >= 0.7) return COLORS.profit;
    if (s >= 0.4) return COLORS.warning;
    return COLORS.loss;
  };
  const color = getColor(score);
  const barWidth = size === 'small' ? 'w-16' : 'w-24';
  const textSize = size === 'small' ? 'text-xs' : 'text-sm';

  return (
    <div className="flex flex-col gap-1">
      {label && <span className="text-[10px] font-bold" style={{ color: COLORS.onSurfaceVariant }}>{label}</span>}
      <div className="flex items-center gap-2">
        <div className={`h-2 rounded-full overflow-hidden ${barWidth}`} style={{ backgroundColor: `${COLORS.surfaceHigh}66` }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${percentage}%`, backgroundColor: color }}
          />
        </div>
        <span className={`font-mono ${textSize}`} style={{ color }}>
          {percentage}%
        </span>
      </div>
    </div>
  );
}
