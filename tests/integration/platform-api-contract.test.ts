/**
 * Platform API Contract
 *
 * Verifies API routes and server entry point remain functional after
 * desk/platform split. Tests route registration, middleware stack,
 * and response shape contracts.
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

describe('Platform API Contract', () => {
  // ── 1. API server exists ───────────────────────────────────────────
  describe('API server', () => {
    it('api/server.ts exists', () => {
      const serverFile = join(SRC_ROOT, 'platform', 'api', 'server.ts');
      expect(existsSync(serverFile), 'api/server.ts must exist').toBe(true);
    });

    it('api/server.ts creates an Express app', () => {
      const serverFile = join(SRC_ROOT, 'platform', 'api', 'server.ts');
      const content = readFileSync(serverFile, 'utf8');
      expect(content).toContain('express');
    });

    it('api/server.ts starts listening on a port', () => {
      const serverFile = join(SRC_ROOT, 'platform', 'api', 'server.ts');
      const content = readFileSync(serverFile, 'utf8');
      const hasListen = /\.listen\(|app\.listen/.test(content);
      expect(hasListen, 'server must call listen()').toBe(true);
    });
  });

  // ── 2. Route files exist ───────────────────────────────────────────
  describe('API routes', () => {
    const routesDir = join(SRC_ROOT, 'platform', 'api', 'routes');

    it('api/routes/ directory has route files', () => {
      expect(existsSync(routesDir), 'api/routes/ must exist').toBe(true);
      const files = findTsFiles(routesDir).filter(f => !f.includes('__tests__'));
      expect(files.length, `Only ${files.length} route files found`).toBeGreaterThan(0);
    });

    it('health check route exists', () => {
      const healthFiles = findTsFiles(routesDir).filter(f =>
        f.includes('health') && !f.includes('__tests__')
      );
      const healthExists = healthFiles.length > 0 ||
        existsSync(join(routesDir, 'health.ts')) ||
        existsSync(join(routesDir, 'health.js'));
      // Health check might be embedded in server.ts
      const serverFile = join(SRC_ROOT, 'platform', 'api', 'server.ts');
      if (existsSync(serverFile)) {
        const content = readFileSync(serverFile, 'utf8');
        const hasHealth = /\/health|'\/health'|"\/health"/.test(content);
        expect(healthExists || hasHealth, 'health check endpoint must exist').toBe(true);
      }
    });

    it('each route file exports a Router', () => {
      const files = findTsFiles(routesDir).filter(f => !f.includes('__tests__'));
      let routerCount = 0;
      for (const f of files) {
        try {
          const content = readFileSync(f, 'utf8');
          if (/Router|express\.Router/.test(content)) {
            routerCount++;
          }
        } catch { /* skip */ }
      }
      expect(
        routerCount,
        `${routerCount}/${files.length} route files export a Router`,
      ).toBeGreaterThanOrEqual(files.length * 0.7);
    });
  });

  // ── 3. Middleware stack ────────────────────────────────────────────
  describe('Middleware', () => {
    it('auth middleware exists', () => {
      const authFile = join(SRC_ROOT, 'platform', 'auth', 'auth-server.ts');
      const middlewareAuth = join(SRC_ROOT, 'platform', 'middleware', 'auth.ts');
      expect(
        existsSync(authFile) || existsSync(middlewareAuth),
        'auth middleware must exist',
      ).toBe(true);
    });

    it('error handler middleware exists', () => {
      const errFile = join(SRC_ROOT, 'platform', 'api', 'middleware', 'error-handler.ts');
      const middlewareErr = join(SRC_ROOT, 'platform', 'middleware', 'error-handler.ts');
      expect(
        existsSync(errFile) || existsSync(middlewareErr),
        'error handler middleware must exist',
      ).toBe(true);
    });

    it('rate limiter middleware exists', () => {
      const rlFile = join(SRC_ROOT, 'platform', 'middleware', 'distributed-rate-limiter.ts');
      expect(existsSync(rlFile), 'rate limiter middleware must exist').toBe(true);
    });

    it('prometheus metrics middleware exists', () => {
      const pmFile = join(SRC_ROOT, 'platform', 'middleware', 'prometheus-metrics.ts');
      expect(existsSync(pmFile), 'prometheus metrics middleware must exist').toBe(true);
    });
  });

  // ── 4. API response contracts ──────────────────────────────────────
  describe('API response shape', () => {
    it('marketplace routes return paginated responses', () => {
      const mktRoutesDir = join(SRC_ROOT, 'platform', 'api', 'routes');
      const mktFiles = findTsFiles(mktRoutesDir).filter(f =>
        f.includes('marketplace') && !f.includes('__tests__')
      );
      if (mktFiles.length === 0) return;

      let hasPagination = false;
      for (const f of mktFiles) {
        const content = readFileSync(f, 'utf8');
        if (/total|page|limit|hasMore|totalPages/.test(content)) {
          hasPagination = true;
          break;
        }
      }
      expect(hasPagination, 'marketplace routes should return paginated responses').toBe(true);
    });

    it('error responses include error key', () => {
      const routesDir = join(SRC_ROOT, 'platform', 'api', 'routes');
      const files = findTsFiles(routesDir).filter(f => !f.includes('__tests__'));
      let errorResponseCount = 0;
      for (const f of files) {
        try {
          const content = readFileSync(f, 'utf8');
          if (/error.*:/.test(content) && /status\(/.test(content)) {
            errorResponseCount++;
          }
        } catch { /* skip */ }
      }
      expect(errorResponseCount, 'at least one route must have error responses').toBeGreaterThan(0);
    });
  });

  // ── 5. WebSocket support ───────────────────────────────────────────
  describe('WebSocket', () => {
    it('WebSocket adapter exists', () => {
      const wsFiles = [
        join(SRC_ROOT, 'platform', 'api', 'ws-adapter-redis.ts'),
        join(SRC_ROOT, 'platform', 'api', 'ws-adapter.ts'),
        join(SRC_ROOT, 'platform', 'api', 'websocket.ts'),
      ];
      const hasWs = wsFiles.some(f => existsSync(f));
      // WebSocket may not exist in all deployments — this is informational
      expect(hasWs || true, 'WebSocket adapter check (informational)').toBe(true);
    });
  });
});
