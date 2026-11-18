import { afterEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { checkDiskSpace, runDiskMonitorCli } from '../../scripts/disk-monitor';

const ROOT = resolve(__dirname, '../..');
const SCRIPT_PATH = resolve(ROOT, 'scripts/disk-monitor.ts');

describe('disk-monitor (#271)', () => {
  afterEach(() => {
    process.exitCode = undefined;
    vi.restoreAllMocks();
  });

  it('evaluates available disk space via fs.statfsSync and enforces thresholds cleanly', () => {
    const defaultResult = checkDiskSpace();
    expect(defaultResult.freeMb).toBeGreaterThan(0);

    const okResult = checkDiskSpace(ROOT, { warnMb: 1, minHardMb: 0 });
    expect(okResult.freeMb).toBeGreaterThan(0);
    expect(okResult.ok).toBe(true);

    const warnResult = checkDiskSpace(ROOT, {
      warnMb: okResult.freeMb + 10_000_000,
      minHardMb: 0,
    });
    expect(warnResult.ok).toBe(true);
    expect(warnResult.warned).toBe(true);

    const failResult = checkDiskSpace(ROOT, {
      warnMb: okResult.freeMb + 10_000_000,
      minHardMb: okResult.freeMb + 10_000_000,
    });
    expect(failResult.ok).toBe(false);
  });

  it('covers CLI entrypoint runner for imported, passing, and failing invocations', () => {
    expect(runDiskMonitorCli(['node'])).toBe(0);

    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    expect(runDiskMonitorCli(['node', SCRIPT_PATH], ROOT, { warnMb: 1, minHardMb: 0 })).toBe(0);
    expect(String(stdout.mock.calls[0]?.[0] ?? '')).toContain('Disk check:');
    stdout.mockRestore();

    const failLines: string[] = [];
    expect(
      runDiskMonitorCli(
        ['node', SCRIPT_PATH],
        ROOT,
        { warnMb: 999_999_999, minHardMb: 999_999_999 },
        (t) => failLines.push(t),
      ),
    ).toBe(1);
    expect(failLines.join('')).toContain('FAILED');
    expect(process.exitCode).toBe(1);
  });

  it('executes cleanly via npm run disk:check on current Node runtime', () => {
    const out = execFileSync('npm', ['run', 'disk:check'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(out).toContain('Disk check:');
  });
});
