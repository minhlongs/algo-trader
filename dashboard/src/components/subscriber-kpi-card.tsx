/**
 * Subscriber KPI Card
 * Displays a single numeric KPI for the subscriber overview page.
 * Stitch dark fintech glass-card pattern.
 */

import { COLORS } from '../lib/stitch-design-tokens';

interface SubscriberKpiCardProps {
  label: string;
  value: string | number;
  subLabel?: string;
  accent?: 'default' | 'profit' | 'loss' | 'warning' | 'muted';
}

const ACCENT_COLOR: Record<string, string> = {
  default: COLORS.onSurface,
  profit: COLORS.profit,
  loss: COLORS.loss,
  warning: COLORS.warning,
  muted: COLORS.onSurfaceVariant,
};

export function SubscriberKpiCard({
  label,
  value,
  subLabel,
  accent = 'default',
}: SubscriberKpiCardProps) {
  return (
    <div
      className="rounded-2xl p-4 flex flex-col gap-1.5"
      style={{
        backgroundColor: 'rgba(18, 20, 20, 0.8)',
        backdropFilter: 'blur(20px)',
        border: `1px solid ${COLORS.outline}`,
      }}
    >
      <p
        className="text-[10px] uppercase tracking-widest font-mono"
        style={{ color: COLORS.onSurfaceVariant }}
      >
        {label}
      </p>
      <p className="text-2xl font-bold font-mono" style={{ color: ACCENT_COLOR[accent] }}>
        {value}
      </p>
      {subLabel && (
        <p className="text-xs font-mono" style={{ color: COLORS.onSurfaceVariant }}>
          {subLabel}
        </p>
      )}
    </div>
  );
}
