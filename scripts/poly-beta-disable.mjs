#!/usr/bin/env node
/**
 * Guarded 1-Command Disable Procedure for `poly-beta-api` ONLY.
 *
 * Safety invariants:
 *   - Refuses to run unless `--target` is `poly-beta-staging` or `poly-beta-prod`.
 *   - Hard-checks `wrangler.poly-beta.toml` to verify `name = "poly-beta-api"`
 *     and `LIVE_TRADING_ENABLED = "false"`; refuses `algo-trader` or live configs.
 *   - Defaults to dry-run preview mode. NEVER executes wrangler unless BOTH
 *     `--execute` AND `--confirm-disable <target>` (matching `--target`) are supplied.
 *   - All actions are idempotent and preserve `beta_feedback` and `beta_invite_redemptions`.
 *   - Appends secret-free JSON-lines audit records when `--audit-log <path>` is provided.
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const TARGET_BINDINGS = Object.freeze({
  'poly-beta-prod': Object.freeze({
    wranglerEnv: '',
    allowedWorkerNames: new Set(['poly-beta-api']),
    expectedEnvironment: 'public-beta',
    expectedDatabaseName: 'poly-beta-db',
    requireEnvSection: false,
  }),
  'poly-beta-staging': Object.freeze({
    wranglerEnv: 'staging',
    allowedWorkerNames: new Set(['poly-beta-api-staging']),
    expectedEnvironment: 'staging',
    expectedDatabaseName: 'poly-beta-db-staging',
    requireEnvSection: true,
  }),
});
export const VALID_TARGETS = new Set(Object.keys(TARGET_BINDINGS));
export const VALID_MODES = new Set(['disable-signup', 'maintenance', 'full-disable']);
export const PRESERVED_TABLES = Object.freeze(['beta_feedback', 'beta_invite_redemptions']);

export function parseDisableCliArgs(argv) {
  const args = Array.isArray(argv) ? argv : [];
  const getFlag = (flag) => {
    const idx = args.indexOf(flag);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
  };
  const hasFlag = (flag) => args.includes(flag);

  const target = getFlag('--target');
  const mode = getFlag('--mode') ?? 'disable-signup';
  const confirmDisable = getFlag('--confirm-disable');
  const execute = hasFlag('--execute');
  const dryRun = hasFlag('--dry-run') || !execute;
  const auditLog = getFlag('--audit-log');
  const wranglerConfig = getFlag('--wrangler-config') ?? 'wrangler.poly-beta.toml';
  const operator = getFlag('--operator') ?? process.env.USER ?? 'unknown';

  return {
    target,
    mode,
    confirmDisable,
    execute,
    dryRun,
    auditLog,
    wranglerConfig,
    operator,
  };
}

function stripTomlComment(line) {
  let inDouble = false;
  let inSingle = false;
  let escaped = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\' && inDouble) {
      escaped = true;
      continue;
    }
    if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '#' && !inDouble && !inSingle) return line.slice(0, i);
  }
  return line;
}

const FORBIDDEN_TOML_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function assertSafeKeySegment(key) {
  if (!key || FORBIDDEN_TOML_KEYS.has(key)) {
    throw new Error(`Refusing to parse unsafe TOML key "${key}".`);
  }
}

function parseTomlKeySegment(rawSegment) {
  const seg = rawSegment.trim();
  if (!seg) {
    throw new Error('Refusing to parse empty TOML key segment.');
  }
  let decoded;
  if (seg.startsWith('"') && seg.endsWith('"') && seg.length >= 2) {
    if (seg.includes('\\')) {
      throw new Error(`Refusing to parse escaped TOML key segment "${seg}" to prevent parser differential.`);
    }
    const inner = seg.slice(1, -1);
    if (inner.includes('"')) {
      throw new Error(`Malformed double-quoted TOML key segment "${seg}".`);
    }
    decoded = inner;
  } else if (seg.startsWith("'") && seg.endsWith("'") && seg.length >= 2) {
    const inner = seg.slice(1, -1);
    if (inner.includes("'")) {
      throw new Error(`Malformed single-quoted TOML key segment "${seg}".`);
    }
    decoded = inner;
  } else if (/^[A-Za-z0-9_-]+$/.test(seg)) {
    decoded = seg;
  } else {
    throw new Error(`Unsupported or malformed TOML key segment "${seg}".`);
  }
  assertSafeKeySegment(decoded);
  return decoded;
}

function splitTomlPath(rawPath) {
  const parts = [];
  let buf = '';
  let inDouble = false;
  let inSingle = false;
  for (let i = 0; i < rawPath.length; i += 1) {
    const ch = rawPath[i];
    if (ch === '\\' && inDouble) {
      throw new Error(`Refusing to parse escaped TOML key in "${rawPath}" to prevent parser differential.`);
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      buf += ch;
      continue;
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      buf += ch;
      continue;
    }
    if (ch === '.' && !inDouble && !inSingle) {
      parts.push(parseTomlKeySegment(buf));
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (inDouble || inSingle) {
    throw new Error(`Unterminated quoted TOML key in "${rawPath}".`);
  }
  parts.push(parseTomlKeySegment(buf));
  return parts;
}

function parseTomlValue(raw) {
  const v = raw.trim();
  if (v.startsWith('"""') || v.startsWith("'''")) {
    throw new Error('Unsupported multiline TOML string in wrangler config; refusing to parse ambiguously.');
  }
  if (v.startsWith('{')) {
    throw new Error('Unsupported inline TOML table in wrangler config; refusing to parse ambiguously.');
  }
  if (v.startsWith('[') && v.endsWith(']')) {
    return v;
  }
  if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) {
    return JSON.parse(v);
  }
  if (v.startsWith("'") && v.endsWith("'") && v.length >= 2) {
    const inner = v.slice(1, -1);
    if (inner.includes("'")) {
      throw new Error(`Malformed single-quoted TOML string "${v}" in wrangler config.`);
    }
    return inner;
  }
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  throw new Error(`Unsupported or ambiguous TOML value "${v}" in wrangler config.`);
}

function setNestedTomlKey(targetObj, pathParts, value) {
  let cursor = targetObj;
  for (let i = 0; i < pathParts.length - 1; i += 1) {
    const key = pathParts[i];
    assertSafeKeySegment(key);
    if (!Object.prototype.hasOwnProperty.call(cursor, key)) {
      cursor[key] = Object.create(null);
    } else if (typeof cursor[key] !== 'object' || cursor[key] === null || Array.isArray(cursor[key])) {
      throw new Error(`TOML key conflict on "${pathParts.join('.')}".`);
    }
    cursor = cursor[key];
  }
  const leaf = pathParts[pathParts.length - 1];
  assertSafeKeySegment(leaf);
  if (Object.prototype.hasOwnProperty.call(cursor, leaf)) {
    throw new Error(`Duplicate TOML key "${pathParts.join('.')}" in wrangler config.`);
  }
  cursor[leaf] = value;
}

export function parseWranglerToml(content) {
  const root = Object.create(null);
  const declaredTables = new Set();
  let current = root;
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) continue;

    if (line.startsWith('[[') && line.endsWith(']]')) {
      const pathParts = splitTomlPath(line.slice(2, -2));
      let cursor = root;
      for (let i = 0; i < pathParts.length - 1; i += 1) {
        const key = pathParts[i];
        if (!Object.prototype.hasOwnProperty.call(cursor, key)) {
          cursor[key] = Object.create(null);
        } else if (typeof cursor[key] !== 'object' || cursor[key] === null || Array.isArray(cursor[key])) {
          throw new Error(`TOML table conflict on "${pathParts.join('.')}".`);
        }
        cursor = cursor[key];
      }
      const leaf = pathParts[pathParts.length - 1];
      if (!Object.prototype.hasOwnProperty.call(cursor, leaf)) {
        cursor[leaf] = [];
      } else if (!Array.isArray(cursor[leaf])) {
        throw new Error(`TOML array-of-tables conflict on "${pathParts.join('.')}".`);
      }
      const item = Object.create(null);
      cursor[leaf].push(item);
      current = item;
      continue;
    }

    if (line.startsWith('[') && line.endsWith(']')) {
      const pathParts = splitTomlPath(line.slice(1, -1));
      const tableKey = pathParts.join('.');
      if (declaredTables.has(tableKey)) {
        throw new Error(`Duplicate TOML table "[${tableKey}]" in wrangler config.`);
      }
      declaredTables.add(tableKey);
      let cursor = root;
      for (const key of pathParts) {
        if (!Object.prototype.hasOwnProperty.call(cursor, key)) {
          cursor[key] = Object.create(null);
        } else if (typeof cursor[key] !== 'object' || cursor[key] === null || Array.isArray(cursor[key])) {
          throw new Error(`TOML table conflict on "${tableKey}".`);
        }
        cursor = cursor[key];
      }
      current = cursor;
      continue;
    }

    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) {
      throw new Error(`Malformed TOML line in wrangler config: "${line}".`);
    }
    const keyPath = splitTomlPath(line.slice(0, eqIdx));
    const valStr = line.slice(eqIdx + 1).trim();
    setNestedTomlKey(current, keyPath, parseTomlValue(valStr));
  }

  return root;
}

export function validateWranglerConfig(configPath, target) {
  const resolvedPath = resolve(configPath);
  const content = readFileSync(resolvedPath, 'utf8');
  const parsed = parseWranglerToml(content);

  const binding = target ? TARGET_BINDINGS[target] : null;
  if (target && !binding) {
    throw new Error(
      `Invalid --target "${target}". Must be one of: ${Array.from(VALID_TARGETS).join(', ')}.`,
    );
  }

  const topLevelName = typeof parsed.name === 'string' ? parsed.name.trim() : null;
  if (topLevelName !== 'poly-beta-api') {
    throw new Error(
      `Refusing to run: wrangler config must target worker "poly-beta-api" (found "${topLevelName ?? 'missing'}"). Never target algo-trader.`,
    );
  }

  const envTable = binding?.requireEnvSection ? parsed.env?.[binding.wranglerEnv] : null;
  if (binding?.requireEnvSection && (!envTable || typeof envTable !== 'object')) {
    throw new Error(
      `Refusing to run: target "${target}" requires explicit [env.${binding.wranglerEnv}] in ${resolvedPath}. Failing closed to prevent hitting production.`,
    );
  }

  if (envTable && envTable.name !== undefined && typeof envTable.name !== 'string') {
    throw new Error(
      `Refusing to run: [env.${binding.wranglerEnv}].name must be a string in ${resolvedPath}.`,
    );
  }
  const envNameOverride =
    envTable && typeof envTable.name === 'string' ? envTable.name.trim() : null;
  const effectiveWorkerName =
    envNameOverride ?? (binding?.requireEnvSection ? `${topLevelName}-${binding.wranglerEnv}` : topLevelName);
  const allowedNames = binding?.allowedWorkerNames ?? new Set(['poly-beta-api']);
  if (!allowedNames.has(effectiveWorkerName)) {
    throw new Error(
      `Refusing to run: effective worker name "${effectiveWorkerName}" is not allowed for target "${target ?? 'default'}".`,
    );
  }

  const routesValue = binding?.requireEnvSection ? envTable?.routes : parsed.routes;
  const hasUnexpectedRoutes =
    (typeof routesValue === 'string' && routesValue.replace(/\s+/g, '') !== '[]') ||
    (Array.isArray(routesValue) && routesValue.length > 0);
  if (hasUnexpectedRoutes) {
    throw new Error(
      `Refusing to run: unexpected public routes configured in ${resolvedPath}. poly-beta-api must keep routes = [].`,
    );
  }

  const varsHeader = binding?.requireEnvSection ? `[env.${binding.wranglerEnv}.vars]` : '[vars]';
  const varsObj = binding?.requireEnvSection ? envTable?.vars : parsed.vars;
  if (!varsObj || typeof varsObj !== 'object') {
    throw new Error(
      `Refusing to run: missing required ${varsHeader} section in ${resolvedPath}.`,
    );
  }

  const liveTrading =
    varsObj.LIVE_TRADING_ENABLED !== undefined
      ? String(varsObj.LIVE_TRADING_ENABLED).trim().toLowerCase()
      : null;
  if (liveTrading !== 'false') {
    throw new Error(
      `Refusing to run: LIVE_TRADING_ENABLED must be "false" in ${varsHeader} (found "${liveTrading ?? 'missing'}").`,
    );
  }

  if (binding) {
    const actualEnv =
      typeof varsObj.ENVIRONMENT === 'string' ? varsObj.ENVIRONMENT.trim() : null;
    if (actualEnv !== binding.expectedEnvironment) {
      throw new Error(
        `Refusing to run: target "${target}" requires ENVIRONMENT = "${binding.expectedEnvironment}" in ${varsHeader} (found "${actualEnv ?? 'missing'}").`,
      );
    }
  }

  const dbHeader = binding?.requireEnvSection
    ? `[[env.${binding.wranglerEnv}.d1_databases]]`
    : '[[d1_databases]]';
  const d1List = binding?.requireEnvSection ? envTable?.d1_databases : parsed.d1_databases;
  if (!Array.isArray(d1List) || d1List.length === 0) {
    throw new Error(
      `Refusing to run: missing required ${dbHeader} section in ${resolvedPath}.`,
    );
  }

  const dbNames = d1List
    .map((entry) => (typeof entry?.database_name === 'string' ? entry.database_name.trim() : ''))
    .filter(Boolean);
  if (dbNames.length === 0) {
    throw new Error(
      `Refusing to run: ${dbHeader} must specify database_name in ${resolvedPath}.`,
    );
  }
  if (dbNames.includes('algo-trader-db')) {
    throw new Error('Refusing to run: database_name must not be production algo-trader-db.');
  }

  if (binding) {
    const unexpectedDbs = dbNames.filter((n) => n !== binding.expectedDatabaseName);
    if (unexpectedDbs.length > 0) {
      throw new Error(
        `Refusing to run: target "${target}" allows only database_name = "${binding.expectedDatabaseName}" in ${dbHeader} (found unexpected "${unexpectedDbs.join(', ')}").`,
      );
    }
  }

  const databaseName = binding
    ? dbNames.find((n) => n === binding.expectedDatabaseName) ?? null
    : dbNames[0];
  if (!databaseName || (binding && databaseName !== binding.expectedDatabaseName)) {
    throw new Error(
      `Refusing to run: target "${target}" requires database_name = "${binding?.expectedDatabaseName}" in ${dbHeader} (found "${dbNames.join(', ')}").`,
    );
  }

  return {
    configPath: resolvedPath,
    workerName: effectiveWorkerName,
    wranglerEnv: binding ? binding.wranglerEnv : '',
    liveTradingEnabled: false,
    databaseName,
  };
}

export function buildDisablePlan(options) {
  const target = options?.target;
  if (!target || !VALID_TARGETS.has(target)) {
    throw new Error(
      `Invalid --target "${target ?? ''}". Must be one of: ${Array.from(VALID_TARGETS).join(', ')}.`,
    );
  }

  const mode = options?.mode ?? 'disable-signup';
  if (!VALID_MODES.has(mode)) {
    throw new Error(
      `Invalid --mode "${mode}". Must be one of: ${Array.from(VALID_MODES).join(', ')}.`,
    );
  }

  const configPath = options?.wranglerConfig ?? 'wrangler.poly-beta.toml';
  const validated = validateWranglerConfig(configPath, target);
  const envArgs = ['--env', validated.wranglerEnv];

  const actions = [
    {
      id: 'clear-signup-allowlist',
      kind: 'wrangler-secret',
      secretName: 'BETA_SIGNUP_ALLOWLIST',
      inputValue: '',
      idempotent: true,
      command: [
        'wrangler',
        'secret',
        'put',
        'BETA_SIGNUP_ALLOWLIST',
        '--config',
        validated.configPath,
        ...envArgs,
      ],
    },
    {
      id: 'clear-signup-invites',
      kind: 'wrangler-secret',
      secretName: 'BETA_SIGNUP_INVITES',
      inputValue: '[]',
      idempotent: true,
      command: [
        'wrangler',
        'secret',
        'put',
        'BETA_SIGNUP_INVITES',
        '--config',
        validated.configPath,
        ...envArgs,
      ],
    },
  ];

  if (mode === 'maintenance' || mode === 'full-disable') {
    actions.push({
      id: 'enable-maintenance-mode',
      kind: 'wrangler-secret',
      secretName: 'MAINTENANCE_MODE',
      inputValue: 'true',
      idempotent: true,
      command: [
        'wrangler',
        'secret',
        'put',
        'MAINTENANCE_MODE',
        '--config',
        validated.configPath,
        ...envArgs,
      ],
    });
  }

  if (mode === 'full-disable') {
    actions.push({
      id: 'revoke-beta-sessions',
      kind: 'd1-execute',
      sql: 'DELETE FROM beta_sessions;',
      idempotent: true,
      command: [
        'wrangler',
        'd1',
        'execute',
        validated.databaseName,
        '--config',
        validated.configPath,
        ...envArgs,
        '--remote',
        '--command',
        'DELETE FROM beta_sessions;',
      ],
    });
  }

  const executeRequested = Boolean(options?.execute) && !options?.dryRun;

  return {
    schemaVersion: 'poly-beta-disable-plan/v1',
    target,
    wranglerEnv: validated.wranglerEnv,
    mode,
    dryRun: !executeRequested,
    workerName: validated.workerName,
    databaseName: validated.databaseName,
    wranglerConfig: validated.configPath,
    preservedTables: [...PRESERVED_TABLES],
    actions,
  };
}

function defaultActionRunner(action) {
  execFileSync('npx', action.command, {
    input: action.inputValue !== undefined ? `${action.inputValue}\n` : undefined,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

export function executeDisableProcedure(options, runner = defaultActionRunner) {
  const plan = buildDisablePlan(options);

  if (!plan.dryRun) {
    if (!options.confirmDisable || options.confirmDisable !== plan.target) {
      throw new Error(
        `Confirmation required: pass --confirm-disable ${plan.target} alongside --execute to run non-dry-run disable.`,
      );
    }
    for (const action of plan.actions) {
      runner(action);
    }
  }

  const auditRecord = {
    timestampUtc: new Date().toISOString(),
    target: plan.target,
    mode: plan.mode,
    operator: String(options?.operator ?? 'unknown'),
    dryRun: plan.dryRun,
    executed: !plan.dryRun,
    workerName: plan.workerName,
    preservedTables: plan.preservedTables,
    actions: plan.actions.map((a) => ({
      id: a.id,
      kind: a.kind,
      target: a.secretName ?? a.sql,
      idempotent: a.idempotent,
    })),
  };

  if (options?.auditLog) {
    const resolvedAuditPath = resolve(options.auditLog);
    mkdirSync(dirname(resolvedAuditPath), { recursive: true });
    appendFileSync(resolvedAuditPath, `${JSON.stringify(auditRecord)}\n`, 'utf8');
  }

  return {
    plan,
    executed: !plan.dryRun,
    auditRecord,
  };
}

function main() {
  const options = parseDisableCliArgs(process.argv.slice(2));
  const result = executeDisableProcedure(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}
