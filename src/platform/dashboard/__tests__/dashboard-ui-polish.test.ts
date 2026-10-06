/**
 * Dashboard UI/UX Polish — Verification Test Suite
 *
 * Verifies R1/M2 requirements across:
 * - src/platform/dashboard/public/index.html
 * - src/platform/dashboard/dashboard.html
 *
 * Checks responsive layout, number/currency formatting,
 * interactive states, contrast/WCAG AA, XSS escaping, and API harmonization.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexPath = resolve(__dirname, '../public/index.html');
const dashPath = resolve(__dirname, '../dashboard.html');

describe('Dashboard UI/UX Polish (M2)', () => {
  const indexHtml = readFileSync(indexPath, 'utf-8');
  const dashHtml = readFileSync(dashPath, 'utf-8');

  describe('1. Mobile Responsive Layout (>= 375px)', () => {
    it('prevents horizontal page overflow on viewport root', () => {
      expect(indexHtml).toMatch(/html,\s*body\s*\{[^}]*overflow-x:\s*hidden/);
      expect(indexHtml).toMatch(/html,\s*body\s*\{[^}]*max-width:\s*100vw/);
    });

    it('hides #user-email, #last-updated, and #ws-status on mobile screens (<= 600px)', () => {
      const m600 = indexHtml.match(/@media\s*\(max-width:\s*600px\)\s*\{([\s\S]*?)\n\s*@media/);
      expect(m600).not.toBeNull();
      const content = m600![1];
      expect(content).toContain('#user-email');
      expect(content).toContain('#last-updated');
      expect(content).toContain('#ws-status');
      expect(content).toContain('display: none !important');
    });

    it('configures .summary-grid 1-column layout and 12px padding on viewports <= 440px', () => {
      const m440 = indexHtml.match(/@media\s*\(max-width:\s*440px\)\s*\{([\s\S]*?)\n\s*\.panel/);
      expect(m440).not.toBeNull();
      const content = m440![1];
      expect(content).toContain('grid-template-columns: 1fr');
      expect(content).toContain('padding: 12px');
    });

    it('enables flex-wrap and responsive gaps on system-health-bar', () => {
      expect(indexHtml).toMatch(/\.system-health-bar\s*\{[^}]*flex-wrap:\s*wrap/);
      expect(indexHtml).toMatch(/\.system-health-bar\s*\{[^}]*gap:\s*8px/);
    });

    it('adapts .admin-stat-grid for tablets (<= 768px: 2-col) and mobile (<= 480px: 1-col)', () => {
      expect(indexHtml).toMatch(/@media\s*\(max-width:\s*768px\)[\s\S]*?\.admin-stat-grid[\s\S]*?grid-template-columns:\s*repeat\(2,\s*1fr\)/);
      expect(indexHtml).toMatch(/@media\s*\(max-width:\s*480px\)[\s\S]*?\.admin-stat-grid[\s\S]*?grid-template-columns:\s*1fr/);
    });
  });

  describe('2. Numerical Precision & Currency Formatting', () => {
    it('implements formatCurrency with -$ prefix for negative values and +$ for PnL', () => {
      expect(indexHtml).toContain("if (num < 0) return `-$${formatted}`;");
      expect(indexHtml).toContain("return withPlusSign ? `+$${formatted}` : `$${formatted}`;");
      expect(indexHtml).toContain("if (num === 0 || formatted === '0.00') return '$0.00';");
    });

    it('safely handles null/undefined/NaN with "—" fallback for percent and drawdown', () => {
      expect(indexHtml).toContain("if (Number.isNaN(num)) return '—';");
      expect(indexHtml).toContain("document.getElementById('card-drawdown-sub').textContent = dd ? `drawdown ${dd}` : 'drawdown —';");
    });

    it('uses thousand comma separators on balance and trade counts', () => {
      expect(indexHtml).toContain("toLocaleString('en-US'");
      expect(indexHtml).toContain("Number(d.tradeCount).toLocaleString('en-US')");
    });

    it('strictly satisfies Rule H4: zero console.warn or console.log in client code', () => {
      const scriptMatches = indexHtml.match(/<script>([\s\S]*?)<\/script>/g) || [];
      for (const script of scriptMatches) {
        expect(script).not.toMatch(/console\.(warn|log|error)\(/);
      }
    });
  });

  describe('3. Interactive Elements & In-Flight Feedback States', () => {
    it('provides chart date filter buttons (1D, 1W, 1M, ALL) with active state', () => {
      expect(indexHtml).toContain('data-range="1D" onclick="setChartFilter(\'1D\')"');
      expect(indexHtml).toContain('data-range="1W" onclick="setChartFilter(\'1W\')"');
      expect(indexHtml).toContain('data-range="1M" onclick="setChartFilter(\'1M\')"');
      expect(indexHtml).toContain('class="chart-filter-btn active" data-range="ALL"');
    });

    it('manages strategy controls with disabled and in-flight loading text', () => {
      expect(indexHtml).toContain("btn.textContent = currentlyRunning ? 'Stopping…' : 'Starting…';");
      expect(indexHtml).toContain('btn.disabled = true;');
      expect(indexHtml).toContain("apiUrl('/dashboard/api/strategy/' + action)");
    });

    it('provides in-flight loading and disabled feedback on AI brain and auth controls', () => {
      expect(indexHtml).toContain("btn.textContent = 'Refreshing…';");
      expect(indexHtml).toContain("submitBtn.textContent = authMode === 'login' ? 'Logging in…' : 'Registering…';");
    });
  });

  describe('4. dashboard.html Security, Contrast & API Remediation', () => {
    it('escapes both double and single quotes in escapeHtml against XSS', () => {
      expect(dashHtml).toContain(".replace(/\"/g, '&quot;')");
      expect(dashHtml).toContain(".replace(/'/g, '&#39;')");
    });

    it('eliminates bright cyan background on .sys-item for WCAG AA compliance', () => {
      expect(dashHtml).not.toMatch(/\.sys-item\s*\{[^}]*background:\s*var\(--accent\)/);
      expect(dashHtml).toMatch(/\.sys-item\s*\{[^}]*background:\s*var\(--card\)/);
      expect(dashHtml).toMatch(/\.sys-item\s+\.sys-value\s*\{[^}]*color:\s*var\(--text\)/);
    });

    it('maintains high contrast black text (#000) on #refreshBtn', () => {
      expect(dashHtml).toMatch(/#refreshBtn\s*\{[^}]*color:\s*#000/);
    });

    it('harmonizes all API calls to /dashboard/api/* prefix with zero bare /api/ calls', () => {
      expect(dashHtml).toContain("safeFetch('/dashboard/api/strategy-status')");
      expect(dashHtml).toContain("safeFetch('/dashboard/api/trades')");
      expect(dashHtml).toContain("safeFetch('/dashboard/api/portfolio')");
      expect(dashHtml).toContain("safeFetch('/dashboard/api/system-health')");
      expect(dashHtml).not.toMatch(/safeFetch\(['"`]\/api\//);
    });

    it('provides in-flight states for toggleStrategy in dashboard.html', () => {
      expect(dashHtml).toContain("btn.textContent = isRunning ? 'Stopping…' : 'Starting…';");
      expect(dashHtml).toContain('btn.disabled = true;');
    });
  });
});
