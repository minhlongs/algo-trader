export const COLORS = {
  bg: '#051424',
  surface: '#0d1c2d',
  surfaceHigh: '#1c2b3c',
  surfaceContainer: '#122131',
  outline: '#3f4e5f',
  primary: '#4cd7f6',
  primaryContainer: '#06b6d4',
  onSurface: '#e2e8f0',
  onSurfaceVariant: '#94a3b8',
  onPrimary: '#003640',
  profit: '#22c55e',
  loss: '#FF5C6C',
  warning: '#f59e0b',
} as const;

export const LIGHT_COLORS = {
  bg: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceHigh: '#F1F5F9',
  surfaceContainer: '#E2E8F0',
  outline: '#CBD5E1',
  primary: '#0F766E',
  primaryContainer: '#CCFBF1',
  onSurface: '#0F172A',
  onSurfaceVariant: '#475569',
  onPrimary: '#FFFFFF',
  profit: '#047857',
  loss: '#B91C1C',
  warning: '#B45309',
} as const;

export type ColorToken = typeof COLORS;
export type LightColorToken = typeof LIGHT_COLORS;
