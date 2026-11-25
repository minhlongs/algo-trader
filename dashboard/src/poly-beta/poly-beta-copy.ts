/**
 * POLY-G5 / POLY-G10.5 International Paper Beta — Copy Barrel (English default + secondary toggle).
 */

import { POLY_BETA_COPY_EN } from './poly-beta-copy-en';
import { POLY_BETA_COPY_VI, type PolyBetaCopyKey } from './poly-beta-copy-vi';

export type BetaLang = 'en' | 'vi';
export type { PolyBetaCopyKey };
export const DEFAULT_BETA_LANG: BetaLang = 'en';

export const POLY_BETA_COPY: Record<BetaLang, Record<PolyBetaCopyKey, string>> = {
  en: POLY_BETA_COPY_EN,
  vi: POLY_BETA_COPY_VI,
};
