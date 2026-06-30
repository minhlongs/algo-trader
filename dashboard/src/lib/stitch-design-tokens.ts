/**
 * Stitch design tokens — CSS variable references for the Stitch design system.
 */

export const tokens = {
  colors: {
    background: 'var(--color-background, #080B14)',
    surface: 'var(--color-surface, #111627)',
    accent: 'var(--color-accent, #00C8E8)',
    loss: 'var(--color-loss, #FF4466)',
    muted: 'var(--color-muted, #8892B0)',
    border: 'var(--color-border, #1E2640)',
    text: 'var(--color-text, #FFFFFF)',
  },
  spacing: {
    xs: 'var(--spacing-xs, 4px)',
    sm: 'var(--spacing-sm, 8px)',
    md: 'var(--spacing-md, 16px)',
    lg: 'var(--spacing-lg, 24px)',
    xl: 'var(--spacing-xl, 32px)',
  },
  radius: {
    sm: 'var(--radius-sm, 4px)',
    md: 'var(--radius-md, 8px)',
    lg: 'var(--radius-lg, 12px)',
    full: 'var(--radius-full, 9999px)',
  },
} as const;

export const COLORS = {
  bg: tokens.colors.background,
  surface: tokens.colors.surface,
  onSurface: tokens.colors.text,
  onSurfaceVariant: tokens.colors.muted,
  accent: tokens.colors.accent,
  loss: tokens.colors.loss,
  profit: '#00E676',
  muted: tokens.colors.muted,
  border: tokens.colors.border,
  outline: tokens.colors.border,
  text: tokens.colors.text,
  gold: '#FFB800',
  primary: tokens.colors.accent,
  onPrimary: '#080B14',
  white: '#FFFFFF',
  black: '#000000',
} as const;
