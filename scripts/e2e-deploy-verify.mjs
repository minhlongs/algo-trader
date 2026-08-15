#!/usr/bin/env node
/**
 * E2E Deploy Verification Pipeline
 * Usage:
 *   node scripts/e2e-deploy-verify.mjs [--skip-deploy] [--dry-run]
 *   PRODUCTION_URL=https://staging.example.com node scripts/e2e-deploy-verify.mjs
 */

import { execSync } from 'node:child_process';

const PRODUCTION_URL = process.env.PRODUCTION_URL || 'https://api.cashclaw.cc';
const args = process.argv.slice(2);
const SKIP_DEPLOY = args.includes('--skip-deploy');
const DRY_RUN = args.includes('--dry-run');

const results = [];
let exitCode = 0;

const ts = () => new Date().toISOString();
const log = (msg) => console.log(`[${ts()}] ${msg}`);
const pass = (s) => { results.push({ step: s, status: 'PASS' }); log(`✓ ${s}`); };
const fail = (s, r) => { results.push({ step: s, status: 'FAIL', reason: r }); log(`✗ ${s}: ${r}`); exitCode = 1; };
const skip = (s, r) => { results.push({ step: s, status: 'SKIP', reason: r }); log(`○ ${s}: ${r}`); };

function run(cmd) {
  if (DRY_RUN) { log(`  [dry-run] ${cmd}`); return ''; }
  return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function runSafe(cmd) {
  try { return { ok: true, out: run(cmd) }; }
  catch (e) { return { ok: false, out: e.stdout?.toString() || e.message }; }
}

async function fetchJson(url) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 10_000);
  try {
    const res = await fetch(url, { signal: c.signal });
    clearTimeout(t);
    return { ok: res.ok, data: await res.json() };
  } catch (e) {
    clearTimeout(t);
    return { ok: false, data: null, error: e.message };
  }
}

async function fetchCheck(url, method = 'GET', expected = [200]) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 10_000);
  try {
    const opts = { method, signal: c.signal };
    if (method === 'POST') opts.headers = { 'Content-Type': 'application/json' };
    const res = await fetch(url, opts);
    clearTimeout(t);
    return expected.includes(res.status);
  } catch { clearTimeout(t); return false; }
}

function step1Preflight() {
  log('Step 1: Pre-flight');
  const status = runSafe('git status --porcelain');
  if (!status.ok) return fail('Pre-flight', 'Not a git repository');
  if (status.out?.length > 0) return fail('Pre-flight', 'Uncommitted changes');
  const branch = runSafe('git rev-parse --abbrev-ref HEAD');
  if (!branch.ok) return fail('Pre-flight', 'Cannot determine branch');
  if (!['main', 'master'].includes(branch.out)) log(`  Warning: on "${branch.out}"`);
  pass('Pre-flight');
}

function step2Build() {
  log('Step 2: Build');
  const t0 = Date.now();
  const r = runSafe('npm run build');
  const dur = ((Date.now() - t0) / 1000).toFixed(1);
  if (!r.ok) return fail('Build', `Failed after ${dur}s: ${r.out?.slice(0, 150)}`);
  log(`  Completed in ${dur}s`);
  pass('Build');
}

function step3Deploy() {
  log('Step 3: Deploy');
  if (SKIP_DEPLOY) return skip('Deploy', 'Skipped via --skip-deploy');
  const t0 = Date.now();
  const r = runSafe('npx wrangler deploy 2>&1');
  const dur = ((Date.now() - t0) / 1000).toFixed(1);
  if (!r.ok) return fail('Deploy', `Failed after ${dur}s: ${r.out?.slice(0, 150)}`);
  log(`  Completed in ${dur}s`);
  pass('Deploy');
}

