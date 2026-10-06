import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tokensPath = resolve(__dirname, '../../../src/ui/design-system/tokens.css');

function sRGBtoLin(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const clean = hex.trim().replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return 0.2126 * sRGBtoLin(r) + 0.7152 * sRGBtoLin(g) + 0.0722 * sRGBtoLin(b);
}

function getContrast(hex1: string, hex2: string): number {
  const l1 = luminance(hex1);
  const l2 = luminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function extractVar(content: string, varName: string): string | null {
  const regex = new RegExp(`${varName}:\\s*([^;]+);`);
  const match = content.match(regex);
  return match ? match[1].trim() : null;
}

describe('Design Tokens & Contrast Ratios (src/ui/design-system/tokens.css)', () => {
  const css = readFileSync(tokensPath, 'utf-8');

  it('contains all required token extensions', () => {
    expect(css).toContain('--bg-overlay:');
    expect(css).toContain('--text-inverse:');
    expect(css).toContain('--color-accent-hover:');
    expect(css).toContain('--color-profit-dim:');
    expect(css).toContain('--color-loss-dim:');
    expect(css).toContain('--color-warning-dim:');
    expect(css).toContain('--color-ai-dim:');
    expect(css).toContain('--space-5:');
    expect(css).toContain('--radius-full:');
  });

  it('guarantees dark mode --text-tertiary achieves WCAG AA >= 4.5:1 against dark backgrounds', () => {
    const textTertiary = extractVar(css, '--text-tertiary');
    const bgPrimary = extractVar(css, '--bg-primary') || '#0B0E11';
    const bgSurface = extractVar(css, '--bg-surface') || '#141820';

    expect(textTertiary).not.toBeNull();
    const ratioPrimary = getContrast(textTertiary!, bgPrimary);
    const ratioSurface = getContrast(textTertiary!, bgSurface);

    expect(ratioPrimary).toBeGreaterThanOrEqual(4.5);
    expect(ratioSurface).toBeGreaterThanOrEqual(4.5);
  });

  it('guarantees dark mode --color-loss achieves WCAG AA >= 4.5:1 against --bg-hover', () => {
    const colorLoss = extractVar(css, '--color-loss');
    const bgHover = extractVar(css, '--bg-hover') || '#1E2838';

    expect(colorLoss).not.toBeNull();
    const ratioHover = getContrast(colorLoss!, bgHover);
    expect(ratioHover).toBeGreaterThanOrEqual(4.5);
  });

  it('defines light mode [data-theme="light"] palette with WCAG AA compliance', () => {
    expect(css).toContain('[data-theme="light"]');

    // Extract light mode block
    const lightBlockMatch = css.match(/\[data-theme="light"\]\s*{([^}]+)}/s);
    expect(lightBlockMatch).not.toBeNull();
    const lightBlock = lightBlockMatch![1];

    const bgSurface = extractVar(lightBlock, '--bg-surface') || '#FFFFFF';
    const textPrimary = extractVar(lightBlock, '--text-primary');
    const textSecondary = extractVar(lightBlock, '--text-secondary');
    const textTertiary = extractVar(lightBlock, '--text-tertiary');
    const profit = extractVar(lightBlock, '--color-profit');
    const loss = extractVar(lightBlock, '--color-loss');
    const warning = extractVar(lightBlock, '--color-warning');
    const ai = extractVar(lightBlock, '--color-ai');

    const textInverse = extractVar(lightBlock, '--text-inverse') || '#FFFFFF';
    const colorAccent = extractVar(lightBlock, '--color-accent');
    const colorAccentHover = extractVar(lightBlock, '--color-accent-hover');

    expect(textPrimary).not.toBeNull();
    expect(textSecondary).not.toBeNull();
    expect(textTertiary).not.toBeNull();
    expect(profit).not.toBeNull();
    expect(loss).not.toBeNull();
    expect(warning).not.toBeNull();
    expect(ai).not.toBeNull();
    expect(colorAccent).not.toBeNull();
    expect(colorAccentHover).not.toBeNull();

    expect(getContrast(textPrimary!, bgSurface)).toBeGreaterThanOrEqual(4.5);
    expect(getContrast(textSecondary!, bgSurface)).toBeGreaterThanOrEqual(4.5);
    expect(getContrast(textTertiary!, bgSurface)).toBeGreaterThanOrEqual(4.5);
    expect(getContrast(profit!, bgSurface)).toBeGreaterThanOrEqual(4.5);
    expect(getContrast(loss!, bgSurface)).toBeGreaterThanOrEqual(4.5);
    expect(getContrast(warning!, bgSurface)).toBeGreaterThanOrEqual(4.5);
    expect(getContrast(ai!, bgSurface)).toBeGreaterThanOrEqual(4.5);

    // WCAG AA SC 1.4.3: Primary button text (--text-inverse) on --color-accent >= 4.5:1
    expect(getContrast(textInverse, colorAccent!)).toBeGreaterThanOrEqual(4.5);
    expect(getContrast(textInverse, colorAccentHover!)).toBeGreaterThanOrEqual(4.5);
  });
});

