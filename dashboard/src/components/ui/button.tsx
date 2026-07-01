import * as React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', size = 'md', children, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 focus:outline-none disabled:opacity-50 disabled:pointer-events-none min-h-touch min-w-touch';
    
    const variants = {
      primary: 'bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 hover:border-accent/40 active:scale-98 shadow-[0_0_15px_rgba(0,255,163,0.05)] hover:shadow-[0_0_20px_rgba(0,255,163,0.15)]',
      secondary: 'bg-white/5 text-white/90 border border-white/10 hover:bg-white/10 active:scale-98',
      danger: 'bg-loss/10 text-loss border border-loss/20 hover:bg-loss/20 hover:border-loss/40 active:scale-98 shadow-[0_0_15px_rgba(255,46,147,0.05)] hover:shadow-[0_0_20px_rgba(255,46,147,0.15)]',
      ghost: 'text-muted hover:text-white hover:bg-white/5 active:scale-98',
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-xs',
      md: 'px-4 py-2 text-sm',
      lg: 'px-6 py-3 text-base',
    };

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