async function step4VerifySha() {
  log('Step 4: SHA verification');
  const local = runSafe('git rev-parse --short HEAD');
  if (!local.ok) return fail('SHA verification', 'Cannot get local SHA');
  const res = await fetchJson(`${PRODUCTION_URL}/api/version`);
  if (!res.ok || !res.data) return fail('SHA verification', `Cannot fetch /api/version`);
  const live = res.data.shortSha || res.data.sha?.slice(0, 8);
  if (!live) return fail('SHA verification', 'No shortSha in response');
  if (local.out === live) { log(`  Local: ${local.out} Live: ${live} ✓ Match`); pass('SHA verification'); }
  else fail('SHA verification', `Mismatch — Local: ${local.out}, Live: ${live}`);
}

async function step5Smoke() {
  log('Step 5: Smoke tests');
  const checks = [
    ['Setup Wizard', '/api/credentials', 'GET', [200, 401, 403]],
    ['NOWPayments IPN', '/api/webhooks/nowpayments', 'POST', [200, 400, 401]],
    ['Telegram Bot', '/api/telegram/webhook', 'POST', [200, 400, 401]],
    ['Health check', '/health', 'GET', [200]],
  ];
  let passed = 0;
  for (const [name, path, method, expected] of checks) {
    const ok = await fetchCheck(`${PRODUCTION_URL}${path}`, method, expected);
    if (ok) passed++; else log(`  ✗ ${name}`);
  }
  if (passed === checks.length) { log(`  ${passed}/${checks.length} passed`); pass('Smoke tests'); }
  else fail('Smoke tests', `${checks.length - passed}/${checks.length} failed`);
}

async function step6Health() {
  log('Step 6: Health monitoring (30s)');
  const url = `${PRODUCTION_URL}/health`;
  const iterations = 6;
  let errors = 0;
  for (let i = 0; i < iterations; i++) {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 10_000);
    try {
      const res = await fetch(url, { signal: c.signal });
      clearTimeout(t);
      if (!res.ok) errors++;
    } catch { clearTimeout(t); errors++; }
    if (i < iterations - 1) await new Promise((r) => setTimeout(r, 5000));
  }
  if (errors > 0) fail('Health monitoring', `${errors}/${iterations} polls failed`);
  else { log(`  ${iterations}/${iterations} passed`); pass('Health monitoring'); }
}

function step7Report() {
  console.log('\n' + '='.repeat(60));
  console.log('E2E DEPLOY VERIFICATION REPORT');
  console.log('='.repeat(60));
  console.log(`Target: ${PRODUCTION_URL}`);
  console.log(`Time: ${ts()}\n`);
  for (const r of results) {
    const icon = r.status === 'PASS' ? '✓ PASS' : r.status === 'SKIP' ? '○ SKIP' : '✗ FAIL';
    console.log(`  ${icon}  ${r.step}${r.reason ? ` — ${r.reason}` : ''}`);
  }
  const p = results.filter((r) => r.status === 'PASS').length;
  const f = results.filter((r) => r.status === 'FAIL').length;
  const s = results.filter((r) => r.status === 'SKIP').length;
  console.log(`\n  Total: ${p} passed, ${f} failed, ${s} skipped`);
  console.log(exitCode === 0
    ? '\n✓ ALL CHECKS PASSED — deployment verified.\n'
    : '\n✗ VERIFICATION FAILED — review failures above.\n');
}

async function main() {
  console.log('='.repeat(60));
  console.log('E2E Deploy Verification Pipeline');
  console.log(`Target: ${PRODUCTION_URL}${DRY_RUN ? ' (DRY RUN)' : ''}${SKIP_DEPLOY ? ' (skip deploy)' : ''}`);
  console.log('='.repeat(60) + '\n');

  step1Preflight();
  if (exitCode !== 0) { step7Report(); process.exit(exitCode); }
  step2Build();
  if (exitCode !== 0) { step7Report(); process.exit(exitCode); }
  step3Deploy();
  if (exitCode !== 0 && !SKIP_DEPLOY) { step7Report(); process.exit(exitCode); }
  await step4VerifySha();
  if (exitCode !== 0) { step7Report(); process.exit(exitCode); }
  await step5Smoke();
  if (exitCode !== 0) { step7Report(); process.exit(exitCode); }
  await step6Health();
  step7Report();
  process.exit(exitCode);
}

main().catch((e) => { fail('Pipeline', e.message); step7Report(); process.exit(1); });
