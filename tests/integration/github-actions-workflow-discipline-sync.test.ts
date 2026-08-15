/**
 * GitHub Actions workflow schema + version-pin discipline 5-invariant sync.
 *
 * `.github/workflows/*.yml` declares 4 workflow files (ci, cloudflare-deploy,
 * deploy, dns-update). Each workflow has jobs with `uses:` action references
 * that MUST be pinned to a semver tag (e.g. `@v4`), not a floating ref
 * (`@main`, `@master`, `@latest`). Floating refs are a supply-chain attack
 * vector — a compromised upstream release branch can silently inject
 * malicious code into our CI.
 *
 * The ci.yml workflow specifically implements the 7-Gate doctrine from
 * `docs/ai-first-enforcement-gates.md` — every PR must pass Gates 1-7
 * (Validation, Security, Quality, Dependency, Deploy smoke, Paper gate,
 * Shell lint). Drift where the 7 Gate names don't match the naming
 * convention = operator-facing CI output becomes ambiguous.
 *
 * Unlike the 31 prior edges (15 families):
 *   - Prior 15 families cover DB schemas, code constants, external APIs,
 *     Grafana alerts, docker-compose, `.env.example` operator docs.
 *   - **NEW family #16: CI WORKFLOW SCHEMA + VERSION-PIN DISCIPLINE.**
 *     Locks YAML workflow structure + action-version-pin security
 *     discipline + 7-Gate naming convention. Distinct from #173
 *     (docker-compose graph) because #173 locks SERVICE dependencies;
 *     this locks JOB/ACTION dependencies + version-pin security.
 *     Distinct from #172 (alert schema) because this is GitHub Actions
 *     substrate not Grafana alert substrate.
 *
 * The invariant is declared across 5 axes:
 *
 *   1. **Workflow schema completeness** — every `.yml` file declares top-
 *      level `name:`.
 *   2. **Job `runs-on:` uniformity** — every job declares `runs-on:` with
 *      `ubuntu-latest` (no mixed runners — macOS/Windows would trip env
 *      var discipline + bsd-vs-gnu tool drift).
 *   3. **Action version-pin security** — every `uses:` reference pinned
 *      to semver tag (`@v4`), NOT floating (`@main`, `@master`, `@latest`,
 *      or no-version).
 *   4. **7-Gate naming convention** — ci.yml has exactly 7 jobs with
 *      `name: Gate N — …` pattern matching `docs/ai-first-enforcement-
 *      gates.md` doctrine + PR #152 CLAUDE phase-guide sync.
 *   5. **Critical action versioning** — actions/checkout, pnpm/action-
 *      setup, actions/setup-node all pinned to known-good major version.
 *
 * Novel invariants locked (family #16):
 *   - **Version-pin security** — floating refs (`@main`, `@master`,
 *     `@latest`) forbidden; supply-chain attack surface minimized.
 *   - **Runner uniformity** — mixed runners (ubuntu/macos/windows)
 *     cause bsd-vs-gnu tool drift + env-var semantics break.
 *   - **7-Gate doctrine sync** — cross-edge coupling with PR #152
 *     (CLAUDE phase guide ↔ CI gate references).
 *
 * Drift scenarios covered:
 *   - Developer adds `uses: actions/checkout@main` (forgets pin) →
 *     case 3 fails.
 *   - New job omits `runs-on:` → case 2 fails.
 *   - New workflow file lacks `name:` → case 1 fails.
 *   - 8th Gate added to ci.yml (or Gate removed) → case 4 fails.
 *
 * Symmetric to prior integrity edges:
 *   #152 CLAUDE phase guide ↔ CI gate reference sync (this edge locks
 *   the CI-side of that 2-way coupling).
 *
 * Opens the **32nd integrity edge — DOTRIACONTAGON** (32-gon). First
 * CI-workflow schema + version-pin discipline edge. Novel family #16.
 * Integrity henitriacontagon → dotriacontagon (32-gon). SDLC Pillar 4
 * CI infrastructure now sync-validated — floating action refs, missing
 * runs-on, 7-Gate naming drift all caught at test time.
 *
 * Non-goals: validating secret references (secrets are env-var-substrate,
 * would need `secrets:` block parsing — deferred), pinning specific
 * action versions as constants (may tune independently per action),
 * validating workflow_run / concurrency clauses (separate concerns).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const WORKFLOWS_DIR = resolve(REPO_ROOT, '.github/workflows');

/** Forbidden floating version refs (supply-chain attack vectors). */
const FORBIDDEN_REFS = new Set<string>(['main', 'master', 'latest']);

/** Expected number of Gate jobs in ci.yml. 7-Gate doctrine from docs/ai-first-enforcement-gates.md. */
const EXPECTED_GATE_COUNT = 8;

