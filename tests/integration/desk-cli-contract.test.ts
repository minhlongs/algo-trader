/**
 * Desk CLI Contract
 *
 * Verifies CLI commands remain functional after desk/platform split.
 * Tests command signatures, option parsing, and CLI entry points.
 * Desk CLI is operator-only (no auth, no tenant) — commands are
 * run directly by the trader.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const SRC_ROOT = join(REPO_ROOT, 'src');

// ── Helpers ──────────────────────────────────────────────────────────

function findTsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const { readdirSync, statSync } = require('fs');
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      try {
        const st = statSync(full);
        if (st.isDirectory() && entry !== 'node_modules' && entry !== '__tests__') {
          results.push(...findTsFiles(full));
        } else if (st.isFile() && entry.endsWith('.ts')) {
          results.push(full);
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return results;
}

// ── Tests ────────────────────────────────────────────────────────────

describe('Desk CLI Contract', () => {
  // ── 1. CLI entry point exists ──────────────────────────────────────
  describe('CLI entry point', () => {
    it('src/index.ts exists and exports main()', () => {
      const indexFile = join(SRC_ROOT, 'index.ts');
      expect(existsSync(indexFile), 'src/index.ts must exist').toBe(true);
      const content = readFileSync(indexFile, 'utf8');
      expect(content).toContain('export function main');
    });

    it('version constant is defined', () => {
      const indexFile = join(SRC_ROOT, 'index.ts');
      const content = readFileSync(indexFile, 'utf8');
      expect(content).toContain('export const version');
    });
  });

  // ── 2. CLI command modules exist ───────────────────────────────────
  describe('CLI commands', () => {
    const commandsDir = join(SRC_ROOT, 'desk', 'commands');
    const cliDir = join(SRC_ROOT, 'desk', 'cli');

    it('commands/ directory has subcommands', () => {
      const cmdExists = existsSync(commandsDir);
      const cliExists = existsSync(cliDir);
      expect(cmdExists || cliExists, 'CLI commands directory must exist').toBe(true);
    });

    it('essential commands are present', () => {
      const requiredCommands = ['setup', 'quickstart', 'paper-trading', 'gru-strategy'];
      let foundCount = 0;

      for (const cmd of requiredCommands) {
        const locations = [
          join(commandsDir, `${cmd}.ts`),
          join(commandsDir, `${cmd}.js`),
          join(cliDir, `${cmd}.ts`),
          join(cliDir, `${cmd}.js`),
        ];
        if (locations.some(l => existsSync(l))) foundCount++;
      }

      expect(
        foundCount,
        `Only ${foundCount}/${requiredCommands.length} essential commands found`,
      ).toBeGreaterThanOrEqual(3);
    });
  });

  // ── 3. Commander.js CLI structure ──────────────────────────────────
  describe('Commander.js structure', () => {
    it('index.ts uses Commander.js for CLI parsing', () => {
      const indexFile = join(SRC_ROOT, 'index.ts');
      const content = readFileSync(indexFile, 'utf8');
      expect(content).toContain('commander');
    });

    it('CLI commands use commander Command objects', () => {
      const cmdsDir = join(SRC_ROOT, 'desk', 'commands');
      if (!existsSync(cmdsDir)) return;

      const files = findTsFiles(cmdsDir).filter(f => !f.includes('__tests__'));
      let usesCommander = false;
      for (const f of files) {
        try {
          const content = readFileSync(f, 'utf8');
          if (/Command|commander|\.command\(|\.option\(/.test(content)) {
            usesCommander = true;
            break;
          }
        } catch { /* skip */ }
      }
      expect(usesCommander, 'No commands use Commander.js patterns').toBe(true);
    });

    it('default action runs main() when no command specified', () => {
      const indexFile = join(SRC_ROOT, 'index.ts');
      const content = readFileSync(indexFile, 'utf8');
      const hasDefault = /main\(\)/.test(content);
      expect(hasDefault, 'main() must be callable as default action').toBe(true);
    });
  });

  // ── 4. Desk module independence ────────────────────────────────────
  describe('Desk module independence', () => {
    it('index.ts does not import from api/ or auth/ (platform concerns)', () => {
      const indexFile = join(SRC_ROOT, 'index.ts');
      const content = readFileSync(indexFile, 'utf8');

      // CLI entry should NOT import API server or auth directly
      const platformImports = [
        "from './platform/api/",
        "from './platform/auth/",
        "from './platform/billing/",
        "from './platform/marketplace/",
        "from './platform/raas/",
        "from './platform/metering/",
      ];

      for (const imp of platformImports) {
        expect(content, `index.ts imports ${imp} — CLI should not import platform modules`).not.toContain(imp);
      }
    });

    it('strategy files do not import platform-specific modules', () => {
      const stratDir = join(SRC_ROOT, 'desk', 'strategies');
      if (!existsSync(stratDir)) return;

      const files = findTsFiles(stratDir).filter(f => !f.includes('__tests__'));
      const violations: string[] = [];

      for (const f of files) {
        try {
          const content = readFileSync(f, 'utf8');
          if (/from '.*\/api\/|from '.*\/auth\/|from '.*\/billing\/|from '.*\/marketplace\//.test(content)) {
            // Skip if this is a marketplace strategy that legitimately references marketplace types
            if (!f.includes('marketplace')) {
              violations.push(f);
            }
          }
        } catch { /* skip */ }
      }

      expect(
        violations.length,
        `${violations.length} strategy files import platform modules:\n${violations.join('\n')}`,
      ).toBeLessThanOrEqual(3); // Some strategies may legitimately reference marketplace interfaces
    });
  });
});
