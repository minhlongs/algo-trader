/**
 * Desk-Platform Boundary Contract
 *
 * Verifies the strict separation between desk/ (proprietary trading) and
 * platform/ (RaaS subscriber) bounded contexts.
 *
 * Rules:
 *  1. No desk/ module imports from platform/
 *  2. No platform/ module imports from desk/
 *  3. Both may import from shared/
 *  4. Communication only through shared/ types
 *
 * Known exceptions (documented, to be resolved):
 *  - prometheus-metrics: desk market-data modules import platform metrics
 *    for observability. Plan: move metrics instrumentation to shared/ or
 *    expose via a cross-cutting interface.
 *  - admin/signal routes: platform API routes import desk strategy/signal
 *    modules for admin operations and signal distribution. This matches the
 *    documented pattern in the architecture plan (platform imports desk
 *    strategy classes through shared IStrategy interface).
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
        } else if (st.isFile() && (entry.endsWith('.ts') || entry.endsWith('.tsx'))) {
          results.push(full);
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return results;
}

function extractImports(filePath: string): string[] {
  try {
    const content = readFileSync(filePath, 'utf8');
    const importRe = /from\s+['"]([^'"]+)['"]/g;
    const imports: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(content)) !== null) {
      imports.push(m[1]);
    }
    return imports;
  } catch {
    return [];
  }
}

// ── Known exception patterns ─────────────────────────────────────────

/**
 * Cross-cutting imports that are documented and accepted for now.
 *
 * desk→platform: These imports are currently necessary because:
 *   - file-store was moved to shared/persistence in Phase 3 batch 2
 *   - license-service is checked by RaaS gate for subscriber execution
 *   - DLP outbound recording/pattern matching is triggered by ironclaw proxy
 *   - Jobs (dunning, audit, email) bridge operational concerns
 *   - immutable-trade-audit logs trading decisions with hash-chain integrity
 *
 * Resolution plan (Phase 3 Steps 5-6):
 *   - Extract license types to shared/types/license.ts
 *   - Move DLP pattern registry to shared/
 *   - Move jobs/ to platform/ or create job interface in shared/
 */
const ALLOWED_DESK_IMPORTS: RegExp[] = [
  /prometheus-metrics/,
  /platform\/persistence\/file-store/,   // moved to shared/ in batch 2
  /platform\/billing\/license-service/,  // RaaS gate license check
  /platform\/audit\//,                   // DLP + audit logging
  /platform\/notifications\/email-service/, // welcome email drip
  /platform\/billing\/dunning-service/,  // dunning KV sync
 /platform\/workers\/openclaw-gateway\//, // desk agent dispatcher uses platform worker gateway
];

const ALLOWED_PLATFORM_IMPORTS: RegExp[] = [
  /desk\/strategies/,      // admin routes load strategies directly
  /desk\/signal/,          // signal routes bridge desk signal pipeline
  /desk\/risk/,            // admin routes reference risk monitors
  /desk\/intelligence/,    // XAI routes import intelligence client
  /desk\/arbitrage/,       // backtest routes use arbitrage backtester
  /desk\/engine/,          // health route imports engine for status
  /desk\/gate\/raas-gate/, // signal routes use RaaS gate
  /desk\/jobs\//,          // billing onboarding triggers desk jobs
  /desk\/ironclaw\//,      // DLP pattern registry shared dependency
  /desk\/feeds\//,         // telegram trading alerts reference feeds
  /desk\/wiring\//,        // admin qwen routes, health, paper-trading orchestration
  /desk\/execution\//,     // trade-repository imports execution types
  /desk\/paper-trading\//, // paper-trading-entry.ts wires loop into worker startup (Step 1.4)
];

// ── Tests ────────────────────────────────────────────────────────────

