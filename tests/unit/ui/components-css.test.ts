import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const componentsPath = resolve(__dirname, '../../../src/ui/design-system/components.css');

describe('Component Styles & States (src/ui/design-system/components.css)', () => {
  const css = readFileSync(componentsPath, 'utf-8');

  it('defines complete .cc-modal component hierarchy', () => {
    expect(css).toContain('.cc-modal');
    expect(css).toContain('.cc-modal-dialog');
    expect(css).toContain('.cc-modal-backdrop');
    expect(css).toContain('.cc-modal-header');
    expect(css).toContain('.cc-modal-title');
    expect(css).toContain('.cc-modal-body');
    expect(css).toContain('.cc-modal-footer');
    expect(css).toContain('.cc-modal-close');
  });

  it('defines enhanced button states: focus-visible, active, disabled, loading', () => {
    expect(css).toContain('.cc-button:focus-visible');
    expect(css).toContain('.cc-button:active');
    expect(css).toContain('.cc-button:disabled');
    expect(css).toContain('.cc-button--disabled');
    expect(css).toContain('.cc-button--loading');
    expect(css).toContain('@keyframes cc-spin');
  });

  it('eliminates hardcoded hex colors #0B0E11 and #00E8BB in favor of tokens', () => {
    expect(css).not.toContain('#0B0E11');
    expect(css).not.toContain('#00E8BB');
  });

  it('defines enhanced input states: focus-visible, disabled, and error', () => {
    expect(css).toContain('.cc-input:focus-visible');
    expect(css).toContain('.cc-input:disabled');
    expect(css).toContain('.cc-input--error');
  });

  it('standardizes badges using semantic dim tokens instead of raw rgba values', () => {
    expect(css).toContain('var(--color-profit-dim)');
    expect(css).toContain('var(--color-loss-dim)');
    expect(css).toContain('var(--color-warning-dim)');
    expect(css).toContain('var(--color-ai-dim)');
  });

  it('guarantees visible loading spinner border without transparent inheritance', () => {
    // Spinner must not use currentColor with transparent text
    expect(css).not.toMatch(/\.cc-button--loading::after\s*{[^}]*border:\s*2px solid currentColor/);
    expect(css).toContain('border: 2px solid var(--text-primary);');
    expect(css).toContain('.cc-button--primary.cc-button--loading::after');
    expect(css).toContain('border-color: var(--text-inverse);');
  });

  it('provides prefers-reduced-motion media query for continuous animations', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*{[\s\S]*?\.cc-button--loading::after/);
  });
});
