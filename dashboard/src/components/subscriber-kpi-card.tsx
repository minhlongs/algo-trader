/**
 * Subscriber KPI Card
 * Displays a single numeric KPI for the subscriber overview page.
 * Reusable for fills count, win rate, blocked-DLP count, etc.
 */

interface SubscriberKpiCardProps {
  label: string;
  value: string | number;
  subLabel?: string;
  accent?: 'default' | 'profit' | 'loss' | 'warning' | 'muted';
}

const ACCENT_CLASS: Record<NonNullable<SubscriberKpiCardProps['accent']>, string> = {
  default: 'text-white',
  profit: 'text-profit',
  loss: 'text-loss',
  warning: 'text-warning',
  muted: 'text-muted',
};

export function SubscriberKpiCard({
  label,
  value,
  subLabel,
  accent = 'default',
}: SubscriberKpiCardProps) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4 flex flex-col gap-1">
      <p className="text-muted text-[10px] uppercase tracking-widest font-mono">{label}</p>
      <p className={`text-2xl font-bold font-mono ${ACCENT_CLASS[accent]}`}>{value}</p>
      {subLabel && (
        <p className="text-muted text-xs font-mono">{subLabel}</p>
      )}
    </div>
  );
}
