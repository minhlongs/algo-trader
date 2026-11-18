/**
 * Cross-platform disk-space check invoked by `npm run disk:check` and `npm run build:worker`.
 *
 * Uses Node's built-in `fs.statfsSync` so it runs cleanly on Node 22 (CI) and Node 26+
 * without relying on deprecated `ts-node` CommonJS loaders (#271).
 */

import { statfsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface DiskCheckOptions {
  warnMb?: number;
  minHardMb?: number;
}

export interface DiskCheckResult {
  targetPath: string;
  freeMb: number;
  ok: boolean;
  warned: boolean;
  message: string;
}

const DEFAULT_WARN_MB = 1_024;
const DEFAULT_MIN_HARD_MB = 128;

export function checkDiskSpace(
  targetPath = process.cwd(),
  options: DiskCheckOptions = {},
): DiskCheckResult {
  const warnMb = options.warnMb ?? DEFAULT_WARN_MB;
  const minHardMb = options.minHardMb ?? DEFAULT_MIN_HARD_MB;
  const resolved = resolve(targetPath);
  const stats = statfsSync(resolved);
  const freeBytes = BigInt(stats.bavail) * BigInt(stats.bsize);
  const freeMb = Number(freeBytes / (1024n * 1024n));

  if (freeMb < minHardMb) {
    return {
      targetPath: resolved,
      freeMb,
      ok: false,
      warned: true,
      message: `Disk check FAILED: only ${freeMb}MB free (< ${minHardMb}MB hard minimum)`,
    };
  }

  if (freeMb < warnMb) {
    return {
      targetPath: resolved,
      freeMb,
      ok: true,
      warned: true,
      message: `Warning: only ${freeMb}MB free (< ${warnMb}MB recommended). Disk check: ${freeMb}MB free`,
    };
  }

  return {
    targetPath: resolved,
    freeMb,
    ok: true,
    warned: false,
    message: `Disk check: ${freeMb}MB free`,
  };
}

function writeToStdout(text: string): void {
  process.stdout.write(text);
}

export function runDiskMonitorCli(
  argv: string[] = process.argv,
  cwd: string = process.cwd(),
  options: DiskCheckOptions = {},
  writeOut: (text: string) => void = writeToStdout,
): number {
  const invokedPath = argv[1] ? resolve(argv[1]) : '';
  if (invokedPath !== fileURLToPath(import.meta.url)) {
    return 0;
  }
  const result = checkDiskSpace(cwd, options);
  writeOut(`${result.message}\n`);
  if (!result.ok) {
    process.exitCode = 1;
  }
  return result.ok ? 0 : 1;
}

runDiskMonitorCli();
