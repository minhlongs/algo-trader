import { type ReactNode } from 'react';
import { COLORS } from '../../lib/stitch-design-tokens';

export function StitchPageShell({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`min-h-full ${className}`}
      style={{ backgroundColor: COLORS.bg, color: COLORS.onSurface }}
    >
      {children}
    </div>
  );
}
