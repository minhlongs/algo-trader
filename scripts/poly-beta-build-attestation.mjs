#!/usr/bin/env node
/**
 * Read-only source-to-build provenance attestation generator for Paper Beta (`poly-beta-api`).
 * Does NOT deploy, mutate Cloudflare bindings, or modify secrets.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

const TRACKED_PATHS = [
  'pnpm-lock.yaml',
  'package.json',
  'wrangler.poly-beta.toml',
  'wrangler.poly-beta-pages.toml',
  'src/platform/poly-beta/poly-beta-auth.ts',
  'src/platform/poly-beta/poly-beta-signup-allowlist.ts',
  'src/platform/poly-beta/poly-beta-types.ts',
  'src/platform/poly-beta/poly-beta-worker.ts',
  'dashboard/functions/api/beta/[[path]].ts',
  'dashboard/poly-beta-html-metadata.ts',
  'dashboard/vite.config.ts',
];

function sha256File(absPath) {
  return createHash('sha256').update(readFileSync(absPath)).digest('hex');
}

function parseWranglerSafetyInvariants(tomlText) {
  const getVar = (key) => {
    const match = tomlText.match(new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, 'm'));
    return match ? match[1] : null;
  };
  const hasRoutesEmpty = /^routes\s*=\s*\[\s*\]/m.test(tomlText);
  const hasLiveOrderSecret = /(PRIVATE_KEY|CLOB_API_KEY|POLYMARKET_API_SECRET|WALLET_SEED)/i.test(tomlText);
  const referencesProdDb = /f29559f2|6c7199c0/.test(
    tomlText.replace(/^#.*$/gm, ''),
  );

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
    isolatedFromTradingInfra: hasRoutesEmpty && !hasLiveOrderSecret && !referencesProdDb && getVar('LIVE_TRADING_ENABLED') === 'false',
  };
}

const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim().length > 0;
const bundleArgIdx = process.argv.indexOf('--bundle');
const bundlePath = bundleArgIdx >= 0 ? process.argv[bundleArgIdx + 1] : null;

const fileDigests = {};
for (const rel of TRACKED_PATHS) {
  const abs = resolve(ROOT, rel);
  fileDigests[rel] = existsSync(abs) ? sha256File(abs) : null;
}

const wranglerToml = readFileSync(resolve(ROOT, 'wrangler.poly-beta.toml'), 'utf8');
const bindings = parseWranglerSafetyInvariants(wranglerToml);

const attestation = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  sourceSha: headSha,
  workingTreeClean: !dirty,
  workerBundleSha256: bundlePath && existsSync(bundlePath) ? sha256File(bundlePath) : null,
  fileDigests,
  effectiveBindings: bindings,
  deploymentExecuted: false,
  user001InviteStatus: 'HOLD',
};

console.log(JSON.stringify(attestation, null, 2));

if (!bindings.isolatedFromTradingInfra || bindings.signupGateMode !== 'allowlist') {
  process.exitCode = 1;
}
