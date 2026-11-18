/**
 * POLY-G5 Public Beta — Bilingual Copy Barrel (Vietnamese default + English toggle).
 */

import { POLY_BETA_COPY_EN } from './poly-beta-copy-en';
import { POLY_BETA_COPY_VI, type PolyBetaCopyKey } from './poly-beta-copy-vi';

export type BetaLang = 'vi' | 'en';
export type { PolyBetaCopyKey };

export const POLY_BETA_COPY: Record<BetaLang, Record<PolyBetaCopyKey, string>> = {
  vi: POLY_BETA_COPY_VI,
  en: POLY_BETA_COPY_EN,
};
