import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildDisablePlan,
  executeDisableProcedure,
  parseDisableCliArgs,
  validateWranglerConfig,
} from '../../scripts/poly-beta-disable.mjs';

const WORKTREE_ROOT = resolve(__dirname, '../..');
const POLY_BETA_WRANGLER = join(WORKTREE_ROOT, 'wrangler.poly-beta.toml');

describe('poly-beta-disable', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'poly-beta-disable-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('builds a dry-run plan by default and preserves beta_feedback and beta_invite_redemptions', () => {
    const plan = buildDisablePlan({
      target: 'poly-beta-staging',
      mode: 'full-disable',
      wranglerConfig: POLY_BETA_WRANGLER,
    });

    expect(plan.dryRun).toBe(true);
    expect(plan.workerName).toBe('poly-beta-api');
    expect(plan.preservedTables).toEqual(['beta_feedback', 'beta_invite_redemptions']);
    expect(plan.actions.map((a: { id: string }) => a.id)).toEqual([
      'clear-signup-allowlist',
      'clear-signup-invites',
      'enable-maintenance-mode',
      'revoke-beta-sessions',
    ]);
    for (const action of plan.actions) {
      expect(action.idempotent).toBe(true);
      expect(JSON.stringify(action)).not.toContain('beta_feedback');
      expect(JSON.stringify(action)).not.toContain('beta_invite_redemptions');
    }
  });

  it('rejects unknown targets and invalid modes', () => {
    expect(() =>
      buildDisablePlan({
        target: 'algo-trader-prod',
        mode: 'disable-signup',
        wranglerConfig: POLY_BETA_WRANGLER,
      }),
    ).toThrow(/Invalid --target/);

    expect(() =>
      buildDisablePlan({
        target: 'poly-beta-prod',
        mode: 'nuke-everything',
        wranglerConfig: POLY_BETA_WRANGLER,
      }),
    ).toThrow(/Invalid --mode/);
  });

  it('refuses to run against algo-trader or LIVE_TRADING_ENABLED=true wrangler configs', () => {
    const algoTraderConfig = join(tempDir, 'wrangler.algo.toml');
    writeFileSync(
      algoTraderConfig,
      'name = "algo-trader"\n[vars]\nLIVE_TRADING_ENABLED = "false"\n',
      'utf8',
    );
    expect(() => validateWranglerConfig(algoTraderConfig)).toThrow(/poly-beta-api/);

    const liveConfig = join(tempDir, 'wrangler.live.toml');
    writeFileSync(
      liveConfig,
      'name = "poly-beta-api"\n[vars]\nLIVE_TRADING_ENABLED = "true"\n',
      'utf8',
    );
    expect(() => validateWranglerConfig(liveConfig)).toThrow(/LIVE_TRADING_ENABLED/);
  });

  it('refuses --execute without matching --confirm-disable and never invokes runner', () => {
    const called: string[] = [];
    const runner = (action: { id: string }) => {
      called.push(action.id);
    };

    expect(() =>
      executeDisableProcedure(
        {
          target: 'poly-beta-prod',
          mode: 'disable-signup',
          execute: true,
          dryRun: false,
          confirmDisable: 'poly-beta-staging',
          wranglerConfig: POLY_BETA_WRANGLER,
        },
        runner,
      ),
    ).toThrow(/Confirmation required/);
    expect(called).toEqual([]);

    expect(() =>
      executeDisableProcedure(
        {
          target: 'poly-beta-prod',
          mode: 'disable-signup',
          execute: true,
          dryRun: false,
          wranglerConfig: POLY_BETA_WRANGLER,
        },
        runner,
      ),
    ).toThrow(/Confirmation required/);
    expect(called).toEqual([]);
  });

  it('executes idempotently with matching confirmation and appends secret-free JSONL audit log', () => {
    const auditLog = join(tempDir, 'audit', 'disable.jsonl');
    const callsRun1: string[] = [];
    const callsRun2: string[] = [];

    const res1 = executeDisableProcedure(
      {
        target: 'poly-beta-staging',
        mode: 'maintenance',
        execute: true,
        dryRun: false,
        confirmDisable: 'poly-beta-staging',
        auditLog,
        operator: 'ops-tester',
        wranglerConfig: POLY_BETA_WRANGLER,
      },
      (action: { id: string }) => callsRun1.push(action.id),
    );

    const res2 = executeDisableProcedure(
      {
        target: 'poly-beta-staging',
        mode: 'maintenance',
        execute: true,
        dryRun: false,
        confirmDisable: 'poly-beta-staging',
        auditLog,
        operator: 'ops-tester',
        wranglerConfig: POLY_BETA_WRANGLER,
      },
      (action: { id: string }) => callsRun2.push(action.id),
    );

    expect(res1.executed).toBe(true);
    expect(res2.executed).toBe(true);
    expect(callsRun1).toEqual([
      'clear-signup-allowlist',
      'clear-signup-invites',
      'enable-maintenance-mode',
    ]);
    expect(callsRun2).toEqual(callsRun1);

    const lines = readFileSync(auditLog, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.target).toBe('poly-beta-staging');
    expect(parsed.mode).toBe('maintenance');
    expect(parsed.operator).toBe('ops-tester');
    expect(parsed.dryRun).toBe(false);
    expect(parsed.executed).toBe(true);
    expect(parsed.preservedTables).toEqual(['beta_feedback', 'beta_invite_redemptions']);
  });

  it('defaults to dry-run when CLI args omit --execute', () => {
    const parsed = parseDisableCliArgs(['--target', 'poly-beta-staging', '--mode', 'disable-signup']);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.execute).toBe(false);
  });
});
