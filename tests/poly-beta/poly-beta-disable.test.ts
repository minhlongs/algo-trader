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

  it('builds a dry-run plan for poly-beta-prod with explicit --env "" and preserves audit tables', () => {
    const plan = buildDisablePlan({
      target: 'poly-beta-prod',
      mode: 'full-disable',
      wranglerConfig: POLY_BETA_WRANGLER,
    });

    expect(plan.dryRun).toBe(true);
    expect(plan.workerName).toBe('poly-beta-api');
    expect(plan.wranglerEnv).toBe('');
    expect(plan.databaseName).toBe('poly-beta-db');
    expect(plan.preservedTables).toEqual(['beta_feedback', 'beta_invite_redemptions']);
    expect(plan.actions.map((a: { id: string }) => a.id)).toEqual([
      'clear-signup-allowlist',
      'clear-signup-invites',
      'enable-maintenance-mode',
      'revoke-beta-sessions',
    ]);
    for (const action of plan.actions as Array<{ idempotent: boolean; command: string[] }>) {
      expect(action.idempotent).toBe(true);
      const envIdx = action.command.indexOf('--env');
      expect(envIdx).toBeGreaterThan(-1);
      expect(action.command[envIdx + 1]).toBe('');
      expect(JSON.stringify(action)).not.toContain('beta_feedback');
      expect(JSON.stringify(action)).not.toContain('beta_invite_redemptions');
    }
  });

  it('fails closed when poly-beta-staging has no dedicated [env.staging] section and binds --env staging when present', () => {
    // Production wrangler.poly-beta.toml has no [env.staging] section -> must fail closed
    expect(() =>
      buildDisablePlan({
        target: 'poly-beta-staging',
        mode: 'disable-signup',
        wranglerConfig: POLY_BETA_WRANGLER,
      }),
    ).toThrow(/requires explicit \[env\.staging\]/);

    // Reject [env.staging] name override targeting another worker
    const hijackedStaging = join(tempDir, 'wrangler.hijacked-staging.toml');
    writeFileSync(
      hijackedStaging,
      [
        'name = "poly-beta-api"',
        '[vars]',
        'ENVIRONMENT = "public-beta"',
        'LIVE_TRADING_ENABLED = "false"',
        '[env.staging]',
        'name = "algo-trader"',
        '[env.staging.vars]',
        'ENVIRONMENT = "staging"',
        'LIVE_TRADING_ENABLED = "false"',
        '[[env.staging.d1_databases]]',
        'binding = "POLY_BETA_DB"',
        'database_name = "poly-beta-db-staging"',
      ].join('\n'),
      'utf8',
    );
    expect(() =>
      buildDisablePlan({
        target: 'poly-beta-staging',
        mode: 'disable-signup',
        wranglerConfig: hijackedStaging,
      }),
    ).toThrow(/effective worker name "algo-trader" is not allowed/);

    // Reject missing [[d1_databases]] instead of falling back to poly-beta-db
    const noD1Config = join(tempDir, 'wrangler.nod1.toml');
    writeFileSync(
      noD1Config,
      'name = "poly-beta-api"\n[vars]\nENVIRONMENT = "public-beta"\nLIVE_TRADING_ENABLED = "false"\n',
      'utf8',
    );
    expect(() =>
      buildDisablePlan({
        target: 'poly-beta-prod',
        mode: 'disable-signup',
        wranglerConfig: noD1Config,
      }),
    ).toThrow(/missing required \[\[d1_databases\]\]/);

    const stagingConfig = join(tempDir, 'wrangler.staging.toml');
    writeFileSync(
      stagingConfig,
      [
        'name = "poly-beta-api"',
        '[vars]',
        'ENVIRONMENT = "public-beta"',
        'LIVE_TRADING_ENABLED = "false"',
        '[env.staging.vars]',
        'ENVIRONMENT = "staging"',
        'LIVE_TRADING_ENABLED = "false"',
        '[[env.staging.d1_databases]]',
        'binding = "POLY_BETA_DB"',
        'database_name = "poly-beta-db-staging"',
      ].join('\n'),
      'utf8',
    );
    const plan = buildDisablePlan({
      target: 'poly-beta-staging',
      mode: 'full-disable',
      wranglerConfig: stagingConfig,
    });
    expect(plan.workerName).toBe('poly-beta-api-staging');
    expect(plan.wranglerEnv).toBe('staging');
    expect(plan.databaseName).toBe('poly-beta-db-staging');
    for (const action of plan.actions as Array<{ command: string[] }>) {
      const envIdx = action.command.indexOf('--env');
      expect(envIdx).toBeGreaterThan(-1);
      expect(action.command[envIdx + 1]).toBe('staging');
    }

    // Reject [env.staging].name = "poly-beta-api" (staging must not target prod worker name)
    const prodNamedStaging = join(tempDir, 'wrangler.prod-named-staging.toml');
    writeFileSync(
      prodNamedStaging,
      [
        'name = "poly-beta-api"',
        '[env.staging]',
        'name = "poly-beta-api"',
        '[env.staging.vars]',
        'ENVIRONMENT = "staging"',
        'LIVE_TRADING_ENABLED = "false"',
        '[[env.staging.d1_databases]]',
        'binding = "POLY_BETA_DB"',
        'database_name = "poly-beta-db-staging"',
      ].join('\n'),
      'utf8',
    );
    expect(() =>
      buildDisablePlan({
        target: 'poly-beta-staging',
        mode: 'disable-signup',
        wranglerConfig: prodNamedStaging,
      }),
    ).toThrow(/effective worker name "poly-beta-api" is not allowed/);

    // Reject prototype pollution keys and duplicate TOML keys/tables
    const protoConfig = join(tempDir, 'wrangler.proto.toml');
    writeFileSync(
      protoConfig,
      'name = "poly-beta-api"\n[__proto__]\npolluted = "true"\n',
      'utf8',
    );
    expect(() => validateWranglerConfig(protoConfig, 'poly-beta-prod')).toThrow(/unsafe TOML key/);

    const dupKeyConfig = join(tempDir, 'wrangler.dup.toml');
    writeFileSync(
      dupKeyConfig,
      [
        'name = "poly-beta-api"',
        '[vars]',
        'ENVIRONMENT = "public-beta"',
        'LIVE_TRADING_ENABLED = "false"',
        'LIVE_TRADING_ENABLED = "true"',
      ].join('\n'),
      'utf8',
    );
    expect(() => validateWranglerConfig(dupKeyConfig, 'poly-beta-prod')).toThrow(/Duplicate TOML key/);

    // Reject Unicode-escaped double-quoted keys (prevents TOML parser differential on [env.staging].name)
    const escapedKeyConfig = join(tempDir, 'wrangler.escaped-key.toml');
    writeFileSync(
      escapedKeyConfig,
      [
        'name = "poly-beta-api"',
        '[env.staging]',
        '"\\u006eame" = "algo-trader"',
        '[env.staging.vars]',
        'ENVIRONMENT = "staging"',
        'LIVE_TRADING_ENABLED = "false"',
        '[[env.staging.d1_databases]]',
        'binding = "POLY_BETA_DB"',
        'database_name = "poly-beta-db-staging"',
      ].join('\n'),
      'utf8',
    );
    expect(() => validateWranglerConfig(escapedKeyConfig, 'poly-beta-staging')).toThrow(/escaped TOML key/);

    // Reject non-string [env.staging].name
    const nonStringNameConfig = join(tempDir, 'wrangler.nonstring-name.toml');
    writeFileSync(
      nonStringNameConfig,
      [
        'name = "poly-beta-api"',
        '[env.staging]',
        'name = 123',
        '[env.staging.vars]',
        'ENVIRONMENT = "staging"',
        'LIVE_TRADING_ENABLED = "false"',
        '[[env.staging.d1_databases]]',
        'binding = "POLY_BETA_DB"',
        'database_name = "poly-beta-db-staging"',
      ].join('\n'),
      'utf8',
    );
    expect(() => validateWranglerConfig(nonStringNameConfig, 'poly-beta-staging')).toThrow(/must be a string/);

    // Reject malformed single-quoted string with embedded quotes
    const badSingleQuote = join(tempDir, 'wrangler.bad-sq.toml');
    writeFileSync(
      badSingleQuote,
      "name = 'poly-beta-api' extra 'junk'\n",
      'utf8',
    );
    expect(() => validateWranglerConfig(badSingleQuote, 'poly-beta-prod')).toThrow(/Malformed single-quoted/);

    // Reject extra unverified [[d1_databases]] binding alongside expected DB
    const extraDbConfig = join(tempDir, 'wrangler.extra-db.toml');
    writeFileSync(
      extraDbConfig,
      [
        'name = "poly-beta-api"',
        '[vars]',
        'ENVIRONMENT = "public-beta"',
        'LIVE_TRADING_ENABLED = "false"',
        '[[d1_databases]]',
        'binding = "POLY_BETA_DB"',
        'database_name = "poly-beta-db"',
        '[[d1_databases]]',
        'binding = "OTHER_DB"',
        'database_name = "other-prod-db"',
      ].join('\n'),
      'utf8',
    );
    expect(() => validateWranglerConfig(extraDbConfig, 'poly-beta-prod')).toThrow(/allows only database_name/);
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
        target: 'poly-beta-prod',
        mode: 'maintenance',
        execute: true,
        dryRun: false,
        confirmDisable: 'poly-beta-prod',
        auditLog,
        operator: 'ops-tester',
        wranglerConfig: POLY_BETA_WRANGLER,
      },
      (action: { id: string }) => callsRun1.push(action.id),
    );

    const res2 = executeDisableProcedure(
      {
        target: 'poly-beta-prod',
        mode: 'maintenance',
        execute: true,
        dryRun: false,
        confirmDisable: 'poly-beta-prod',
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
    expect(parsed.target).toBe('poly-beta-prod');
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

  it('rejects unsupported TOML constructs, table conflicts, malformed lines, and invalid target bindings fail-closed', () => {
    const checkReject = (filename: string, toml: string, pattern: RegExp, target: string | undefined = 'poly-beta-prod') => {
      const p = join(tempDir, filename);
      writeFileSync(p, toml, 'utf8');
      expect(() => validateWranglerConfig(p, target)).toThrow(pattern);
    };

    checkReject('multiline.toml', 'name = """poly-beta-api"""\n', /Unsupported multiline/);
    checkReject('inline.toml', 'name = "poly-beta-api"\nvars = { LIVE_TRADING_ENABLED = "false" }\n', /Unsupported inline/);
    checkReject('unterminated.toml', 'name = "poly-beta-api"\n["unterminated]\na = "b"\n', /Unterminated quoted/);
    checkReject('malformed-line.toml', 'name = "poly-beta-api"\nnot_a_valid_line\n', /Malformed TOML line/);
    checkReject('ambiguous-val.toml', 'name = poly-beta-api\n', /Unsupported or ambiguous TOML value/);
    checkReject('dup-table.toml', 'name = "poly-beta-api"\n[vars]\nA = "1"\n[vars]\nB = "2"\n', /Duplicate TOML table/);
    checkReject('table-conflict.toml', 'name = "poly-beta-api"\nvars = "bad"\n[vars]\nA = "1"\n', /TOML table conflict/);
    checkReject('array-conflict.toml', 'name = "poly-beta-api"\nd1_databases = "bad"\n[[d1_databases]]\ndatabase_name = "poly-beta-db"\n', /array-of-tables conflict/);
    checkReject('nested-key-conflict.toml', 'name = "poly-beta-api"\nvars = "bad"\nvars.LIVE_TRADING_ENABLED = "false"\n', /TOML key conflict/);
    checkReject('empty-seg.toml', 'name = "poly-beta-api"\n[env..staging]\n', /empty TOML key segment/);
    checkReject('bad-bare-key.toml', 'name = "poly-beta-api"\n[bad key]\n', /Unsupported or malformed TOML key/);
    checkReject('bad-dq-key.toml', 'name = "poly-beta-api"\n"a""b" = "1"\n', /Malformed double-quoted/);
    checkReject('bad-sq-key.toml', "name = 'poly-beta-api'\n'a''b' = '1'\n", /Malformed single-quoted/);
    checkReject('missing-vars.toml', 'name = "poly-beta-api"\n', /missing required \[vars\]/);
    checkReject(
      'wrong-env.toml',
      'name = "poly-beta-api"\n[vars]\nENVIRONMENT = "staging"\nLIVE_TRADING_ENABLED = "false"\n',
      /requires ENVIRONMENT = "public-beta"/,
    );
    checkReject(
      'algo-db.toml',
      'name = "poly-beta-api"\n[vars]\nENVIRONMENT = "public-beta"\nLIVE_TRADING_ENABLED = "false"\n[[d1_databases]]\ndatabase_name = "algo-trader-db"\n',
      /must not be production algo-trader-db/,
    );
    checkReject(
      'empty-dbname.toml',
      'name = "poly-beta-api"\n[vars]\nENVIRONMENT = "public-beta"\nLIVE_TRADING_ENABLED = "false"\n[[d1_databases]]\nbinding = "POLY_BETA_DB"\n',
      /must specify database_name/,
    );
    checkReject('bad-target.toml', 'name = "poly-beta-api"\n', /Invalid --target/, 'unknown-target');

    // Valid config using single-quoted strings, booleans, numbers, arrays, and inline comments
    const richValid = join(tempDir, 'rich-valid.toml');
    writeFileSync(
      richValid,
      [
        "name = 'poly-beta-api' # prod beta worker",
        'routes = [] # isolated',
        'timeout = 30',
        'enabled = true',
        '[vars]',
        "ENVIRONMENT = 'public-beta'",
        'LIVE_TRADING_ENABLED = false # boolean false also accepted',
        '[[d1_databases]]',
        'binding = "POLY_BETA_DB"',
        "database_name = 'poly-beta-db'",
      ].join('\n'),
      'utf8',
    );
    const validated = validateWranglerConfig(richValid, 'poly-beta-prod');
    expect(validated.workerName).toBe('poly-beta-api');
    expect(validated.databaseName).toBe('poly-beta-db');
  });
});
