/**
 * Marketplace Badge Component
 *
 * Displays a badge icon on strategy listing cards with a tooltip
 * explaining the badge criteria on hover.
 *
 * Endpoint:
 *   GET /api/v1/marketplace/listings/:id/badges
 *
 * Usage:
 *   <MarketplaceBadge listingId="abc-123" />
 *   <MarketplaceBadge badge={{ type: 'verified_creator', label: 'Verified', description: '...' }} />
 */
import { useState, useEffect, useRef } from 'react';
import { useApiClient } from '../hooks/use-api-client';

/* ─── Types ──────────────────────────────────────── */

export type BadgeType =
  | 'verified_creator'
  | 'top_performer'
  | 'high_volume'
  | 'low_risk'
  | 'new_listing'
  | 'community_favorite';

export interface BadgeData {
  type: BadgeType;
  label: string;
  description: string;
}

interface MarketplaceBadgeProps {
  /** Listing ID to fetch badges for */
  listingId?: string;
  /** Optional direct badge data (skip fetch) */
  badge?: BadgeData;
}

/* ─── Badge visual config ────────────────────────── */

const BADGE_STYLES: Record<BadgeType, { color: string; icon: string }> = {
  verified_creator: {
    color: 'text-profit border-profit/40 bg-profit/10',
    icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  },
  top_performer: {
    color: 'text-accent border-accent/40 bg-accent/10',
    icon: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z',
  },
  high_volume: {
    color: 'text-accent border-accent/40 bg-accent/10',
    icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
  },
  low_risk: {
    color: 'text-profit border-profit/40 bg-profit/10',
    icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  },
  new_listing: {
    color: 'text-accent border-accent/40 bg-accent/10',
    icon: 'M12 6v6m0 0v6m0-6h6m-6 0H6',
  },
  community_favorite: {
    color: 'text-accent border-accent/40 bg-accent/10',
    icon: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
  },
};

/* ─── Tooltip ─────────────────────────────────────── */

function Tooltip({ children, text }: { children: React.ReactNode; text: string }) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function show() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setVisible(true), 300);
  }

  function hide() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setVisible(false);
  }

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <span className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {visible && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 rounded bg-bg-surface border border-bg-border text-muted text-[10px] leading-relaxed whitespace-nowrap z-50 shadow-xl pointer-events-none max-w-[200px] text-center">
          {text}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-bg-border" />
        </span>
      )}
    </span>
  );
}

/* ─── Loading skeleton ────────────────────────────── */

function BadgeSkeleton() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border border-bg-border bg-bg-surface/50 animate-pulse">
      <span className="w-3 h-3 rounded-full bg-bg-border" />
      <span className="w-10 h-2.5 rounded bg-bg-border" />
    </span>
  );
}

/* ─── Badge Component ─────────────────────────────── */

export function MarketplaceBadge({ listingId, badge: directBadge }: MarketplaceBadgeProps) {
  const { fetchApi } = useApiClient();
  const [badge, setBadge] = useState<BadgeData | null>(directBadge ?? null);
  const [loading, setLoading] = useState(!directBadge && !!listingId);

  /* Fetch badge data if listingId is provided and no direct badge given */
  useEffect(() => {
    if (directBadge) {
      setBadge(directBadge);
      setLoading(false);
      return;
    }
    if (!listingId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchApi<BadgeData | BadgeData[]>(`/v1/marketplace/listings/${listingId}/badges`)
      .then((data) => {
        if (cancelled) return;
        if (data) {
          // Handle both single object and array responses
          const badgeData = Array.isArray(data) ? data[0] : data;
          setBadge(badgeData ?? null);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [listingId, directBadge, fetchApi]);

  /* Loading state */
  if (loading) return <BadgeSkeleton />;

  /* No badge */
  if (!badge) return null;

  const style = BADGE_STYLES[badge.type] ?? BADGE_STYLES.verified_creator;

  return (
    <Tooltip text={badge.description}>
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border cursor-default transition-colors ${style.color}`}>
        {/* Badge icon */}
        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" className="flex-shrink-0">
          <path d={style.icon} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {badge.label}
      </span>
    </Tooltip>
  );
}

export default MarketplaceBadge;
