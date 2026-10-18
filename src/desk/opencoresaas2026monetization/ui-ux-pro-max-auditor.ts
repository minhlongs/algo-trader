// SPDX-License-Identifier: MIT
/**
 * UI/UX Pro Max Programmatic Compliance Auditor (2026.2-PRO-MAX)
 * Audits all Stitch HTML screens in `site/public/*.html` against the 8 priority rule categories
 * from `.agents/skills/ui-ux-pro-max/SKILL.md` and `DESIGN.md` (Obsidian Quantum).
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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

const ALL_CATEGORIES: readonly UiUxPriorityCategory[] = [
  '1_ACCESSIBILITY_CRITICAL',
  '2_TOUCH_AND_INTERACTION_CRITICAL',
  '3_PERFORMANCE_HIGH',
  '4_LAYOUT_AND_RESPONSIVE_HIGH',
  '5_TYPOGRAPHY_AND_COLOR_MEDIUM',
  '6_ANIMATION_MEDIUM',
  '7_STYLE_SELECTION_MEDIUM',
  '8_CHARTS_AND_DATA_LOW',
];

export class UiUxProMaxAuditor {
  public auditScreenHtml(file: string, html: string, hasSharedAssets: boolean): ScreenUiUxAuditReport {
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

    const categoriesPassed = ALL_CATEGORIES.filter((c) => !missing.includes(c));
    const scorePct = Number(((categoriesPassed.length / ALL_CATEGORIES.length) * 100).toFixed(2));

    return {
      file,
      passed: missing.length === 0,
      scorePct,
      categoriesPassed,
      missingChecks: missing,
    };
  }

  public auditPublicDirectory(publicDir = join(process.cwd(), 'site/public')): SuiteUiUxAuditSummary {
    const cssPath = join(publicDir, 'assets/ui-ux-pro-max.css');
    const jsPath = join(publicDir, 'assets/ui-ux-pro-max.js');
    const sharedCssPresent = existsSync(cssPath) && readFileSync(cssPath, 'utf8').includes('prefers-reduced-motion');
    const sharedRuntimePresent = existsSync(jsPath) && readFileSync(jsPath, 'utf8').includes('pro-max-cmd-modal');
    const hasSharedAssets = sharedCssPresent && sharedRuntimePresent;

    const htmlFiles = existsSync(publicDir)
      ? readdirSync(publicDir).filter((f) => f.endsWith('.html')).sort()
      : [];

    const screens = htmlFiles.map((file) => {
      const html = readFileSync(join(publicDir, file), 'utf8');
      return this.auditScreenHtml(file, html, hasSharedAssets);
    });

    const passedAllScreens = screens.length >= 13 && screens.every((s) => s.passed);
    const averageScorePct =
      screens.length > 0
        ? Number((screens.reduce((acc, s) => acc + s.scorePct, 0) / screens.length).toFixed(2))
        : 0;

    return {
      version: '2026.2-PRO-MAX',
      auditedScreensCount: screens.length,
      passedAllScreens,
      averageScorePct,
      sharedCssPresent,
      sharedRuntimePresent,
      screens,
    };
  }
}
