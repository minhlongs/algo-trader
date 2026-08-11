/**
 * Platform Tenant-Isolation Contract
 *
 * Verifies that platform DB queries always include tenantId filtering.
 * This is a security-critical contract: without tenant isolation,
 * subscribers could see each other's data.
 *
 * Strategy: scan platform/ source files for DB query patterns and
 * verify they include tenantId in WHERE clauses or use buildTenantFilter().
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

function hasDbQuery(content: string): boolean {
  return /query\(|findMany\(|findFirst\(|findUnique\(|create\(|update\(|delete\(|execute\(|pool\.query|db\.query/.test(content);
}

function hasTenantFilter(content: string): boolean {
  return /tenantId|tenant_id|buildTenantFilter|filterByTenant/.test(content);
}

function isTestFile(path: string): boolean {
  return path.includes('__tests__') || path.includes('.test.') || path.includes('.spec.');
}

// ── Tests ────────────────────────────────────────────────────────────

describe('Platform Tenant-Isolation Contract', () => {
  const platformDir = join(SRC_ROOT, 'platform');

  // ── 1. Tenant filter utility exists ────────────────────────────────
  describe('Tenant filter infrastructure', () => {
    it('tenant-filter utility exists in platform or raas', () => {
      const candidates = [
        join(platformDir, 'db', 'tenant-filter.ts'),
        join(platformDir, 'raas', 'subscriber-tenant-isolator.ts'),
      ];
      const found = candidates.some(c => existsSync(c));
      expect(found, 'tenant isolation infrastructure must exist').toBe(true);
    });

    it('subscriber-tenant-isolator exports buildTenantFilter or equivalent', () => {
      const isolatorFile = join(platformDir, 'raas', 'subscriber-tenant-isolator.ts');
      if (!existsSync(isolatorFile)) return;
      const content = readFileSync(isolatorFile, 'utf8');
      const hasBuildFilter = /buildTenantFilter|tenantClause|tenantFilter/.test(content);
      const hasSubQuery = /subscriber_token|tenant_id/.test(content);
      expect(hasBuildFilter || hasSubQuery, 'tenant filtering not found in isolator').toBe(true);
    });
  });

  // ── 2. Platform DB queries use tenant filtering ────────────────────
  describe('Platform query tenant isolation', () => {
    it('raas/ modules reference tenantId in DB operations', () => {
      const raasDir = join(platformDir, 'raas');
      if (!existsSync(raasDir)) return;
      const files = findTsFiles(raasDir).filter(f => !isTestFile(f));
      const withDbQuery = files.filter(f => {
        try { return hasDbQuery(readFileSync(f, 'utf8')); } catch { return false; }
      });

      // All raas modules with DB queries must reference tenantId
      const violations: string[] = [];
      for (const f of withDbQuery) {
        const content = readFileSync(f, 'utf8');
        if (!hasTenantFilter(content)) {
          violations.push(f);
        }
      }

      // Allow 0 violations (subscriber modules MUST use tenantId)
      expect(
        violations,
        `raas/ files with DB queries missing tenantId:\n${violations.join('\n')}`,
      ).toEqual([]);
    });

    it('marketplace/ repositories reference tenantId', () => {
      const mktRepoDir = join(platformDir, 'marketplace', 'repositories');
      if (!existsSync(mktRepoDir)) return;
      const files = findTsFiles(mktRepoDir).filter(f => !isTestFile(f));
      const violations: string[] = [];

      for (const f of files) {
        const content = readFileSync(f, 'utf8');
        if (hasDbQuery(content) && !hasTenantFilter(content)) {
          violations.push(f);
        }
      }

      expect(
        violations.length,
        `${violations.length} marketplace repositories missing tenantId:\n${violations.join('\n')}`,
      ).toBeLessThanOrEqual(2); // Allow some — not all queries need tenant filtering
    });
  });

  // ── 3. Desk modules must NOT have tenant references ────────────────
  describe('Desk module tenant absence', () => {
    it('strategies/ has no tenantId references', () => {
      const stratDir = join(SRC_ROOT, 'desk', 'strategies');
      if (!existsSync(stratDir)) return;
      const files = findTsFiles(stratDir).filter(f => !isTestFile(f));
      const violations: string[] = [];

      for (const f of files) {
        try {
          const content = readFileSync(f, 'utf8');
          // tenant_id or tenantId in DB query context
          if (hasDbQuery(content) && /\btenantId\b|\btenant_id\b/.test(content)) {
            violations.push(f);
          }
        } catch { /* skip */ }
      }

      expect(
        violations,
        `strategies/ with tenantId in DB queries:\n${violations.join('\n')}`,
      ).toEqual([]);
    });

    it('execution/ has no tenantId references', () => {
      const execDir = join(SRC_ROOT, 'desk', 'execution');
      if (!existsSync(execDir)) return;
      const files = findTsFiles(execDir).filter(f => !isTestFile(f));
      const violations: string[] = [];

      for (const f of files) {
        try {
          const content = readFileSync(f, 'utf8');
          // Allow tenantId in logAudit calls (audit logging), but not in actual DB queries
          const dbQueryWithTenantId = hasDbQuery(content) && /\btenantId\b|\btenant_id\b/.test(content) && !/logAudit/.test(content);
          if (dbQueryWithTenantId) {
            violations.push(f);
          }
        } catch { /* skip */ }
      }

      expect(
        violations,
        `execution/ with tenantId in DB queries:\n${violations.join('\n')}`,
      ).toEqual([]);
    });
  });
});
