import * as React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverGlow?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className = '', hoverGlow = true, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`glass-card rounded-xl p-6 ${hoverGlow ? 'glass-card-glow' : ''} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';
