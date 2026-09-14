/**
 * Recovery Manager Path Utilities.
 */

import { existsSync, readdirSync } from 'node:fs';
import { dirname, basename, extname, join } from 'node:path';

/**
 * Resolve a per-instance snapshot path.
 * PM2 sets PM2_INSTANCE_ID (0-based integer). Fallback to process.pid.
 * Example: data/recovery-state.json → data/recovery-state-0.json
 */
export function resolveInstancePath(basePath: string): string {
  const instanceId = process.env['PM2_INSTANCE_ID'] ?? String(process.pid);
  const ext = extname(basePath);
  const stem = basename(basePath, ext);
  const dir = dirname(basePath);
  return join(dir, `${stem}-${instanceId}${ext}`);
}

/**
 * Derive the glob stem used to scan sibling instance files.
 * Returns all `recovery-state-*.json` files in the same directory.
 */
export function listInstancePaths(basePath: string): string[] {
  const ext = extname(basePath);
  const stem = basename(basePath, ext);
  const dir = dirname(basePath);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.startsWith(`${stem}-`) && f.endsWith(ext))
    .map((f) => join(dir, f));
}
