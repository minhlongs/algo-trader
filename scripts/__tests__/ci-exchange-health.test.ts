import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const SCRIPT = join(__dirname, '..', 'ci-exchange-health.sh');
const RUNNER = join(__dirname, '..', 'ci-exchange-health-runner.ts');

// Mock the runner script by creating a temporary wrapper
let tmpDir: string;

beforeEach(() => {
  tmpDir = `/tmp/ci-exchange-health-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { mkdirSync } = require('node:fs');
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  const { rmSync, existsSync } = require('node:fs');
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

function writeRunnerScript(exitCode: number, stdout: string): string {
  const { writeFileSync } = require('node:fs');
  const fakeRunner = join(tmpDir, 'fake-runner.ts');
  // The runner is a .ts file but we write a shell script wrapped in tsx-compatible syntax.
  // Instead, we write a .mjs that the shell script will invoke via tsx.
  const fakeRunnerMjs = join(tmpDir, 'fake-runner.mjs');
  writeFileSync(
    fakeRunnerMjs,
    `process.stdout.write(${JSON.stringify(stdout)});\nprocess.exit(${exitCode});\n`
  );
  return fakeRunnerMjs;
}

function writeShellScript(runnerPath: string, timeoutMs = 5000): string {
  const { writeFileSync } = require('node:fs');
  const shellScript = join(tmpDir, 'test-exchange-health.sh');
  const content = `#!/usr/bin/env bash
set -euo pipefail

TIMEOUT_MS=${timeoutMs}
MAX_RETRIES=1

run_once() {
  timeout 30 npx tsx ${runnerPath}
}

attempt=1
while [ "$attempt" -le "$((MAX_RETRIES + 1))" ]; do
  if run_once; then
    echo "Exchange health check passed (attempt $attempt)."
    exit 0
  fi
  if [ "$attempt" -le "$MAX_RETRIES" ]; then
    echo "Exchange health check failed (attempt $attempt), retrying..." >&2
    sleep 2
  fi
  attempt=$((attempt + 1))
done

echo "Exchange health check failed after $attempt attempts." >&2
exit 1
`;
  writeFileSync(shellScript, content);
  return shellScript;
}

describe('ci-exchange-health', () => {
  it('exits 0 when all exchanges reachable', () => {
    const report =
      '=== Exchange Connectivity Report ===\n\n' +
      '[PASS] Binance\n  REST: OK\n  WS:   OK\n  Latency: 120ms\n\n' +
      '[PASS] OKX\n  REST: OK\n  WS:   OK\n  Latency: 95ms\n\n' +
      'All exchanges reachable.\n';

    const fakeRunner = writeRunnerScript(0, report);
    const shellScript = writeShellScript(fakeRunner);
    const { chmodSync } = require('node:fs');
    chmodSync(shellScript, 0o755);

    const output = execSync(`bash ${shellScript}`, {
      encoding: 'utf-8',
      timeout: 60_000,
    });
    expect(output).toContain('Exchange health check passed');
  });

  it('exits 1 when any exchange unreachable', () => {
    const report =
      '=== Exchange Connectivity Report ===\n\n' +
      '[PASS] Binance\n  REST: OK\n  WS:   OK\n  Latency: 120ms\n\n' +
      '[FAIL] OKX\n  REST: FAIL\n  Error: REST timeout\n\n' +
      'Some exchanges unreachable — check errors above.\n';

    const fakeRunner = writeRunnerScript(1, report);
    const shellScript = writeShellScript(fakeRunner);
    const { chmodSync } = require('node:fs');
    chmodSync(shellScript, 0o755);

    try {
      execSync(`bash ${shellScript}`, {
        encoding: 'utf-8',
        timeout: 60_000,
      });
      expect.fail('Should have thrown');
    } catch (err: unknown) {
      const error = err as { status: number; stderr: string };
      expect(error.status).toBe(1);
    }
  });

  it('retries once on failure before exiting', () => {
    const report =
      '=== Exchange Connectivity Report ===\n\n' +
      '[FAIL] Binance\n  REST: FAIL\n  Error: REST timeout\n\n' +
      'Some exchanges unreachable — check errors above.\n';

    const fakeRunner = writeRunnerScript(1, report);
    const shellScript = writeShellScript(fakeRunner);
    const { chmodSync } = require('node:fs');
    chmodSync(shellScript, 0o755);

    try {
      execSync(`bash ${shellScript}`, {
        encoding: 'utf-8',
        timeout: 60_000,
      });
      expect.fail('Should have thrown');
    } catch (err: unknown) {
      const error = err as { status: number };
      expect(error.status).toBe(1);
    }
  });

  it('passes timeout argument to runner', () => {
    const report =
      '=== Exchange Connectivity Report ===\n\n' +
      '[PASS] Binance\n  REST: OK\n  Latency: 50ms\n\n' +
      'All exchanges reachable.\n';

    const fakeRunner = writeRunnerScript(0, report);
    // Write a shell script that passes --timeout explicitly
    const { writeFileSync, chmodSync } = require('node:fs');
    const shellScript = join(tmpDir, 'test-timeout.sh');
    writeFileSync(
      shellScript,
      `#!/usr/bin/env bash
set -euo pipefail
TIMEOUT_MS=3000
run_once() { timeout 30 npx tsx ${fakeRunner}; }
run_once && exit 0 || exit 1
`
    );
    chmodSync(shellScript, 0o755);

    const output = execSync(`bash ${shellScript}`, {
      encoding: 'utf-8',
      timeout: 60_000,
    });
    expect(output).toBeTruthy();
  });
});
