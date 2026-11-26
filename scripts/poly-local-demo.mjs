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
 */

import { execSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PID_FILE = path.join(process.cwd(), '.wrangler', 'poly-local-demo.pids.json');
const WORKER_PORT = 8787;
const DASHBOARD_PORT = 5173;

function isStopRequested() {
  return process.argv.includes('--stop');
}

function stopDemo() {
  if (!fs.existsSync(PID_FILE)) {
    console.log('No local POLY demo PID file found.');
    return;
  }
  const pids = JSON.parse(fs.readFileSync(PID_FILE, 'utf8'));
  for (const [name, pid] of Object.entries(pids)) {
    if (typeof pid === 'number') {
      try {
        process.kill(pid, 'SIGTERM');
        console.log(`Stopped ${name} (PID ${pid})`);
      } catch {
        // Already exited
      }
    }
  }
  fs.rmSync(PID_FILE, { force: true });
}

async function isPortOpen(url) {
  try {
    const res = await fetch(url);
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  if (isStopRequested()) {
    stopDemo();
    return;
  }

  if (process.env.LIVE_TRADING_ENABLED === 'true' || process.env.MARKET_DATA_ENABLED === 'true') {
    console.error('REFUSED: LIVE_TRADING_ENABLED and MARKET_DATA_ENABLED must remain false in local synthetic demo.');
    process.exit(1);
  }

  execSync('npx wrangler d1 migrations apply poly-beta-db --local --config wrangler.poly-beta.toml', {
    stdio: 'inherit',
  });

  const demoEmail = 'founder@poly-local.test';
  const inviteRaw = `poly-local-${crypto.randomBytes(16).toString('hex')}`;
  const inviteHash = crypto.createHash('sha256').update(inviteRaw).digest('hex');
  const sessionSecret = crypto.randomBytes(24).toString('hex');
  const invitesJson = JSON.stringify([
    { id: 'local-demo-1', email: demoEmail, tokenHash: inviteHash, expiresAtMs: Date.now() + 7 * 86_400_000 },
  ]);

  const pids = {};
  if (!(await isPortOpen(`http://127.0.0.1:${WORKER_PORT}/api/health`))) {
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
        '--var', `ALLOWED_ORIGINS:http://127.0.0.1:${DASHBOARD_PORT},http://localhost:${DASHBOARD_PORT}`,
        '--var', `BETA_SIGNUP_ALLOWLIST:${demoEmail}`,
        '--var', `BETA_SIGNUP_INVITES:${invitesJson}`,
        '--var', `POLY_BETA_SESSION_SECRET:${sessionSecret}`,
      ],
      { detached: true, stdio: 'ignore' },
    );
    worker.unref();
    pids.worker = worker.pid;
  }

  if (!(await isPortOpen(`http://127.0.0.1:${DASHBOARD_PORT}/`))) {
    const dash = spawn(
      'pnpm',
      ['exec', 'vite', '--host', '127.0.0.1', '--port', String(DASHBOARD_PORT), '--strictPort'],
      {
        cwd: path.join(process.cwd(), 'dashboard'),
        env: {
          ...process.env,
          VITE_APP_MODE: 'poly-beta',
          VITE_POLY_BETA_API_BASE: `http://127.0.0.1:${WORKER_PORT}`,
        },
        detached: true,
        stdio: 'ignore',
      },
    );
    dash.unref();
    pids.dashboard = dash.pid;
  }

  fs.mkdirSync(path.dirname(PID_FILE), { recursive: true });
  fs.writeFileSync(PID_FILE, JSON.stringify(pids, null, 2));

  console.log('\nPOLY Local Synthetic Demo Ready (SYNTHETIC_ONLY, zero external egress):');
  console.log(`  Dashboard: http://127.0.0.1:${DASHBOARD_PORT}/`);
  console.log(`  Worker:    http://127.0.0.1:${WORKER_PORT}/api/health`);
  console.log(`  Demo user: ${demoEmail}`);
  console.log('  Stop with: pnpm poly:demo:stop\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