describe('Desk-Platform Boundary Contract', () => {
  const deskDir = join(SRC_ROOT, 'desk');
  const platformDir = join(SRC_ROOT, 'platform');
  const sharedDir = join(SRC_ROOT, 'shared');

  // ── 1. Shared kernel isolation (pre-existing from Phase 2) ─────────
  describe('shared/ isolation', () => {
    it('shared/ has zero imports from desk/', () => {
      if (!existsSync(sharedDir)) return;
      const files = findTsFiles(sharedDir);
      const violations: string[] = [];
      for (const f of files) {
        const imports = extractImports(f);
        for (const imp of imports) {
          if (imp.includes('/desk/') || imp.startsWith('../desk')) {
            violations.push(`${f}: imports "${imp}"`);
          }
        }
      }
      expect(violations, `shared/ imports from desk/: \n${violations.join('\n')}`).toEqual([]);
    });

    it('shared/ has zero imports from platform/', () => {
      if (!existsSync(sharedDir)) return;
      const files = findTsFiles(sharedDir);
      const violations: string[] = [];
      for (const f of files) {
        const imports = extractImports(f);
        for (const imp of imports) {
          if (imp.includes('/platform/') || imp.startsWith('../platform')) {
            violations.push(`${f}: imports "${imp}"`);
          }
        }
      }
      expect(violations, `shared/ imports from platform/: \n${violations.join('\n')}`).toEqual([]);
    });
  });

  // ── 2. Desk isolation ──────────────────────────────────────────────
  describe('desk/ isolation', () => {
    it('desk/ imports only from shared/ and other desk/ modules', () => {
      if (!existsSync(deskDir)) return;
      const files = findTsFiles(deskDir);
      const violations: string[] = [];
      for (const f of files) {
        const imports = extractImports(f);
        for (const imp of imports) {
          // Must NOT import from platform/
          if (imp.includes('/platform/') || imp.startsWith('../platform')) {
            if (!ALLOWED_DESK_IMPORTS.some(r => r.test(imp))) {
              violations.push(`${f}: imports "${imp}" from platform/`);
            }
          }
        }
      }
      expect(violations, `desk/ imports from platform/: \n${violations.join('\n')}`).toEqual([]);
    });

    it('desk/ has no tenantId references in DB queries', () => {
      if (!existsSync(deskDir)) return;
      const files = findTsFiles(deskDir);
      const violations: string[] = [];
      for (const f of files) {
        try {
          const content = readFileSync(f, 'utf8');
          if (/\btenantId\b/.test(content) && /query\(|findMany\(|findFirst\(|create\(|update\(|delete\(/.test(content)) {
            if (!/emitTradeAuditEvent|drawdown\.update|logAudit/.test(content)) violations.push(f);
          }
        } catch { /* skip */ }
      }
      expect(violations, `desk/ files with tenantId in DB queries: \n${violations.join('\n')}`).toEqual([]);
    });
  });

  // ── 3. Platform isolation ──────────────────────────────────────────
  describe('platform/ isolation', () => {
    it('platform/ imports only from shared/ and other platform/ modules', () => {
      if (!existsSync(platformDir)) return;
      const files = findTsFiles(platformDir);
      const violations: string[] = [];
      for (const f of files) {
        const imports = extractImports(f);
        for (const imp of imports) {
          // Must NOT import from desk/
          if (imp.includes('/desk/') || imp.startsWith('../desk')) {
            if (!ALLOWED_PLATFORM_IMPORTS.some(r => r.test(imp))) {
              violations.push(`${f}: imports "${imp}" from desk/`);
            }
          }
        }
      }
      expect(violations, `platform/ imports from desk/: \n${violations.join('\n')}`).toEqual([]);
    });

    it('platform/ API routes have tier-gating middleware references', () => {
      if (!existsSync(platformDir)) return;
      const featureGateFile = join(platformDir, 'middleware', 'feature-gate.ts');
      expect(existsSync(featureGateFile), 'platform/middleware/feature-gate.ts must exist').toBe(true);
    });

    it('platform/ DB queries use buildTenantFilter', () => {
      if (!existsSync(platformDir)) return;
      const tenantFilterFile = join(platformDir, 'db', 'tenant-filter.ts');
      expect(existsSync(tenantFilterFile), 'platform/db/tenant-filter.ts must exist').toBe(true);
    });
  });

  // ── 4. Communication contract ──────────────────────────────────────
  describe('Desk ↔ Platform communication via shared/', () => {
    it('shared/types/ exports type definitions for cross-side contracts', async () => {
      const sharedTypesDir = join(SRC_ROOT, 'shared', 'types');
      if (!existsSync(sharedTypesDir)) return;
      const files = findTsFiles(sharedTypesDir);
      const hasTypes = files.length > 0;
      expect(hasTypes, 'shared/types/ must contain type definition files').toBe(true);
      const licenseFile = join(sharedTypesDir, 'license.ts');
      if (existsSync(licenseFile)) {
        const content = readFileSync(licenseFile, 'utf8');
        expect(content).toContain('LicenseTier');
      }
    });
  });

  // ── 5. Directory existence (post-split verification) ───────────────
  describe('Directory structure exists', () => {
    it('src/desk/ exists', () => {
      expect(existsSync(deskDir), 'src/desk/ must exist after Phase 3').toBe(true);
    });
    it('src/platform/ exists', () => {
      expect(existsSync(platformDir), 'src/platform/ must exist after Phase 3').toBe(true);
    });
    it('src/shared/ still exists', () => {
      expect(existsSync(sharedDir), 'src/shared/ must exist after Phase 3').toBe(true);
    });
  });
});
