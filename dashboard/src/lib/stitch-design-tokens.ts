/**
 * Stitch design tokens — CSS variable references for the Stitch design system.
 */

export const tokens = {
  colors: {
    background: 'var(--color-background, #060912)',
    surface: 'var(--color-surface, rgba(255,255,255,0.05))',
    accent: 'var(--color-accent, #00FFA3)',
    loss: 'var(--color-loss, #FF2E93)',
    muted: 'var(--color-muted, rgba(255,255,255,0.5))',
    border: 'var(--color-border, rgba(255,255,255,0.1))',
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

/** Color tokens for direct import (Stitch API) */
export const COLORS = {
  bg: tokens.colors.background,
  surface: tokens.colors.surface,
  onSurface: tokens.colors.text,
  onSurfaceVariant: tokens.colors.muted,
  accent: tokens.colors.accent,
  loss: tokens.colors.loss,
  profit: tokens.colors.accent,
  muted: tokens.colors.muted,
  border: tokens.colors.border,
  outline: tokens.colors.border,
  text: tokens.colors.text,
  primary: tokens.colors.accent,
  onPrimary: '#060912',
  white: '#FFFFFF',
  black: '#000000',
} as const;
