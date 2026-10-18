// SPDX-License-Identifier: MIT
/**
 * UI/UX Pro Max Programmatic Compliance Auditor (2026.2-PRO-MAX)
 * Audits all Stitch HTML screens in `site/public/*.html` against the 8 priority rule categories
 * from `.agents/skills/ui-ux-pro-max/SKILL.md` and `DESIGN.md` (Obsidian Quantum).
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  evaluateScreenUiUxRules,
  type ScreenUiUxAuditReport,
  type SuiteUiUxAuditSummary,
} from './ui-ux-pro-max-rules';

export * from './ui-ux-pro-max-rules';

export class UiUxProMaxAuditor {
  public auditScreenHtml(file: string, html: string, hasSharedAssets: boolean): ScreenUiUxAuditReport {
    return evaluateScreenUiUxRules(file, html, hasSharedAssets);
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
