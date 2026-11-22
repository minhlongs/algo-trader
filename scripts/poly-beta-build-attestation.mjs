#!/usr/bin/env node
/**
 * Read-only source-to-build provenance attestation generator for Paper Beta (`poly-beta-api`).
 * Separates (1) source commit SHA, (2) local candidate build artifact digests, and
 * (3) deployed Cloudflare artifact identity (which remains UNKNOWN unless independently
 * proven via read-only Cloudflare inspection).
 * Does NOT deploy, mutate Cloudflare bindings, or modify secrets.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

const TRACKED_PATHS = [
  'pnpm-lock.yaml',
  'package.json',
  'wrangler.poly-beta.toml',
  'wrangler.poly-beta-pages.toml',
  'migrations/poly-beta-d1/0001-poly-beta-ledger.sql',
  'migrations/poly-beta-d1/0002-poly-beta-invite-redemptions.sql',
  'migrations/poly-beta-d1/0003-poly-beta-feedback.sql',
  'src/platform/poly-beta/poly-beta-account.ts',
  'src/platform/poly-beta/poly-beta-auth.ts',
  'src/platform/poly-beta/poly-beta-dashboard-view.ts',
  'src/platform/poly-beta/poly-beta-execution.ts',
  'src/platform/poly-beta/poly-beta-feedback.ts',
  'src/platform/poly-beta/poly-beta-genesis.ts',
  'src/platform/poly-beta/poly-beta-schemas.ts',
  'src/platform/poly-beta/poly-beta-signup-allowlist.ts',
  'src/platform/poly-beta/poly-beta-signup-invite.ts',
  'src/platform/poly-beta/poly-beta-types.ts',
  'src/platform/poly-beta/poly-beta-worker.ts',
  'src/platform/poly-beta/tenant-paper-engine-actions.ts',
  'src/platform/poly-beta/tenant-paper-engine-do.ts',
  'dashboard/functions/api/beta/[[path]].ts',
  'dashboard/poly-beta-html-metadata.ts',
  'dashboard/vite.config.ts',
  'dashboard/src/poly-beta/poly-beta-auth-form.tsx',
  'dashboard/src/poly-beta/poly-beta-controls-health.tsx',
  'dashboard/src/poly-beta/poly-beta-feedback-panel.tsx',
];

function sha256File(absPath) {
  return createHash('sha256').update(readFileSync(absPath)).digest('hex');
}

function sha256Directory(dirPath) {
  if (!dirPath || !existsSync(dirPath)) return null;
  const files = [];
  function walk(cur) {
    for (const entry of readdirSync(cur).sort()) {
      const full = join(cur, entry);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (st.isFile()) files.push(full);
    }
  }
  walk(dirPath);
  const hash = createHash('sha256');
  const manifest = {};
  for (const abs of files) {
    const rel = relative(dirPath, abs);
    const digest = sha256File(abs);
    manifest[rel] = digest;
    hash.update(`${rel}:${digest}\n`);
  }
  return { rootDigestSha256: hash.digest('hex'), fileCount: files.length, files: manifest };
}

function safeExec(cmd, args) {
  try {
    return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : null;
}

function parseWranglerSafetyInvariants(tomlText) {
  const getVar = (key) => {
    const match = tomlText.match(new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, 'm'));
    return match ? match[1] : null;
  };
  const stripped = tomlText.replace(/^#.*$/gm, '');
  const hasRoutesEmpty = /^routes\s*=\s*\[\s*\]/m.test(stripped);
  const hasLiveOrderSecret = /(PRIVATE_KEY|CLOB_API_KEY|POLYMARKET_API_SECRET|WALLET_SEED)/i.test(stripped);
  const referencesProdDb = /f29559f2|6c7199c0/.test(stripped);
  const hasPlaintextSecretsInToml = /(BETA_SIGNUP_ALLOWLIST|BETA_SIGNUP_INVITES)\s*=/m.test(stripped);
  const hasAnyLiveTradingTrue = /^LIVE_TRADING_ENABLED\s*=\s*"true"/im.test(stripped);

  return {
    workerName: getVar('name'),
    routesEmpty: hasRoutesEmpty,
    environment: getVar('ENVIRONMENT'),
    liveTradingEnabled: getVar('LIVE_TRADING_ENABLED'),
    signupGateMode: getVar('SIGNUP_GATE_MODE'),
    g1SoakLock: getVar('G1_SOAK_LOCK'),
    g2PolyShadowLock: getVar('G2_POLY_SHADOW_LOCK'),
    allowedOrigins: getVar('ALLOWED_ORIGINS'),
    d1DatabaseName: getVar('database_name'),
    d1DatabaseId: getVar('database_id'),
    kvNamespaceId: getVar('id'),
    hasLiveOrderSecret,
    referencesProdDb,
    hasPlaintextSecretsInToml,
    isolatedFromTradingInfra:
      hasRoutesEmpty &&
      !hasLiveOrderSecret &&
      !referencesProdDb &&
      !hasPlaintextSecretsInToml &&
      !hasAnyLiveTradingTrue &&
      getVar('LIVE_TRADING_ENABLED') === 'false',
  };
}

const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim().length > 0;
const bundlePath = getArg('--bundle');
const dashboardDir = getArg('--dashboard-dir');

const fileDigests = {};
for (const rel of TRACKED_PATHS) {
  const abs = resolve(ROOT, rel);
  fileDigests[rel] = existsSync(abs) ? sha256File(abs) : null;
}

const migrationsDir = resolve(ROOT, 'migrations/poly-beta-d1');
const d1MigrationSet = existsSync(migrationsDir)
  ? readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((filename) => ({
        filename,
        sha256: sha256File(join(migrationsDir, filename)),
      }))
  : [];

const wranglerToml = readFileSync(resolve(ROOT, 'wrangler.poly-beta.toml'), 'utf8');
const bindings = parseWranglerSafetyInvariants(wranglerToml);

const attestation = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  sourceIdentity: {
    sourceSha: headSha,
    workingTreeClean: !dirty,
    lockfileSha256: fileDigests['pnpm-lock.yaml'],
  },
  toolVersions: {
    node: process.version,
    pnpm: safeExec('pnpm', ['--version']),
    wrangler: safeExec('npx', ['wrangler', '--version']),
    vite: safeExec('npx', ['--prefix', 'dashboard', 'vite', '--version']),
  },
  buildCommands: {
    workerDryRun: 'npx wrangler deploy --config wrangler.poly-beta.toml --dry-run --outdir <tmp>',
    dashboardPolyBeta: 'VITE_APP_MODE=poly-beta npx --prefix dashboard vite build --outDir <tmp>',
  },
  d1MigrationSet,
  candidateBuildArtifacts: {
    workerBundleSha256: bundlePath && existsSync(bundlePath) ? sha256File(bundlePath) : null,
    dashboardBuild: sha256Directory(dashboardDir),
  },
  deployedArtifactProvenance: 'UNKNOWN',
  approvalStatus: {
    sourceMerge: 'AWAITING_FOUNDER_MERGE_APPROVAL',
    d1Migration: 'HOLD',
    workerDeploy: 'HOLD',
    pagesDeploy: 'HOLD',
    secretEnrollment: 'HOLD',
    user001Invite: 'HOLD',
  },
  fileDigests,
  effectiveBindings: bindings,
  deploymentExecuted: false,
  user001InviteStatus: 'HOLD',
};

console.log(JSON.stringify(attestation, null, 2));

if (!bindings.isolatedFromTradingInfra || bindings.signupGateMode !== 'allowlist') {
  process.exitCode = 1;
}
