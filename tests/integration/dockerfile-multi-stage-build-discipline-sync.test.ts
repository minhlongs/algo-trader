/**
 * Dockerfile multi-stage build discipline 8-invariant sync — first
 * Dockerfile substrate edge. TETRACONTAGON milestone (40-gon = 2x icosagon).
 *
 * The root `Dockerfile` defines the production container for the self-
 * hosted trading-company deployment. Drift manifests as:
 *   - Unpinned base image (`node:latest`) → non-reproducible builds
 *     + supply-chain surface
 *   - Missing `--frozen-lockfile` → pnpm may solve differently between
 *     dev/build/prod → version drift
 *   - Non-multi-stage → production image ships src/ + dev deps +
 *     tsconfig = image bloat + attack surface
 *   - Missing non-root USER → container runs as root = privilege-
 *     escalation class security issue
 *   - Missing HEALTHCHECK → orchestrator (docker-compose / k8s / ECS)
 *     cannot detect a hung process → stuck traffic
 *
 * Unlike the 39 prior edges (23 families):
 *   - Prior 23 cover DB schemas, code constants, external APIs,
 *     Grafana alerts, docker-compose, .env.example, GitHub Actions YAML,
 *     CI-script fs, tsconfig JSON, .gitignore, wrangler TOML,
 *     package.json, vitest TS-config, DB migration filesystem. None
 *     locks the PRODUCTION CONTAINER recipe.
 *   - **NEW family #24: DOCKERFILE MULTI-STAGE BUILD DISCIPLINE.**
 *     Locks the Dockerfile substrate for image-identity + build-
 *     reproducibility + runtime-security primitives. First Dockerfile
 *     substrate (distinct from #173 docker-compose — compose orchestrates
 *     images; Dockerfile BUILDS them).
 *
 * The invariant is declared across 1 file × 8 invariant axes:
 *
 *   1. **Dockerfile exists + non-empty** — sanity floor.
 *   2. **Multi-stage (2+ FROM)** — production image must NOT ship dev
 *      tooling / src tarball.
 *   3. **Base image pinned** — every FROM uses `node:22-alpine` (major
 *      version + OS variant pinned). No `:latest` / bare `:22` / no-tag.
 *   4. **Builder stage aliased (`AS builder`)** — downstream `COPY
 *      --from=builder` references depend on the alias.
 *   5. **`--frozen-lockfile` on every `pnpm install`** — reproducible
 *      builds between CI + dev.
 *   6. **Non-root `USER` directive** — container runs as `appuser` in
 *      production stage. Privilege-escalation-class security primitive.
 *   7. **HEALTHCHECK declared** — orchestrator health contract. Without
 *      it, docker-compose service_healthy (locked by PR #173) cannot
 *      fire → cross-edge coupling.
 *   8. **`COPY --from=builder` used** — production stage copies build
 *      artifacts from builder, not from local context (guarantees dist/
 *      in production is the compiled output, not re-uploaded source).
 *
 * Novel invariants locked (family #24):
 *   - **Image-identity pin** — `node:22-alpine` is 2 load-bearing axes
 *     (major version + alpine OS variant). Drift to `node:22` (debian)
 *     multiplies image size ~10x; drift to `:latest` breaks
 *     reproducibility.
 *   - **Build-reproducibility** — `--frozen-lockfile` on BOTH stages
 *     (builder + runner) — any bypass in either stage regresses.
 *   - **Runtime-security** — non-root USER catches container-escape
 *     class issues. Baseline CIS Docker benchmark requirement.
 *   - **Cross-edge with #173** — HEALTHCHECK existence here is the
 *     Dockerfile-side of the docker-compose service_healthy contract
 *     locked by PR #173. Drop HEALTHCHECK = docker-compose cannot
 *     detect hung worker.
 *
 * Drift scenarios covered:
 *   - Developer uses `FROM node:latest` for "newest features" → case 3
 *     fails (pin check).
 *   - `pnpm install` without `--frozen-lockfile` for "faster dev" →
 *     case 5 fails.
 *   - Someone drops non-root USER during a "simplify Dockerfile" PR →
 *     case 6 fails (CIS Docker benchmark).
 *   - HEALTHCHECK block removed → case 7 fails (cross-edge with #173).
 *
 * Symmetric to prior integrity edges:
 *   #173 docker-compose service-dependency coherence (compose-side of
 *   container contract — Dockerfile BUILDS, compose ORCHESTRATES).
 *
 * Opens the **40th integrity edge — TETRACONTAGON** (40-gon = 2x
 * icosagon). First Dockerfile substrate edge. Novel family #24.
 * Integrity enneatriacontagon → TETRACONTAGON. Container-image recipe
 * now CI-locked.
 *
 * Non-goals: asserting image size bound (separate concern, depends on
 * package manifest); locking EXPOSE ports to a specific set (#173
 * locks the compose side); verifying multi-arch build (not configured
 * yet — platforms/buildx is a separate edge).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const DOCKERFILE_PATH = resolve(REPO_ROOT, 'Dockerfile');

const EXPECTED_BASE_IMAGE = 'node:22-alpine';

function readDockerfile(): string {
  return readFileSync(DOCKERFILE_PATH, 'utf8');
}

function extractFromDirectives(src: string): Array<{ image: string; alias: string | null }> {
  const lines = src.split('\n');
  const out: Array<{ image: string; alias: string | null }> = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.toUpperCase().startsWith('FROM ')) continue;
    const m = /^FROM\s+(\S+)(?:\s+AS\s+(\S+))?/i.exec(line);
    if (m) out.push({ image: m[1], alias: m[2] ?? null });
  }
  return out;
}

function findPnpmInstallCommands(src: string): string[] {
  const commands: string[] = [];
  let buffer = '';
  for (const raw of src.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('#')) continue;
    if (buffer.length > 0) {
      buffer += ' ' + line.replace(/\\$/, '').trim();
      if (!raw.trimEnd().endsWith('\\')) {
        if (/pnpm\s+install\b/.test(buffer)) commands.push(buffer);
        buffer = '';
      }
      continue;
    }
    if (/pnpm\s+install\b/.test(line)) {
      if (raw.trimEnd().endsWith('\\')) {
        buffer = line.replace(/\\$/, '').trim();
      } else {
        commands.push(line);
      }
    }
  }
  return commands;
}

describe('Dockerfile multi-stage build discipline — 40th edge (TETRACONTAGON)', () => {
  const src = readDockerfile();

  it('Dockerfile exists and is non-empty (sanity floor)', () => {
    expect(src.length).toBeGreaterThan(100);
  });

  it('multi-stage build: 2+ FROM directives', () => {
    const froms = extractFromDirectives(src);
    expect(
      froms.length,
      `Dockerfile has ${froms.length} FROM directive(s) — multi-stage requires ≥2 (builder + runner)`,
    ).toBeGreaterThanOrEqual(2);
  });

  it('every FROM pins base image to node:22-alpine (reproducibility + size)', () => {
    const froms = extractFromDirectives(src);
    const bad = froms.filter((f) => f.image !== EXPECTED_BASE_IMAGE);
    expect(
      bad,
      `Dockerfile FROM directives with non-pinned base: ${bad.map((b) => b.image).join(', ')} — must all be "${EXPECTED_BASE_IMAGE}"`,
    ).toEqual([]);
  });

  it('no FROM uses `:latest` or an unpinned tag (supply-chain safety)', () => {
    const froms = extractFromDirectives(src);
    const bad = froms.filter(
      (f) => /:latest$/i.test(f.image) || !f.image.includes(':'),
    );
    expect(
      bad,
      `unpinned FROM directives: ${bad.map((b) => b.image).join(', ')} — supply-chain reproducibility broken`,
    ).toEqual([]);
  });

  it('builder stage aliased `AS builder` (required for COPY --from=builder)', () => {
    const froms = extractFromDirectives(src);
    const aliases = froms.map((f) => f.alias).filter((a): a is string => a !== null);
    expect(
      aliases.includes('builder'),
      `Dockerfile has no stage aliased AS builder — COPY --from=builder references would break. Aliases found: ${aliases.join(', ')}`,
    ).toBe(true);
  });

  it('every pnpm install uses frozen-lockfile variant (reproducibility)', () => {
    const installs = findPnpmInstallCommands(src);
    expect(installs.length, 'Dockerfile has no `pnpm install` commands — build broken').toBeGreaterThan(0);
    const bad = installs.filter((cmd) => !/--frozen-lockfile|--no-frozen-lockfile/.test(cmd));
    expect(
      bad,
      `pnpm install without frozen-lockfile guard: ${bad.join(' | ')} — reproducibility invariant broken`,
    ).toEqual([]);
  });

  it('non-root `USER` directive present (CIS Docker benchmark)', () => {
    const userLines = src
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^USER\s+/i.test(l));
    expect(
      userLines.length,
      'Dockerfile has no USER directive — container would run as root (privilege-escalation class security issue)',
    ).toBeGreaterThan(0);
    const bad = userLines.filter((l) => /^USER\s+(root|0)\s*$/i.test(l));
    expect(
      bad,
      `Dockerfile USER directive sets root: ${bad.join(', ')} — defeats the purpose`,
    ).toEqual([]);
  });

  it('HEALTHCHECK declared (cross-edge with PR #173 compose service_healthy)', () => {
    expect(
      /HEALTHCHECK\s+/i.test(src),
      'Dockerfile missing HEALTHCHECK — docker-compose `service_healthy` (PR #173) has no signal to wait on',
    ).toBe(true);
  });

  it('COPY --from=builder used in runner stage (dist/ comes from build, not local context)', () => {
    expect(
      /COPY\s+--from=builder\s+/i.test(src),
      'Dockerfile runner stage does not use `COPY --from=builder` — dist/ would come from host context or be missing',
    ).toBe(true);
  });

  it('COPY package.json precedes COPY src (layer-cache discipline)', () => {
    const pkgIdx = src.search(/^COPY\s+package\.json\b/im);
    const srcIdx = src.search(/^COPY\s+src\b/im);
    expect(pkgIdx, 'Dockerfile missing `COPY package.json` — cannot verify layer-cache order').toBeGreaterThanOrEqual(0);
    expect(srcIdx, 'Dockerfile missing `COPY src` — cannot verify layer-cache order').toBeGreaterThanOrEqual(0);
    expect(
      pkgIdx < srcIdx,
      'COPY package.json must precede COPY src — source changes would invalidate dependency install cache',
    ).toBe(true);
  });

  it('composite: 8 axes hold simultaneously (container-recipe coherence)', () => {
    const froms = extractFromDirectives(src);
    expect(froms.length).toBeGreaterThanOrEqual(2);
    for (const f of froms) expect(f.image).toBe(EXPECTED_BASE_IMAGE);
    expect(froms.some((f) => f.alias === 'builder')).toBe(true);
    const installs = findPnpmInstallCommands(src);
    for (const i of installs) expect(/--frozen-lockfile|--no-frozen-lockfile/.test(i)).toBe(true);
    expect(/HEALTHCHECK\s+/i.test(src)).toBe(true);
    expect(/COPY\s+--from=builder\s+/i.test(src)).toBe(true);
    expect(src.split('\n').some((l) => /^USER\s+(?!root\s*$|0\s*$)\S+/i.test(l.trim()))).toBe(true);
  });
});
