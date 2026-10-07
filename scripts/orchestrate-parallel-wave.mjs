#!/usr/bin/env node

/**
 * Parallel Wave Orchestrator Script.
 * Runs pre-flight checks, spawns parallel test workers per lane, and synthesizes status report.
 */

import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyParallelLanes } from './verify-parallel-lanes.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const PREFLIGHT_TASKS = [
  { name: 'Oversized File Check', cmd: 'node', args: ['scripts/oversized-file-check.mjs'] },
  { name: 'Quality Baseline', cmd: 'node', args: ['scripts/check-quality-baseline.mjs', '--quality'] },
  { name: 'Typecheck', cmd: 'npx', args: ['tsc', '--noEmit'] },
];

const PARALLEL_LANE_WORKERS = [
  {
    id: 'lane-1',
    name: 'Lane 1 Tests (Autonomy Swarm)',
    cmd: 'npx',
    args: ['vitest', 'run', 'tests/unit/agentic/swarm-dispatcher.test.ts', 'tests/unit/alpha-lab/orchestration/', 'tests/unit/signal/'],
  },
  {
    id: 'lane-2',
    name: 'Lane 2 Tests (GTM & Telegram)',
    cmd: 'npx',
    args: ['vitest', 'run', 'tests/unit/agentic/campaign-dispatcher.test.ts', 'tests/unit/platform/marketing/', 'tests/unit/platform/telegram/'],
  },
  {
    id: 'lane-3',
    name: 'Lane 3 Tests (Billing & D1)',
    cmd: 'npx',
    args: ['vitest', 'run', 'tests/unit/billing/', 'tests/unit/db/d1-postgres-metering-sync.test.ts', 'tests/unit/durable-objects/'],
  },
  {
    id: 'lane-4',
    name: 'Lane 4 Tests (CI/CD Harness)',
    cmd: 'npx',
    args: ['vitest', 'run', 'tests/unit/harness/'],
  },
];

function runProcess(cmd, args, envOverrides = {}) {
  return new Promise((res) => {
    const start = Date.now();
    let stdout = '';
    let stderr = '';

    const proc = spawn(cmd, args, {
      cwd: ROOT,
      env: { ...process.env, ...envOverrides, FORCE_COLOR: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      res({
        code: code ?? 1,
        durationMs: Date.now() - start,
        stdout,
        stderr,
      });
    });

    proc.on('error', (err) => {
      res({
        code: 1,
        durationMs: Date.now() - start,
        stdout,
        stderr: err.message,
      });
    });
  });
}

async function orchestrateParallelWave() {
  console.log('===========================================================');
  console.log('   Next Wave V Multi-Agent Parallel Orchestrator');
  console.log('===========================================================\n');

  console.log('>> Stage 1: File Boundary & Policy Pre-Flight Verification');
  const boundariesOk = verifyParallelLanes();
  if (!boundariesOk) {
    console.error('❌ Boundary verification failed. Halting.');
    process.exit(1);
  }

  console.log('\n>> Stage 2: Code Quality & Type Integrity Pre-Flight');
  for (const task of PREFLIGHT_TASKS) {
    process.stdout.write(`  - Running ${task.name}... `);
    const result = await runProcess(task.cmd, task.args);
    if (result.code === 0) {
      console.log(`PASS (${result.durationMs}ms)`);
    } else {
      console.log(`FAIL (${result.durationMs}ms)`);
      if (result.stderr || result.stdout) {
        console.error(result.stderr || result.stdout);
      }
      process.exit(1);
    }
  }

  console.log('\n>> Stage 3: Spawning Multi-Worker Parallel Lane Test Suite');
  const startTime = Date.now();
  const workerPromises = PARALLEL_LANE_WORKERS.map((worker) =>
    runProcess(worker.cmd, worker.args, { VITEST_POOL_ID: worker.id }).then((res) => ({
      ...worker,
      ...res,
    }))
  );

  const workerResults = await Promise.all(workerPromises);
  const totalDuration = Date.now() - startTime;

  console.log('\n===========================================================');
  console.log('   Parallel Lane Execution Summary Report');
  console.log('===========================================================');
  let allWorkersPassed = true;

  for (const r of workerResults) {
    const status = r.code === 0 ? 'PASS' : 'FAIL';
    if (r.code !== 0) allWorkersPassed = false;
    console.log(`  [${status}] ${r.name.padEnd(35)} in ${r.durationMs}ms`);
    if (r.code !== 0) {
      console.error(`\n--- Failure Details: ${r.name} ---\n${r.stdout}\n${r.stderr}`);
    }
  }

  console.log('-----------------------------------------------------------');
  console.log(`Total Parallel Duration: ${totalDuration}ms`);
  console.log(`Overall Result: ${allWorkersPassed ? 'ALL LANES GREEN ✅' : 'FAILURES DETECTED ❌'}`);
  console.log('===========================================================\n');

  if (!allWorkersPassed) {
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  orchestrateParallelWave().catch((err) => {
    console.error('Fatal error during orchestration:', err);
    process.exit(1);
  });
}
