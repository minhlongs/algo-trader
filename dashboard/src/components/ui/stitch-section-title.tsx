import { type ReactNode } from 'react';
// @ts-ignore
import { COLORS } from '../../lib/stitch-design-tokens';

interface StitchSectionTitleProps {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  children?: ReactNode;
}

export function StitchSectionTitle({ title, eyebrow, action, children }: StitchSectionTitleProps) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        {eyebrow && <div className="mb-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: COLORS.primary }}>{eyebrow}</div>}
        <h2 className="text-xl font-semibold" style={{ color: COLORS.onSurface }}>{title}</h2>
        {children && <p className="mt-1 text-sm" style={{ color: COLORS.onSurfaceVariant }}>{children}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
