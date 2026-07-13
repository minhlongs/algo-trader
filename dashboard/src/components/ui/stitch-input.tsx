import { type CSSProperties, type InputHTMLAttributes } from 'react';
import { COLORS } from '../../lib/stitch-design-tokens';

interface StitchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  label?: string;
  value: string | number;
  onChange: (value: string) => void;
}

export function StitchInput({ label, value, onChange, placeholder = '', type = 'text', className = '', ...rest }: StitchInputProps) {
  return (
    <label className={`block text-sm font-mono ${className}`}>
      {label && <span className="mb-1 block text-xs" style={{ color: COLORS.onSurfaceVariant }}>{label}</span>}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border px-3 py-2 text-sm font-mono outline-none transition-colors focus:border-[${COLORS.primary}]/70"
        {...rest}
        style={{
          backgroundColor: `${COLORS.bg}55`,
          borderColor: COLORS.outline,
          color: COLORS.onSurface,
          ...((rest.style as CSSProperties | undefined) ?? {}),
        }}
      />
    </label>
  );
}
