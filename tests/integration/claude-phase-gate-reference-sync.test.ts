/**
 * CLAUDE SDLC phase guide ↔ CI Gate reference sync.
 *
 * `docs/ai-first-enforcement-gates.md` is the authoritative list of CI
 * gates (Pillar 1 enforcement). Each SDLC phase guide at the repo root —
 * `CLAUDE.specification.md`, `CLAUDE.design.md`, `CLAUDE.code.md`,
 * `CLAUDE.deploy.md` — guides an AI agent through its phase and
 * references these gates by number ("Gate 3", "gates 1-4", "all 5 CI
 * gates"). When the gate list grows (e.g. Gate 6 paper-gate lock + Gate 7
 * shell lint added 2026-04-17), phase guides silently drift: an agent
 * following stale instructions won't know its spec must satisfy the new
 * gate. This test pins every numeric gate reference in a phase guide to a
 * real row of the canonical gate table.
 *
 * Symmetric to PR #132 (alert↔metric), PR #135 (dashboard↔metric),
 * PR #137 (runbook-index↔file), PR #143 (alert↔runbook URL),
 * PR #145 (doc-enum↔code-enum), PR #146 (runbook↔metric),
 * PR #148 (CLI↔route), PR #150 (CLI self-consistency). Opens a 9th edge
 * in a new territory — Pillar 4 (SDLC scaffold) ↔ Pillar 1 (enforcement
 * gates). Closes integrity octagon → nonagon.
 *
 * Non-goals: validating gate *semantics* (that gate N does what phase
 * guide says it does), cross-checking `.github/workflows/ci.yml` job
 * names (covered elsewhere), or inferring gates from free prose without
 * a numeric token.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const GATES_DOC = resolve(REPO_ROOT, 'docs/ai-first-enforcement-gates.md');

const PHASE_GUIDES = [
  'CLAUDE.specification.md',
  'CLAUDE.design.md',
  'CLAUDE.code.md',
  'CLAUDE.deploy.md',
] as const;

/**
 * Canonical gates live in a markdown table of the form:
 *   | N | Name | Hard fail | Purpose |
 * We require a leading-digit row to avoid matching the header rule `| ---- |`.
 */
const GATE_TABLE_ROW_RE = /^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|/gm;

/** "Gate 3", "gate 7" — single gate reference. */
const SINGLE_GATE_RE = /\bgates?\s+(\d+)\b/gi;

/**
 * "gates 1–5", "Gate 1-4" — inclusive range. Both hyphen and en-dash are
 * observed in the existing phase guides.
 */
const GATE_RANGE_RE = /\bgates?\s+(\d+)\s*[–-]\s*(\d+)\b/gi;

/** "all 5 CI gates", "7 CI gates" — numeric total of the gate set. */
const GATE_TOTAL_RE = /\b(\d+)\s+CI\s+gates\b/gi;

function extractCanonicalGates(md: string): Set<number> {
  const gates = new Set<number>();
  let m: RegExpExecArray | null;
  while ((m = GATE_TABLE_ROW_RE.exec(md)) !== null) {
    const name = m[2].trim();
    // Skip the markdown separator row `| ---- |` whose first capture
    // happens to be empty string not digits, but belt-and-braces.
    if (!/^[\-\s]+$/.test(name)) {
      gates.add(Number(m[1]));
    }
  }
  return gates;
}

interface GateRefs {
  singles: Set<number>;
  rangeHighs: Set<number>;
  totals: Set<number>;
}

function extractPhaseGateRefs(md: string): GateRefs {
  const singles = new Set<number>();
  const rangeHighs = new Set<number>();
  const totals = new Set<number>();

  let m: RegExpExecArray | null;

  GATE_RANGE_RE.lastIndex = 0;
  const rangeSpans: Array<[number, number]> = [];
  while ((m = GATE_RANGE_RE.exec(md)) !== null) {
    const low = Number(m[1]);
    const high = Number(m[2]);
    for (let i = low; i <= high; i++) rangeHighs.add(i);
    rangeSpans.push([m.index, m.index + m[0].length]);
  }

  SINGLE_GATE_RE.lastIndex = 0;
  while ((m = SINGLE_GATE_RE.exec(md)) !== null) {
    const inRange = rangeSpans.some(([s, e]) => m!.index >= s && m!.index < e);
    if (!inRange) singles.add(Number(m[1]));
  }

  GATE_TOTAL_RE.lastIndex = 0;
  while ((m = GATE_TOTAL_RE.exec(md)) !== null) {
    totals.add(Number(m[1]));
  }

  return { singles, rangeHighs, totals };
}

describe('CLAUDE phase guide ↔ CI gate reference sync', () => {
  const canonical = extractCanonicalGates(readFileSync(GATES_DOC, 'utf-8'));
  const maxCanonical = Math.max(...canonical);

  it('sanity: canonical gate list has at least 5 entries', () => {
    expect(canonical.size).toBeGreaterThanOrEqual(5);
    expect(canonical.has(1)).toBe(true);
  });

  for (const guide of PHASE_GUIDES) {
    describe(guide, () => {
      const md = readFileSync(resolve(REPO_ROOT, guide), 'utf-8');
      const refs = extractPhaseGateRefs(md);

      it('every single gate reference resolves to a canonical gate', () => {
        const orphans = [...refs.singles].filter((n) => !canonical.has(n));
        expect(orphans, `orphan gate refs in ${guide}: ${orphans.join(', ')}`).toEqual([]);
      });

      it('every gate-range upper bound is within the canonical max', () => {
        const orphans = [...refs.rangeHighs].filter((n) => !canonical.has(n));
        expect(orphans, `range includes unknown gate in ${guide}: ${orphans.join(', ')}`).toEqual([]);
      });

      it('any explicit "N CI gates" total matches canonical gate count', () => {
        const mismatches = [...refs.totals].filter((n) => n !== canonical.size);
        expect(
          mismatches,
          `${guide} states "${[...refs.totals].join('/')} CI gates" but canonical = ${canonical.size}`,
        ).toEqual([]);
      });
    });
  }

  it('coverage: at least one phase guide references the highest canonical gate', () => {
    const mentions = PHASE_GUIDES.map((g) =>
      extractPhaseGateRefs(readFileSync(resolve(REPO_ROOT, g), 'utf-8')),
    );
    const covers = mentions.some(
      (r) => r.singles.has(maxCanonical) || r.rangeHighs.has(maxCanonical),
    );
    expect(covers, `no phase guide mentions Gate ${maxCanonical}`).toBe(true);
  });
});
