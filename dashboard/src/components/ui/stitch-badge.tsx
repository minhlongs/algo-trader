import { COLORS } from '../../lib/stitch-design-tokens';

interface StitchBadgeProps {
  label: string;
  tone?: 'primary' | 'profit' | 'loss' | 'warning' | 'neutral';
  className?: string;
}

const toneStyle: Record<string, { bg: string; color: string; border: string }> = {
  primary: { bg: `${COLORS.primary}1a`, color: COLORS.primary, border: `${COLORS.primary}4d` },
  profit: { bg: `${COLORS.profit}1a`, color: COLORS.profit, border: `${COLORS.profit}4d` },
  loss: { bg: `${COLORS.loss}1a`, color: COLORS.loss, border: `${COLORS.loss}4d` },
  warning: { bg: `${COLORS.warning}1a`, color: COLORS.warning, border: `${COLORS.warning}4d` },
  neutral: { bg: `${COLORS.surfaceHigh}66`, color: COLORS.onSurfaceVariant, border: `${COLORS.outline}66` },
};

export function StitchBadge({ label, tone = 'neutral', className = '' }: StitchBadgeProps) {
  const style = toneStyle[tone];

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${className}`}
      style={{ backgroundColor: style.bg, color: style.color, border: `1px solid ${style.border}` }}
    >
      {label}
    </span>
  );
}
