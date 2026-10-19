// SPDX-License-Identifier: MIT
/**
 * UI/UX Pro Max Priority Categories & HTML Rule Evaluators
 * Extracted from `ui-ux-pro-max-auditor.ts` for <90 LOC modularity.
 */

export type UiUxPriorityCategory =
  | '1_ACCESSIBILITY_CRITICAL'
  | '2_TOUCH_AND_INTERACTION_CRITICAL'
  | '3_PERFORMANCE_HIGH'
  | '4_LAYOUT_AND_RESPONSIVE_HIGH'
  | '5_TYPOGRAPHY_AND_COLOR_MEDIUM'
  | '6_ANIMATION_MEDIUM'
  | '7_STYLE_SELECTION_MEDIUM'
  | '8_CHARTS_AND_DATA_LOW';

export interface ScreenUiUxAuditReport {
  readonly file: string;
  readonly passed: boolean;
  readonly scorePct: number;
  readonly categoriesPassed: readonly UiUxPriorityCategory[];
  readonly missingChecks: readonly string[];
}

export interface SuiteUiUxAuditSummary {
  readonly version: '2026.2-PRO-MAX';
  readonly auditedScreensCount: number;
  readonly passedAllScreens: boolean;
  readonly averageScorePct: number;
  readonly sharedCssPresent: boolean;
  readonly sharedRuntimePresent: boolean;
  readonly screens: readonly ScreenUiUxAuditReport[];
}

export const ALL_UI_UX_CATEGORIES: readonly UiUxPriorityCategory[] = [
  '1_ACCESSIBILITY_CRITICAL',
  '2_TOUCH_AND_INTERACTION_CRITICAL',
  '3_PERFORMANCE_HIGH',
  '4_LAYOUT_AND_RESPONSIVE_HIGH',
  '5_TYPOGRAPHY_AND_COLOR_MEDIUM',
  '6_ANIMATION_MEDIUM',
  '7_STYLE_SELECTION_MEDIUM',
  '8_CHARTS_AND_DATA_LOW',
];

export function evaluateScreenUiUxRules(
  file: string,
  html: string,
  hasSharedAssets: boolean,
): ScreenUiUxAuditReport {
  const missing: string[] = [];

  if (!html.includes('pro-max-skip-link') && !html.includes('aria-live')) {
    missing.push('1_ACCESSIBILITY_CRITICAL');
  }
  if (!hasSharedAssets || !html.includes('assets/ui-ux-pro-max.js')) {
    missing.push('2_TOUCH_AND_INTERACTION_CRITICAL');
  }
  if (!hasSharedAssets || !html.includes('assets/ui-ux-pro-max.css')) {
    missing.push('3_PERFORMANCE_HIGH');
  }
  if (!html.includes('viewport') || !html.includes('width=device-width')) {
    missing.push('4_LAYOUT_AND_RESPONSIVE_HIGH');
  }
  if (!html.includes('Space Grotesk') || !html.includes('JetBrains Mono')) {
    missing.push('5_TYPOGRAPHY_AND_COLOR_MEDIUM');
  }
  if (!hasSharedAssets) {
    missing.push('6_ANIMATION_MEDIUM');
  }
  if (!html.toLowerCase().includes('#08090c') && !html.includes('dark')) {
    missing.push('7_STYLE_SELECTION_MEDIUM');
  }
  if (!html.includes('<table') && !html.includes('<svg') && !html.includes('grid')) {
    missing.push('8_CHARTS_AND_DATA_LOW');
  }

  const categoriesPassed = ALL_UI_UX_CATEGORIES.filter((c) => !missing.includes(c));
  const scorePct = Number(((categoriesPassed.length / ALL_UI_UX_CATEGORIES.length) * 100).toFixed(2));

  return {
    file,
    passed: missing.length === 0,
    scorePct,
    categoriesPassed,
    missingChecks: missing,
  };
}
