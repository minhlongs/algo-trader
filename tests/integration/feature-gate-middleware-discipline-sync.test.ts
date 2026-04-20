/**
 * Feature-gate tier-based access-control discipline 10-invariant sync —
 * first tier-ordinal-ranking substrate edge.
 *
 * `src/middleware/feature-gate.ts` is the Express-layer policy enforcer
 * that gates routes by license tier. Drift manifests as:
 *   - TIER_HIERARCHY reordered (PRO > ENTERPRISE) → premium users locked
 *     out of enterprise routes (revenue leak + support escalation)
 *   - FEATURE_ACCESS registry silently loses an entry → downgraded
 *     feature becomes FREE-accessible (silent license-tier bypass)
 *   - requireTier returns 200 instead of 401 on missing license → auth
 *     bypass regression
 *   - 401 vs 403 status drift → client retry logic diverges (401 = refresh
 *     token, 403 = upgrade flow — swapping triggers wrong CTA)
 *   - canAccessFeature returns false for unregistered key → new features
 *     silently blocked during rollout (opt-in-by-default regression)
 *   - Upgrade-hint string dropped from 403 payload → UX breaks: user
 *     sees "Insufficient tier" but no path forward
 *
 * Unlike the 66 prior edges (50 families):
 *   - #186 Express security middleware MOUNT (server setup, not policy)
 *   - #209 Fastify admin-auth API-KEY gate (framework = Fastify,
 *     mechanism = shared-secret Set lookup)
 *   - #197 Qwen live-eligibility gate (paper-gate substrate, NODE_ENV +
 *     OPERATOR_CONFIRM coupling, not license-tier)
 *   - #195 admin Qwen kill-switch (binary on/off, not ordinal-tier)
 *   - **NEW family #51: TIER-ORDINAL-RANKING ACCESS CONTROL.** First
 *     Express-layer tier-based policy substrate. Distinct because:
 *     ordinal ranking (not binary), registry-driven feature-to-tier
 *     mapping (not hard-coded paths), dual 401/403 semantics
 *     (missing vs insufficient, each with distinct client behaviour).
 *
 * The invariant is declared across 1 file x 10 invariant axes:
 *
 *   1. **File exists + parses** — sanity floor.
 *   2. **Express type triple import** — Request + Response + NextFunction
 *      from 'express' (type-only).
 *   3. **Express.Request augmentation** — `declare global { namespace
 *      Express { interface Request { license?: License } } }` so upstream
 *      raas-gate middleware can attach license without a cast.
 *   4. **TIER_HIERARCHY ordinal monotonic** — FREE=0 < PRO=1 < ENTERPRISE=2.
 *      Reordering flips privilege semantics.
 *   5. **FEATURE_ACCESS registry coherence** — every value is one of
 *      {FREE, PRO, ENTERPRISE}; the 7 canonical feature keys all present.
 *   6. **canAccessFeature open-default** — unregistered feature returns
 *      true (FREE-accessible by default to prevent silent rollout block).
 *   7. **requireTier 401 on missing license** — no license ⇒ 401 with
 *      `{ error: 'No license' }`.
 *   8. **requireTier 403 on insufficient tier** — license present but
 *      lower than minTier ⇒ 403 with `{ error, required, current,
 *      upgrade }` (upgrade-hint MANDATORY for UX contract).
 *   9. **requireFeature delegates via FEATURE_ACCESS lookup** — returns
 *      requireTier(FEATURE_ACCESS[feature] ?? 'FREE'), preserving the
 *      open-default fallback from axis 6.
 *  10. **4 required exports** — FEATURE_ACCESS + canAccessFeature +
 *      requireTier + requireFeature (the public policy surface).
 *
 * Novel invariants locked (family #51):
 *   - **Ordinal-tier monotonicity** — numeric ranking MUST be strictly
 *     increasing; equal ranks or inversions collapse access semantics.
 *   - **Open-default for unregistered features** — canAccessFeature
 *     returns true for unknown keys (prevents silent rollout regression).
 *   - **401/403 semantic split** — missing vs insufficient routed to
 *     distinct status codes + distinct client flows (token refresh vs
 *     upgrade prompt).
 *   - **Upgrade-hint UX contract** — 403 payload MUST expose `upgrade`
 *     string for frontend CTA wiring.
 *
 * Drift scenarios covered:
 *   - TIER_HIERARCHY values swapped → case 4 fails.
 *   - FEATURE_ACCESS loses a key → case 5 fails (registry completeness).
 *   - canAccessFeature flips to false-default → case 6 fails.
 *   - 401 replaced by 200/500 → case 7 fails.
 *   - 403 drops `upgrade` field → case 8 fails.
 *   - requireFeature uses hardcoded tier → case 9 fails.
 *
 * Symmetric to prior integrity edges:
 *   #186 Express security middleware mount (server-boot layer);
 *   #209 Fastify admin-auth API-key gate (Fastify layer, shared-secret).
 *   This edge is the Express-layer tier-policy complement — three
 *   HTTP-framework gates now locked across frameworks + mechanisms.
 *
 * Opens the **67th integrity edge — HEPTAHEXACONTAGON** (67-gon, 67
 * prime + lucky prime). First tier-ordinal-ranking access-control
 * substrate. Novel family #51. Integrity hexahexacontagon ->
 * heptahexacontagon (67-gon).
 *
 * Non-goals: license-parse format (Zod schema elsewhere); tier
 * upgrade flow (billing surface); feature-flag A/B rollout (separate
 * registry); token refresh mechanism (auth layer).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const FEATURE_GATE_FILE = resolve(REPO_ROOT, 'src/middleware/feature-gate.ts');

const CANONICAL_FEATURE_KEYS = [
  'signals.crossmarket',
  'signals.deltaneutral',
  'intelligence.semantic',
  'intelligence.swarm',
  'analytics.advanced',
  'execution.multileg',
  'vibe.controller',
];

const REQUIRED_EXPORTS = {
  const: ['FEATURE_ACCESS'],
  fn: ['canAccessFeature', 'requireTier', 'requireFeature'],
};

function readFeatureGate(): string {
  return readFileSync(FEATURE_GATE_FILE, 'utf8');
}

describe('Feature-gate tier-access discipline — 67th edge (HEPTAHEXACONTAGON)', () => {
  const src = readFeatureGate();

  it('feature-gate.ts exists and is non-empty (sanity floor)', () => {
    expect(src.length).toBeGreaterThan(500);
  });

  it('Express type triple import: Request + Response + NextFunction', () => {
    expect(
      /import\s+type\s+\{[\s\S]*?Request[\s\S]*?Response[\s\S]*?NextFunction[\s\S]*?\}\s+from\s+['"]express['"]/.test(
        src,
      ),
      'must type-import Request + Response + NextFunction from express',
    ).toBe(true);
  });

  it('Express.Request augmentation exposes license?: License', () => {
    expect(
      /declare\s+global\s*\{[\s\S]*?namespace\s+Express\s*\{[\s\S]*?interface\s+Request\s*\{[\s\S]*?license\?\s*:\s*License/.test(
        src,
      ),
      'global Express.Request augmentation with optional license required for upstream raas-gate',
    ).toBe(true);
  });

  it('TIER_HIERARCHY ordinal monotonic: FREE=0 < PRO=1 < ENTERPRISE=2', () => {
    const free = src.match(/FREE\s*:\s*([0-9]+)/);
    const pro = src.match(/PRO\s*:\s*([0-9]+)/);
    const ent = src.match(/ENTERPRISE\s*:\s*([0-9]+)/);
    expect(free, 'TIER_HIERARCHY.FREE missing').not.toBeNull();
    expect(pro, 'TIER_HIERARCHY.PRO missing').not.toBeNull();
    expect(ent, 'TIER_HIERARCHY.ENTERPRISE missing').not.toBeNull();
    if (free && pro && ent) {
      const f = parseInt(free[1], 10);
      const p = parseInt(pro[1], 10);
      const e = parseInt(ent[1], 10);
      expect(f, `FREE must be 0, got ${f}`).toBe(0);
      expect(p, `PRO must be 1, got ${p}`).toBe(1);
      expect(e, `ENTERPRISE must be 2, got ${e}`).toBe(2);
      expect(
        f < p && p < e,
        `monotonic invariant broken: FREE=${f} PRO=${p} ENTERPRISE=${e}`,
      ).toBe(true);
    }
  });

  it('FEATURE_ACCESS registry completeness: 7 canonical keys + valid tiers', () => {
    expect(
      /export\s+const\s+FEATURE_ACCESS\s*:\s*Record<string\s*,\s*Tier>\s*=\s*\{/.test(src),
      "FEATURE_ACCESS must be `export const FEATURE_ACCESS: Record<string, Tier>`",
    ).toBe(true);
    for (const key of CANONICAL_FEATURE_KEYS) {
      const re = new RegExp(`['"]${key.replace('.', '\\.')}['"]\\s*:\\s*['"](FREE|PRO|ENTERPRISE)['"]`);
      expect(re.test(src), `FEATURE_ACCESS missing canonical key '${key}' with valid tier`).toBe(true);
    }
    const accessBlock = src.match(/FEATURE_ACCESS[\s\S]*?=\s*\{([\s\S]*?)\}/);
    expect(accessBlock, 'FEATURE_ACCESS block could not be extracted').not.toBeNull();
    if (accessBlock) {
      const tierValues = accessBlock[1].match(/['"](?:FREE|PRO|ENTERPRISE|[A-Z_]+)['"]\s*[,\n}]/g) || [];
      for (const v of tierValues) {
        expect(
          /['"](?:FREE|PRO|ENTERPRISE)['"]/.test(v),
          `FEATURE_ACCESS contains non-canonical tier value: ${v}`,
        ).toBe(true);
      }
    }
  });

  it('canAccessFeature open-default: unregistered feature returns true', () => {
    expect(
      /export\s+function\s+canAccessFeature\s*\(\s*feature\s*:\s*string\s*,\s*tier\s*:\s*Tier\s*\)\s*:\s*boolean/.test(
        src,
      ),
      'canAccessFeature signature must be `(feature: string, tier: Tier): boolean`',
    ).toBe(true);
    expect(
      /const\s+required\s*=\s*FEATURE_ACCESS\[\s*feature\s*\]\s*;?\s*[\s\S]*?if\s*\(\s*!required\s*\)\s*return\s+true\b/.test(
        src,
      ),
      'unregistered feature MUST early-return true (open-default prevents silent rollout block)',
    ).toBe(true);
  });

  it('requireTier 401 on missing license with { error: "No license" }', () => {
    expect(
      /if\s*\(\s*!license\s*\)\s*\{[\s\S]*?res\.status\(\s*401\s*\)\.json\(\s*\{\s*error\s*:\s*['"]No license['"]/.test(
        src,
      ),
      'missing-license branch must `res.status(401).json({ error: "No license" })`',
    ).toBe(true);
  });

  it('requireTier 403 on insufficient tier with upgrade-hint payload', () => {
    expect(
      /if\s*\(\s*userTierLevel\s*<\s*requiredLevel\s*\)\s*\{[\s\S]*?res\.status\(\s*403\s*\)\.json\(\s*\{[\s\S]*?error[\s\S]*?required[\s\S]*?current[\s\S]*?upgrade/.test(
        src,
      ),
      '403 payload must contain { error, required, current, upgrade } — upgrade-hint is UX contract',
    ).toBe(true);
  });

  it('requireFeature delegates via FEATURE_ACCESS lookup with FREE fallback', () => {
    expect(
      /export\s+function\s+requireFeature\s*\(\s*feature\s*:\s*string\s*\)/.test(src),
      'requireFeature must be exported `(feature: string)` factory',
    ).toBe(true);
    expect(
      /const\s+requiredTier\s*:\s*Tier\s*=\s*FEATURE_ACCESS\[\s*feature\s*\]\s*\?\?\s*['"]FREE['"]/.test(
        src,
      ),
      'requireFeature must resolve tier via `FEATURE_ACCESS[feature] ?? "FREE"` — preserves open-default',
    ).toBe(true);
    expect(
      /return\s+requireTier\(\s*requiredTier\s*\)/.test(src),
      'requireFeature must delegate to requireTier (no hardcoded tier)',
    ).toBe(true);
  });

  it('required exports present (FEATURE_ACCESS + canAccessFeature + requireTier + requireFeature)', () => {
    const missingConst = REQUIRED_EXPORTS.const.filter((name) => {
      const re = new RegExp(`export\\s+const\\s+${name}\\b`);
      return !re.test(src);
    });
    const missingFn = REQUIRED_EXPORTS.fn.filter((name) => {
      const re = new RegExp(`export\\s+function\\s+${name}\\b`);
      return !re.test(src);
    });
    expect(missingConst, `missing const exports: ${missingConst.join(', ')}`).toEqual([]);
    expect(missingFn, `missing function exports: ${missingFn.join(', ')}`).toEqual([]);
  });

  it('composite: 10 axes hold simultaneously (feature-gate coherence)', () => {
    expect(
      /import\s+type\s+\{[\s\S]*?Request[\s\S]*?Response[\s\S]*?NextFunction[\s\S]*?\}\s+from\s+['"]express['"]/.test(
        src,
      ),
    ).toBe(true);
    expect(/namespace\s+Express\s*\{[\s\S]*?interface\s+Request[\s\S]*?license\?\s*:\s*License/.test(src)).toBe(true);
    const f = parseInt((src.match(/FREE\s*:\s*([0-9]+)/) || ['', '-1'])[1], 10);
    const p = parseInt((src.match(/PRO\s*:\s*([0-9]+)/) || ['', '-1'])[1], 10);
    const e = parseInt((src.match(/ENTERPRISE\s*:\s*([0-9]+)/) || ['', '-1'])[1], 10);
    expect(f === 0 && p === 1 && e === 2).toBe(true);
    for (const key of CANONICAL_FEATURE_KEYS) {
      expect(
        new RegExp(`['"]${key.replace('.', '\\.')}['"]\\s*:\\s*['"](FREE|PRO|ENTERPRISE)['"]`).test(src),
        `composite: FEATURE_ACCESS missing '${key}'`,
      ).toBe(true);
    }
    expect(/if\s*\(\s*!required\s*\)\s*return\s+true\b/.test(src)).toBe(true);
    expect(/res\.status\(\s*401\s*\)\.json\(\s*\{\s*error\s*:\s*['"]No license['"]/.test(src)).toBe(true);
    expect(/res\.status\(\s*403\s*\)\.json\(\s*\{[\s\S]*?upgrade/.test(src)).toBe(true);
    expect(/FEATURE_ACCESS\[\s*feature\s*\]\s*\?\?\s*['"]FREE['"]/.test(src)).toBe(true);
    for (const name of REQUIRED_EXPORTS.fn) {
      expect(
        new RegExp(`export\\s+function\\s+${name}\\b`).test(src),
        `composite: missing function export ${name}`,
      ).toBe(true);
    }
    for (const name of REQUIRED_EXPORTS.const) {
      expect(
        new RegExp(`export\\s+const\\s+${name}\\b`).test(src),
        `composite: missing const export ${name}`,
      ).toBe(true);
    }
  });
});
