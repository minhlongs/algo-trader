/**
 * TERMINAL.CORE — Design Tokens: Typography
 * Hanken Grotesk (UI) + JetBrains Mono (Data)
 */

import { Platform, TextStyle } from 'react-native';

const hankenGrotesk = Platform.select({
  ios: 'HankenGrotesk_400Regular',
  android: 'HankenGrotesk_400Regular',
  default: 'System',
});

const jetbrainsMono = Platform.select({
  ios: 'JetBrainsMono_400Regular',
  android: 'JetBrainsMono_400Regular',
  default: 'System',
});

export const fonts = {
  hankenGrotesk,
  jetbrainsMono,
} as const;

export const typography: Record<string, TextStyle> = {
  headlineLg: {
    fontFamily: hankenGrotesk,
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: -0.32,
    fontWeight: '700',
  } as TextStyle,
  headlineMd: {
    fontFamily: hankenGrotesk,
    fontSize: 24,
    lineHeight: 32,
    letterSpacing: -0.24,
    fontWeight: '600',
  } as TextStyle,
  headlineSm: {
    fontFamily: hankenGrotesk,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
  } as TextStyle,
  bodyLg: {
    fontFamily: hankenGrotesk,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400',
  } as TextStyle,
  bodyMd: {
    fontFamily: hankenGrotesk,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
  } as TextStyle,
  dataLg: {
    fontFamily: jetbrainsMono,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '600',
  } as TextStyle,
  dataMd: {
    fontFamily: jetbrainsMono,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  } as TextStyle,
  labelCaps: {
    fontFamily: jetbrainsMono,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 0.55,
    fontWeight: '700',
  } as TextStyle,
};
