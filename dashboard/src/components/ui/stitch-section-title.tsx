/**
 * StitchSectionTitle — design-system section title component.
 * Supports eyebrow heading pattern for Stitch design system.
 */
import * as React from 'react';

interface StitchSectionTitleProps {
  children?: React.ReactNode;
  title?: string;
  subtitle?: string;
  eyebrow?: string;
  className?: string;
}

export function StitchSectionTitle({ children, title, subtitle, eyebrow, className = '' }: StitchSectionTitleProps) {
  // Support both: <StitchSectionTitle eyebrow="X" title="Y" /> and <StitchSectionTitle>Text</StitchSectionTitle>
  return (
    <div className={`mb-6 ${className}`}>
      {eyebrow && <p className="text-xs font-semibold uppercase tracking-widest text-accent mb-2">{eyebrow}</p>}
      <h2 className="text-xl font-semibold text-white">{title || children}</h2>
      {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}
    </div>
  );
}
