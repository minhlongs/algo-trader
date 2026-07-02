/**
 * StitchCard — design-system card wrapper for Stitch design system compatibility.
 */
import * as React from 'react';
import { Card } from './card';
import type { CardProps } from './card';

export const StitchCard = Card;
export type StitchCardProps = CardProps;

export interface StitchCardAccentProps extends CardProps {
  accent?: 'gold' | 'purple' | 'none';
}

/** StitchCard with optional top-border accent */
export function StitchCardAccent({ accent = 'none', className = '', children, ...props }: StitchCardAccentProps) {
  const accentBorder = accent === 'gold'
    ? 'border-t-[#F59E0B]'
    : accent === 'purple'
      ? 'border-t-[#8B5CF6]'
      : '';
  return (
    <Card className={`border-t-2 ${accentBorder} ${className}`} {...props}>
      {children}
    </Card>
  );
}

/** Card header sub-component */
export function StitchCardHeader({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`pb-4 border-b border-white/10 mb-4 ${className}`}>{children}</div>;
}

/** Card body sub-component */
export function StitchCardBody({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={className}>{children}</div>;
}
