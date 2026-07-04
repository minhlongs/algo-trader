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
  loss: '#ef4444',
  warning: '#f59e0b',
} as const;

export type ColorToken = typeof COLORS;
