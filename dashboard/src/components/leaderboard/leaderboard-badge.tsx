/**
 * LeaderboardBadge
 *
 * Performance badge for strategy leaderboard entries.
 * Types: Top Performer (win rate > 70%), Rising Star (improved 10%+),
 * Verified (100+ trades), New (less than 30 trades).
 */
import type { LeaderboardEntry } from '../../types/api';

interface LeaderboardBadgeProps {
  badge: NonNullable<LeaderboardEntry['badge']>;
}

const BADGE_CONFIG: Record<
  NonNullable<LeaderboardEntry['badge']>,
  { label: string; icon: string; className: string }
> = {
  top_performer: {
    label: 'Top Performer',
    icon: '🏆',
    className: 'bg-gold/10 text-gold border border-gold/30',
  },
  rising_star: {
    label: 'Rising Star',
    icon: '📈',
    className: 'bg-accent/10 text-accent border border-accent/30',
  },
  verified: {
    label: 'Verified',
    icon: '✅',
    className: 'bg-profit/10 text-profit border border-profit/30',
  },
  new: {
    label: 'New',
    icon: '🆕',
    className: 'bg-muted/10 text-muted border border-muted/30',
  },
};

export function LeaderboardBadge({ badge }: LeaderboardBadgeProps) {
  const config = BADGE_CONFIG[badge];
  if (!config) return null;

  return (
    <span
      className={`
        inline-flex items-center gap-1 px-2 py-0.5 rounded-full
        text-[10px] font-semibold whitespace-nowrap
        ${config.className}
      `}
    >
      <span className="text-[11px]" aria-hidden="true">{config.icon}</span>
      {config.label}
    </span>
  );
}
