#!/usr/bin/env node
/**
 * One-command local launcher for POLY Paper Beta in isolated SYNTHETIC_ONLY mode.
 *
 * Usage:
 *   pnpm poly:demo          # Start loopback-only Worker (8787) + Dashboard (5173)
 *   pnpm poly:demo:stop     # Cleanly stop local demo processes
 *
 * Safety invariants:
 *   - ENVIRONMENT=dev, LIVE_TRADING_ENABLED=false, MARKET_DATA_ENABLED=false, SYNTHETIC_ONLY_MODE=true
 *   - Loopback-only (127.0.0.1); zero external market-data egress; zero remote D1 mutations.
 *   - Local-only credentials written to gitignored `.wrangler/poly-local-demo-credentials.json`.
 */

import { execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const STATE_DIR = path.join(process.cwd(), '.wrangler');
const PID_FILE = path.join(STATE_DIR, 'poly-local-demo.pids.json');
const CREDS_FILE = path.join(STATE_DIR, 'poly-local-demo-credentials.json');
const WORKER_LOG = path.join(STATE_DIR, 'poly-local-demo-worker.log');
const DASH_LOG = path.join(STATE_DIR, 'poly-local-demo-dashboard.log');
const WORKER_PORT = 8787;
const DASHBOARD_PORT = 5173;
const WORKER_URL = `http://127.0.0.1:${WORKER_PORT}`;
const DASHBOARD_URL = `http://127.0.0.1:${DASHBOARD_PORT}`;

function getGitHead() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function stopDemo() {
  if (!fs.existsSync(PID_FILE)) {
    console.log('No local POLY demo PID file found.');
    return;
  }
  const meta = JSON.parse(fs.readFileSync(PID_FILE, 'utf8'));
  for (const key of ['worker', 'dashboard']) {
    const entry = meta[key];
    if (entry && typeof entry.pid === 'number') {
      try {
        process.kill(-entry.pid, 'SIGTERM');
      } catch {
        try { process.kill(entry.pid, 'SIGTERM'); } catch { /* exited */ }
      }
      console.log(`Stopped ${key} (PID ${entry.pid})`);
    }
  }
  fs.rmSync(PID_FILE, { force: true });
}

async function verifyWorkerReady() {
  try {
    const res = await fetch(`${WORKER_URL}/api/health`);
    if (!res.ok) return null;
    const data = await res.json();
    if (
      data.service === 'poly-beta-api' &&
      data.mode === 'SYNTHETIC_ONLY' &&
      data.liveTradingEnabled === false &&
      data.marketDataEnabled === false &&
      data.supportedMarketCount >= 3
    ) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

async function verifyDashboardReady() {
  try {
    const res = await fetch(`${DASHBOARD_URL}/`);
    if (!res.ok) return false;
    const html = await res.text();
    return html.includes('<!doctype html>') || html.includes('<!DOCTYPE html>');
  } catch {
    return false;
  }
}

async function waitFor(checkFn, label, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await checkFn();
    if (ok) return ok;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function loadOrCreateCredentials() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  if (fs.existsSync(CREDS_FILE)) {
    return JSON.parse(fs.readFileSync(CREDS_FILE, 'utf8'));
  }
  const creds = {
    email: 'founder@poly-local.test',
    password: `PolyLocal#${crypto.randomBytes(8).toString('hex')}1!`,
    inviteToken: `poly-local-${crypto.randomBytes(16).toString('hex')}`,
  };
  fs.writeFileSync(CREDS_FILE, JSON.stringify(creds, null, 2), { mode: 0o600 });
  return creds;
}

async function bootstrapDemoAccount(creds) {
  const loginRes = await fetch(`${WORKER_URL}/api/beta/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: DASHBOARD_URL },
    body: JSON.stringify({ email: creds.email, password: creds.password }),
  });
  if (loginRes.ok) return 'existing';

  const signupRes = await fetch(`${WORKER_URL}/api/beta/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: DASHBOARD_URL, 'CF-Connecting-IP': '127.0.0.1' },
    body: JSON.stringify({
      email: creds.email,
      password: creds.password,
      inviteToken: creds.inviteToken,
      acknowledgeSimulationAndRisk: true,
      acknowledgeJurisdictionAndNonVpn: true,
    }),
  });
  if (signupRes.status === 201 || signupRes.status === 409) return 'seeded';
  const errText = await signupRes.text();
  throw new Error(`Demo bootstrap failed (${signupRes.status}): ${errText}`);
}

async function main() {
  if (process.argv.includes('--stop')) {
    stopDemo();
    return;
  }

  if (process.env.LIVE_TRADING_ENABLED === 'true' || process.env.MARKET_DATA_ENABLED === 'true') {
    console.error('REFUSED: LIVE_TRADING_ENABLED and MARKET_DATA_ENABLED must remain false in local synthetic demo.');
    process.exit(1);
  }

  fs.mkdirSync(STATE_DIR, { recursive: true });
  execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'poly-beta-db', '--local', '--config', 'wrangler.poly-beta.toml'], {
    stdio: 'inherit',
  });

  const creds = loadOrCreateCredentials();
  const inviteHash = crypto.createHash('sha256').update(creds.inviteToken).digest('hex');
  const sessionSecret = crypto.randomBytes(24).toString('hex');
  const invitesJson = JSON.stringify([
    { id: 'local-demo-1', email: creds.email, tokenHash: inviteHash, expiresAtMs: Date.now() + 7 * 86_400_000 },
  ]);

  const existingMeta = fs.existsSync(PID_FILE) ? JSON.parse(fs.readFileSync(PID_FILE, 'utf8')) : {};
  const meta = { worktree: process.cwd(), headSha: getGitHead(), ...existingMeta };

  if (!(await verifyWorkerReady())) {
    const outFd = fs.openSync(WORKER_LOG, 'a');
    const worker = spawn(
      'npx',
      [
        'wrangler', 'dev', '--config', 'wrangler.poly-beta.toml',
        '--port', String(WORKER_PORT), '--ip', '127.0.0.1',
        '--var', 'ENVIRONMENT:dev',
        '--var', 'LIVE_TRADING_ENABLED:false',
        '--var', 'MARKET_DATA_ENABLED:false',
        '--var', 'MAINTENANCE_MODE:false',
        '--var', 'SYNTHETIC_ONLY_MODE:true',
        '--var', `ALLOWED_ORIGINS:${DASHBOARD_URL},http://localhost:${DASHBOARD_PORT}`,
        '--var', `BETA_SIGNUP_ALLOWLIST:${creds.email}`,
        '--var', `BETA_SIGNUP_INVITES:${invitesJson}`,
        '--var', `POLY_BETA_SESSION_SECRET:${sessionSecret}`,
      ],
      { detached: true, stdio: ['ignore', outFd, outFd] },
    );
    worker.unref();
    meta.worker = { pid: worker.pid, startedAt: new Date().toISOString() };
  }

  if (!(await verifyDashboardReady())) {
    const outFd = fs.openSync(DASH_LOG, 'a');
    const dash = spawn(
      'pnpm',
      ['exec', 'vite', '--host', '127.0.0.1', '--port', String(DASHBOARD_PORT), '--strictPort'],
      {
        cwd: path.join(process.cwd(), 'dashboard'),
        env: { ...process.env, VITE_APP_MODE: 'poly-beta', VITE_POLY_BETA_API_URL: WORKER_URL },
        detached: true,
        stdio: ['ignore', outFd, outFd],
      },
    );
    dash.unref();
    meta.dashboard = { pid: dash.pid, startedAt: new Date().toISOString() };
  }

  fs.writeFileSync(PID_FILE, JSON.stringify(meta, null, 2));

  await waitFor(verifyWorkerReady, 'Worker SYNTHETIC_ONLY /api/health');
  await waitFor(verifyDashboardReady, 'Dashboard http://127.0.0.1:5173/');
  const acctStatus = await bootstrapDemoAccount(creds);

  console.log('\nPOLY Local Synthetic Demo READY (SYNTHETIC_ONLY, zero external egress):');
  console.log(`  Dashboard:   ${DASHBOARD_URL}/`);
  console.log(`  Worker:      ${WORKER_URL}/api/health`);
  console.log(`  Demo account (${acctStatus}): ${creds.email} (local credentials in .wrangler/poly-local-demo-credentials.json)`);
  console.log('  Stop with:   pnpm poly:demo:stop\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