import { COLORS, LIGHT_COLORS } from '../../../dashboard/src/lib/stitch-design-tokens';

const buttonPath = resolve(__dirname, '../../../dashboard/src/components/ui/button.tsx');
const stitchButtonPath = resolve(__dirname, '../../../dashboard/src/components/ui/stitch-button.tsx');
const stitchInputPath = resolve(__dirname, '../../../dashboard/src/components/ui/stitch-input.tsx');
const sidebarNavPath = resolve(__dirname, '../../../dashboard/src/components/sidebar-navigation.tsx');
const indexCssPath = resolve(__dirname, '../../../dashboard/src/index.css');

describe('Stitch Design Tokens & UI Accessibility Remediation (M1)', () => {
  it('guarantees stitch COLORS loss (#FF5C6C) achieves WCAG AA >= 4.5:1 on dark surfaces', () => {
    expect(COLORS.loss).toBe('#FF5C6C');

    // Contrast on surfaceHigh (#1c2b3c)
    const ratioSurfaceHigh = getContrast(COLORS.loss, COLORS.surfaceHigh);
    expect(ratioSurfaceHigh).toBeGreaterThanOrEqual(4.5);

    // Contrast on surface (#0d1c2d)
    const ratioSurface = getContrast(COLORS.loss, COLORS.surface);
    expect(ratioSurface).toBeGreaterThanOrEqual(4.5);

    // Contrast on bg (#051424)
    const ratioBg = getContrast(COLORS.loss, COLORS.bg);
    expect(ratioBg).toBeGreaterThanOrEqual(4.5);
  });

  it('guarantees dark mode semantic text and status colors meet >= 4.5:1 against surfaces', () => {
    expect(getContrast(COLORS.profit, COLORS.surfaceHigh)).toBeGreaterThanOrEqual(4.5);
    expect(getContrast(COLORS.warning, COLORS.surfaceHigh)).toBeGreaterThanOrEqual(4.5);
    expect(getContrast(COLORS.primary, COLORS.surfaceHigh)).toBeGreaterThanOrEqual(4.5);
    expect(getContrast(COLORS.onSurface, COLORS.surfaceHigh)).toBeGreaterThanOrEqual(4.5);
    expect(getContrast(COLORS.onSurfaceVariant, COLORS.surfaceHigh)).toBeGreaterThanOrEqual(4.5);
    expect(getContrast(COLORS.onPrimary, COLORS.primary)).toBeGreaterThanOrEqual(4.5);
  });

  it('defines light mode LIGHT_COLORS palette with full WCAG AA compliance (>= 4.5:1)', () => {
    expect(LIGHT_COLORS).toBeDefined();
    const surfaces = [LIGHT_COLORS.surface, LIGHT_COLORS.surfaceHigh];
    const textAndAccents = [
      LIGHT_COLORS.onSurface,
      LIGHT_COLORS.onSurfaceVariant,
      LIGHT_COLORS.primary,
      LIGHT_COLORS.profit,
      LIGHT_COLORS.loss,
      LIGHT_COLORS.warning,
    ];
    for (const surface of surfaces) {
      for (const color of textAndAccents) {
        expect(getContrast(color, surface)).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(getContrast(LIGHT_COLORS.onPrimary, LIGHT_COLORS.primary)).toBeGreaterThanOrEqual(4.5);
  });

  it('guarantees keyboard focus rings and eliminates bare outline-none in button and input primitives', () => {
    const buttonSrc = readFileSync(buttonPath, 'utf-8');
    const stitchButtonSrc = readFileSync(stitchButtonPath, 'utf-8');
    const stitchInputSrc = readFileSync(stitchInputPath, 'utf-8');

    // Button: visible keyboard focus ring
    expect(buttonSrc).toContain('focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2');
    expect(buttonSrc).not.toContain('focus:outline-none');

    // StitchButton: visible keyboard focus ring
    expect(stitchButtonSrc).toContain('focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2');

    // StitchInput: visible keyboard focus ring without bare outline-none or broken class
    expect(stitchInputSrc).toContain('focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2');
    expect(stitchInputSrc).not.toMatch(/(?<!focus-visible:)outline-none/);
    expect(stitchInputSrc).not.toContain('focus:border-[${COLORS.primary}]/70');
  });

  it('guarantees sidebar-navigation.tsx eliminates broken class string shadow-[0_0_6px_${_COLORS.profit}]', () => {
    const sidebarSrc = readFileSync(sidebarNavPath, 'utf-8');
    expect(sidebarSrc).not.toContain('shadow-[0_0_6px_${_COLORS.profit}]');
    expect(sidebarSrc).not.toContain('shadow-[0_0_6px_');
  });

  it('guarantees dashboard/src/index.css bridges tokens.css variables', () => {
    const indexCss = readFileSync(indexCssPath, 'utf-8');
    expect(indexCss).toMatch(/tokens\.css/);
  });
});