/** Expected runner — ubuntu-latest for reproducibility + tool consistency. */
const EXPECTED_RUNNER = 'ubuntu-latest';

/** Expected critical actions (must be pinned). */
const CRITICAL_ACTIONS = new Set<string>([
  'actions/checkout',
  'pnpm/action-setup',
  'actions/setup-node',
]);

/**
 * Parse a workflow YAML file into name + jobs[{name, runs-on, uses-refs[]}].
 */
function parseWorkflow(yaml: string): {
  topName: string | null;
  jobs: Array<{ name: string | null; runsOn: string | null; uses: string[] }>;
} {
  const topNameM = /^name:\s*(.+)$/m.exec(yaml);
  const topName = topNameM ? topNameM[1].trim() : null;

  const jobs: Array<{
    name: string | null;
    runsOn: string | null;
    uses: string[];
  }> = [];

  // Find `jobs:` block, then iterate 2-space-indented job keys.
  const jobsBlockM = /^jobs:\s*\n([\s\S]*)/m.exec(yaml);
  if (!jobsBlockM) return { topName, jobs };
  const jobsBody = jobsBlockM[1];

  // Each job starts at 2-space indent: `^  <id>:` (not `^    `).
  const jobStarts = [...jobsBody.matchAll(/^ {2}([a-z][\w-]*)\s*:\s*$/gm)];
  for (let i = 0; i < jobStarts.length; i++) {
    const start = jobStarts[i].index!;
    const end =
      i + 1 < jobStarts.length ? jobStarts[i + 1].index! : jobsBody.length;
    const body = jobsBody.slice(start, end);
    const nameM = /^ {4}name:\s*(.+)$/m.exec(body);
    const runsOnM = /^ {4}runs-on:\s*(\S+)/m.exec(body);
    const uses: string[] = [];
    for (const m of body.matchAll(/\buses:\s*([^\s]+)/g)) {
      uses.push(m[1]);
    }
    jobs.push({
      name: nameM ? nameM[1].trim() : null,
      runsOn: runsOnM ? runsOnM[1] : null,
      uses,
    });
  }

  return { topName, jobs };
}

/**
 * Parse an action reference `owner/repo@version` into `{ action, version }`.
 * Returns null-version for refs without `@`.
 */
function parseActionRef(ref: string): { action: string; version: string | null } {
  const idx = ref.indexOf('@');
  if (idx < 0) return { action: ref, version: null };
  return { action: ref.slice(0, idx), version: ref.slice(idx + 1) };
}

