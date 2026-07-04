import { type ReactNode, cloneElement, isValidElement } from 'react';
import { COLORS } from '../../lib/stitch-design-tokens';

interface StitchButtonProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
  className?: string;
  type?: 'button' | 'submit';
  asChild?: boolean;
  title?: string;
  style?: React.CSSProperties;
}

interface ChildStyleProps {
  className?: string;
  style?: React.CSSProperties;
  onClick?: (event: React.MouseEvent) => void;
  title?: string;
}

export function StitchButton({
  children,
  onClick,
  disabled = false,
  variant = 'primary',
  className = '',
  type = 'button',
  asChild = false,
  title,
  style: customStyle,
}: StitchButtonProps) {
  const base = 'font-bold text-sm px-4 py-2 rounded-lg transition-all active:scale-[0.98] disabled:opacity-50';
  const styles: Record<string, React.CSSProperties> = {
    primary: { backgroundColor: COLORS.primary, color: COLORS.onPrimary },
    secondary: { backgroundColor: `${COLORS.primary}1a`, color: COLORS.primary, border: `1px solid ${COLORS.primary}4d` },
    ghost: { backgroundColor: 'transparent', color: COLORS.onSurfaceVariant },
  };

  const mergedStyle = { ...styles[variant], ...customStyle };

  if (asChild && isValidElement<ChildStyleProps>(children)) {
    return cloneElement(children, {
      className: `${base} ${className} ${children.props.className ?? ''}`.trim(),
      style: { ...(children.props.style as React.CSSProperties | undefined), ...mergedStyle },
      onClick: onClick ?? (children.props as ChildStyleProps).onClick,
      title,
    });
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${className}`}
      style={mergedStyle}
      title={title}
    >
      {children}
    </button>
  );
}
