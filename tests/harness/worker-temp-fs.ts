/**
 * Safe worker-isolated temporary filesystem helper for Vitest multi-worker execution.
 * Ensures zero file collisions across concurrent worker threads and clean teardown.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export interface ScopedTempFs {
  readonly rootDir: string;
  resolvePath(...segments: string[]): string;
  writeFile(relativePath: string, content: string | Buffer): string;
  readFile(relativePath: string): string | undefined;
  removeFile(relativePath: string): boolean;
  cleanup(): boolean;
}

/** Extracts and sanitizes Vitest pool worker ID or falls back to PID. */
export function getWorkerId(): string {
  const poolId = process.env.VITEST_POOL_ID;
  if (poolId !== undefined && poolId.trim().length > 0) {
    return poolId.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  }
  return `pid-${process.pid}`;
}

/** Returns deterministic temp directory path for active worker thread. */
export function getWorkerTempDir(prefix = 'cashclaw-test'): string {
  return path.join(os.tmpdir(), `${prefix}-${getWorkerId()}`);
}

/** Ensures worker-isolated temporary directory exists. */
export function ensureWorkerTempDir(prefix = 'cashclaw-test'): string {
  const dir = getWorkerTempDir(prefix);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Resolves a safe relative path within worker temporary directory. */
export function resolveWorkerTempPath(relativePath: string, prefix = 'cashclaw-test'): string {
  return path.resolve(ensureWorkerTempDir(prefix), relativePath);
}

/** Writes content to a path inside worker temp dir. */
export function writeWorkerTempFile(relativePath: string, content: string | Buffer, prefix = 'cashclaw-test'): string {
  const fullPath = resolveWorkerTempPath(relativePath, prefix);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fullPath, content);
  return fullPath;
}

/** Reads content of a file in worker temp dir, returning undefined if missing. */
export function readWorkerTempFile(relativePath: string, prefix = 'cashclaw-test'): string | undefined {
  const fullPath = resolveWorkerTempPath(relativePath, prefix);
  try {
    return fs.readFileSync(fullPath, 'utf8');
  } catch {
    return undefined;
  }
}

/** Removes the worker temporary directory recursively. */
export function cleanupWorkerTempDir(prefix = 'cashclaw-test'): boolean {
  try {
    const dir = getWorkerTempDir(prefix);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

/** Creates a scoped temporary filesystem instance bound to a unique sub-scope. */
export function createScopedTempFs(scopeName?: string): ScopedTempFs {
  const baseDir = ensureWorkerTempDir();
  const subName = scopeName ? `${scopeName}-${Date.now()}` : `scope-${Math.random().toString(36).slice(2, 9)}`;
  const rootDir = path.join(baseDir, subName);
  fs.mkdirSync(rootDir, { recursive: true });

  return {
    rootDir,
    resolvePath: (...segments: string[]) => path.resolve(rootDir, ...segments),
    writeFile(relativePath: string, content: string | Buffer) {
      const target = path.resolve(rootDir, relativePath);
      const parent = path.dirname(target);
      if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
      fs.writeFileSync(target, content);
      return target;
    },
    readFile(relativePath: string) {
      try {
        return fs.readFileSync(path.resolve(rootDir, relativePath), 'utf8');
      } catch {
        return undefined;
      }
    },
    removeFile(relativePath: string) {
      try {
        fs.unlinkSync(path.resolve(rootDir, relativePath));
        return true;
      } catch {
        return false;
      }
    },
    cleanup() {
      try {
        if (fs.existsSync(rootDir)) fs.rmSync(rootDir, { recursive: true, force: true });
        return true;
      } catch {
        return false;
      }
    },
  };
}
