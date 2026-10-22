// SPDX-License-Identifier: MIT
/**
 * Governance probes, part 2 — CI gate, CLA, leaderboard, quickstart.
 *
 * Split from step-governance-probes.test.ts to stay under the repository LOC ceiling. Same
 * contract as part 1: each probe is checked against the real repository and against a stub whose
 * claim is broken, so a probe that cannot fail fails this suite.
 */

import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  probeBacktestLeaderboard,
  probeCiEnforcement,
  probeClaGovernance,
  probeQuickstart,
} from '../step-governance-probes';

const REPO_ROOT = path.resolve(__dirname, '../../../../');

const cleanups: string[] = [];

function tmpRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-probe-'));
  cleanups.push(dir);
  return dir;
}

afterEach(() => {
  while (cleanups.length > 0) {
    const dir = cleanups.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('CI enforcement (step 23)', () => {
  it('reports the real workflow as warning-only', () => {
    const result = probeCiEnforcement(REPO_ROOT);
    expect(result.verified).toBe(false);
    expect(result.evidence).toMatch(/warning|block/i);
  });

  it('verifies a workflow that fails the job on oversized files', () => {
    const dir = tmpRepo();
    fs.mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.github/workflows/ci.yml'),
      "jobs:\n  loc:\n    steps:\n      - run: |\n          find src -name '*.ts' -exec awk 'END{ if (NR > 200) exit 1 }' {} \;\n",
    );

    expect(probeCiEnforcement(dir).verified).toBe(true);
  });
});

describe('CLA governance (step 25)', () => {
  it('verifies the real CLA states a license grant', () => {
    expect(probeClaGovernance(REPO_ROOT).verified).toBe(true);
  });

  it('fails a CLA with no license language', () => {
    const dir = tmpRepo();
    fs.writeFileSync(path.join(dir, 'CLA.md'), '# CLA\n\nThanks for contributing.\n');
    fs.writeFileSync(path.join(dir, 'LICENSE'), 'MIT License\n');

    expect(probeClaGovernance(dir).verified).toBe(false);
  });
});

describe('backtest leaderboard (step 24)', () => {
  it('verifies the real leaderboard publishes its metrics', () => {
    expect(probeBacktestLeaderboard(REPO_ROOT).verified).toBe(true);
  });

  it('fails a leaderboard that omits drawdown', () => {
    const dir = tmpRepo();
    fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'docs/backtest-leaderboard.md'), '# Leaderboard\n\nSharpe shown.\n');

    expect(probeBacktestLeaderboard(dir).verified).toBe(false);
  });
});

describe('quickstart CLI (step 21)', () => {
  it('verifies the real CLI exposes setup and quickstart', () => {
    expect(probeQuickstart(REPO_ROOT).verified).toBe(true);
  });

  it('fails a CLI with no quickstart command', () => {
    const dir = tmpRepo();
    fs.mkdirSync(path.join(dir, 'src', 'commands'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src/commands/cli-builder.ts'), "cli.command('setup')\n");

    expect(probeQuickstart(dir).verified).toBe(false);
  });
});
