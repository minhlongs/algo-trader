import { COLORS } from '../../lib/stitch-design-tokens';

interface StitchStatCardProps {
  label: string;
  value: string;
  sub?: string;
  tone?: 'primary' | 'profit' | 'loss' | 'warning' | 'neutral';
}

const toneColor: Record<string, string> = {
  primary: COLORS.primary,
  profit: COLORS.profit,
  loss: COLORS.loss,
  warning: COLORS.warning,
  neutral: COLORS.onSurface,
};

export function StitchStatCard({ label, value, sub = '', tone = 'primary' }: StitchStatCardProps) {
  return (
    <div
      className="rounded-xl border p-5"
      style={{ backgroundColor: `${COLORS.surface}cc`, borderColor: COLORS.outline }}
    >
      <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: COLORS.onSurfaceVariant }}>
        {label}
      </div>
      <div className="mt-3 text-3xl font-bold font-mono" style={{ color: toneColor[tone] }}>
        {value}
      </div>
      {sub && <div className="mt-1 text-xs" style={{ color: COLORS.onSurfaceVariant }}>{sub}</div>}
    </div>
  );
}
