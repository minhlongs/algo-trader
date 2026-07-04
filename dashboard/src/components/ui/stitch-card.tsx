import { type ReactNode } from 'react';
import { COLORS } from '../../lib/stitch-design-tokens';

interface StitchCardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function StitchCard({ children, className = '', onClick }: StitchCardProps) {
  return (
    <div
      onClick={onClick}
      className={[
        'rounded-xl border overflow-hidden',
        onClick ? 'cursor-pointer transition-all hover:border-[#4cd7f6]/30' : '',
        className,
      ].join(' ')}
      style={{
        backgroundColor: COLORS.surface,
        borderColor: COLORS.outline,
      }}
    >
      {children}
    </div>
  );
}

export function StitchCardHeader({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`px-6 py-4 border-b flex items-center justify-between ${className}`}
      style={{ borderColor: COLORS.outline, backgroundColor: `${COLORS.bg}33` }}
    >
      {children}
    </div>
  );
}

export function StitchCardBody({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`p-6 ${className}`}>{children}</div>;
}