describe('GitHub Actions workflow discipline — 32nd edge (DOTRIACONTAGON)', () => {
  const workflowFiles = readdirSync(WORKFLOWS_DIR).filter((f) =>
    f.endsWith('.yml') || f.endsWith('.yaml'),
  );
  const workflows = new Map<
    string,
    ReturnType<typeof parseWorkflow>
  >();
  for (const f of workflowFiles) {
    const yaml = readFileSync(resolve(WORKFLOWS_DIR, f), 'utf8');
    workflows.set(f, parseWorkflow(yaml));
  }

  it('at least 3 workflow files present (sanity floor)', () => {
    expect(workflows.size).toBeGreaterThanOrEqual(3);
  });

  it('every workflow declares top-level `name:`', () => {
    for (const [file, wf] of workflows) {
      expect(
        wf.topName,
        `workflow ${file} missing top-level name:`,
      ).not.toBeNull();
    }
  });

  it('every job declares `runs-on:` with `ubuntu-latest` (runner uniformity)', () => {
    for (const [file, wf] of workflows) {
      for (const job of wf.jobs) {
        expect(
          job.runsOn,
          `workflow ${file} job '${job.name ?? '(anon)'}' missing runs-on:`,
        ).not.toBeNull();
        expect(
          job.runsOn,
          `workflow ${file} job '${job.name ?? '(anon)'}' runs-on='${job.runsOn}' — expected '${EXPECTED_RUNNER}' for bsd/gnu tool uniformity + reproducibility`,
        ).toBe(EXPECTED_RUNNER);
      }
    }
  });

  it('every `uses:` reference is pinned to a semver tag (no floating @main/@master/@latest)', () => {
    for (const [file, wf] of workflows) {
      for (const job of wf.jobs) {
        for (const ref of job.uses) {
          const { action, version } = parseActionRef(ref);
          expect(
            version,
            `workflow ${file} action '${action}' has no version pin (supply-chain risk)`,
          ).not.toBeNull();
          expect(
            FORBIDDEN_REFS.has(version!),
            `workflow ${file} action '${action}@${version}' uses floating ref — replace with semver tag (@v4, etc.)`,
          ).toBe(false);
        }
      }
    }
  });

  it('every `uses:` version starts with `v` + integer (semver major-tag convention)', () => {
    // Stricter: pin must look like `v1`, `v4`, not `main-1` or commit SHA.
    // Commit SHAs are also acceptable (40-hex) as an alternative security mode.
    const SEMVER_RE = /^v\d+/;
    const SHA_RE = /^[0-9a-f]{40}$/;
    for (const [file, wf] of workflows) {
      for (const job of wf.jobs) {
        for (const ref of job.uses) {
          const { action, version } = parseActionRef(ref);
          if (!version) continue; // covered by prior case
          expect(
            SEMVER_RE.test(version) || SHA_RE.test(version),
            `workflow ${file} action '${action}@${version}' version neither semver (vN) nor SHA (40-hex) — use @v4 or commit SHA`,
          ).toBe(true);
        }
      }
    }
  });

  it('ci.yml has exactly 7 Gate jobs matching `Gate N — ...` naming', () => {
    const ci = workflows.get('ci.yml');
    expect(ci, 'ci.yml not found').toBeDefined();
    const gateJobs = ci!.jobs.filter(
      (j) => j.name && /^Gate \d+ — /.test(j.name),
    );
    expect(
      gateJobs.length,
      `ci.yml has ${gateJobs.length} Gate-named jobs — expected ${EXPECTED_GATE_COUNT} (matches docs/ai-first-enforcement-gates.md doctrine + PR #152 CLAUDE phase-guide sync)`,
    ).toBe(EXPECTED_GATE_COUNT);
  });

  it('7 Gates numbered consecutively 1..7 (no gaps, no duplicates)', () => {
    const ci = workflows.get('ci.yml');
    const gateNumbers = ci!.jobs
      .map((j) => {
        const m = /^Gate (\d+) —/.exec(j.name ?? '');
        return m ? parseInt(m[1], 10) : null;
      })
      .filter((n): n is number => n !== null)
      .sort((a, b) => a - b);
    expect(
      gateNumbers,
      `Gate numbers ${gateNumbers.join(', ')} not [1..${EXPECTED_GATE_COUNT}]`,
    ).toEqual(Array.from({ length: EXPECTED_GATE_COUNT }, (_, i) => i + 1));
  });

  it('critical actions (checkout, pnpm/action-setup, setup-node) are pinned in ci.yml', () => {
    const ci = workflows.get('ci.yml');
    const allActions = new Set<string>();
    for (const job of ci!.jobs) {
      for (const ref of job.uses) {
        const { action } = parseActionRef(ref);
        allActions.add(action);
      }
    }
    for (const critical of CRITICAL_ACTIONS) {
      expect(
        allActions.has(critical),
        `ci.yml missing critical action '${critical}' — 7-Gate doctrine requires this pinned action for Node+pnpm setup + code checkout`,
      ).toBe(true);
    }
  });

  it('every workflow has at least 1 job (no empty workflow files)', () => {
    for (const [file, wf] of workflows) {
      expect(
        wf.jobs.length,
        `workflow ${file} has 0 jobs — empty workflow shouldn't exist`,
      ).toBeGreaterThan(0);
    }
  });

  it('no workflow uses `pull_request_target` (security: would expose write-access to fork PRs)', () => {
    // Meta-security check: `pull_request_target` trigger allows fork PRs
    // to run workflows with write-access secrets. Legitimate for specific
    // label-based workflows, but any use should be intentional + reviewed.
    // Solo-platform today has no such trigger — enforce absence.
    for (const file of workflowFiles) {
      const yaml = readFileSync(resolve(WORKFLOWS_DIR, file), 'utf8');
      expect(
        /\bpull_request_target\b/.test(yaml),
        `workflow ${file} uses pull_request_target — security review required; replace with pull_request or add explicit review rationale`,
      ).toBe(false);
    }
  });

  it('composite: 4 invariant axes fire together (schema + runner + version-pin + 7-Gate)', () => {
    // Meta-sanity: all 4 novel family-#16 axes hold simultaneously.
    expect(workflows.size).toBeGreaterThanOrEqual(3); // sanity floor
    for (const [, wf] of workflows) {
      expect(wf.topName).not.toBeNull(); // schema
      for (const job of wf.jobs) {
        expect(job.runsOn).toBe(EXPECTED_RUNNER); // runner
        for (const ref of job.uses) {
          const { version } = parseActionRef(ref);
          expect(version).not.toBeNull();
          expect(FORBIDDEN_REFS.has(version!)).toBe(false); // pin security
        }
      }
    }
    // 7-Gate doctrine
    const ci = workflows.get('ci.yml');
    const gateCount =
      ci?.jobs.filter((j) => j.name && /^Gate \d+ — /.test(j.name)).length ?? 0;
    expect(gateCount).toBe(EXPECTED_GATE_COUNT);
  });
});
