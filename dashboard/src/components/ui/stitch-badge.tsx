/**
 * StitchBadge — design-system badge component.
 * Supports both label+tone (Stitch API) and children+variant (standard API).
 */
import * as React from 'react';

interface StitchBadgeProps {
  children?: React.ReactNode;
  label?: string;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  tone?: string; // Stitch API compatibility
  className?: string;
}

export function StitchBadge({ children, label, variant = 'default', tone, className = '' }: StitchBadgeProps) {
  // Stitch tone → variant mapping
  const toneMap: Record<string, string> = {
    success: 'success',
    warning: 'warning',
    danger: 'danger',
    error: 'danger',
    info: 'info',
    pending: 'warning',
    approved: 'success',
    paid: 'success',
    void: 'default',
  };
  const resolvedVariant = tone ? (toneMap[tone] || 'default') : variant;

  const variants: Record<string, string> = {
    default: 'bg-white/10 text-white/80 border-white/15',
    success: 'bg-accent/10 text-accent border-accent/20',
    warning: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    danger: 'bg-loss/10 text-loss border-loss/20',
    info: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  };

  const display = label || children;

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${variants[resolvedVariant]} ${className}`}>
      {display}
    </span>
  );
}
