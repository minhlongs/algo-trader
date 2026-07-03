/**
 * TERMINAL.CORE — Design Tokens: Colors
 * Extracted from Stitch desktop designs, adapted for React Native mobile.
 *
 * Usage: import { colors } from '@/theme/colors'
 */

export const colors = {
  // Primary (Gold / Amber)
  primary: '#ffc174',
  primaryContainer: '#f59e0b',
  primaryFixed: '#ffddb8',
  primaryFixedDim: '#ffb95f',
  inversePrimary: '#855300',
  onPrimary: '#472a00',
  onPrimaryContainer: '#613b00',
  onPrimaryFixed: '#2a1700',
  onPrimaryFixedVariant: '#653e00',

  // Secondary (Purple)
  secondary: '#d0bcff',
  secondaryContainer: '#571bc1',
  secondaryFixed: '#e9ddff',
  secondaryFixedDim: '#d0bcff',
  onSecondary: '#3c0091',
  onSecondaryContainer: '#c4abff',
  onSecondaryFixed: '#23005c',
  onSecondaryFixedVariant: '#5516be',

  // Tertiary (Green)
  tertiary: '#56e5a9',
  tertiaryContainer: '#30c88f',
  tertiaryFixed: '#6ffbbe',
  tertiaryFixedDim: '#4edea3',
  onTertiary: '#003824',
  onTertiaryContainer: '#004e34',
  onTertiaryFixed: '#002113',
  onTertiaryFixedVariant: '#005236',

  // Error (Red)
  error: '#ffb4ab',
  errorContainer: '#93000a',
  onError: '#690005',
  onErrorContainer: '#ffdad6',

  // Surface / Background
  surface: '#10131d',
  surfaceDim: '#10131d',
  surfaceBright: '#363943',
  surfaceContainerLowest: '#0a0e17',
  surfaceContainerLow: '#181b25',
  surfaceContainer: '#1c1f29',
  surfaceContainerHigh: '#262a34',
  surfaceContainerHighest: '#31343f',
  surfaceTint: '#ffb95f',
  surfaceVariant: '#31343f',
  background: '#10131d',

  // On-surface text
  onSurface: '#e0e2f0',
  onSurfaceVariant: '#d8c3ad',
  onBackground: '#e0e2f0',

  // Outline / Borders
  outline: '#a08e7a',
  outlineVariant: '#534434',

  // Utility
  inverseSurface: '#e0e2f0',
  inverseOnSurface: '#2d303a',

  // Glass panel overlay
  glassBackground: 'rgba(15, 23, 42, 0.8)',
} as const;
