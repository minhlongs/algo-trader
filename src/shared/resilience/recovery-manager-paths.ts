import { existsSync, readdirSync } from 'node:fs';
import { dirname, basename, join } from 'node:path';

/**
 * Resolve the instance identifier: PM2_INSTANCE_ID env var, then process.pid.
 */
export function resolveInstanceId(): string {
  return process.env['PM2_INSTANCE_ID'] ?? String(process.pid);
}

/**
 * Given a base file path, return the instance-specific file path.
 * e.g. /tmp/x/recovery-state.json -> /tmp/x/recovery-state-3.json
 */
export function instanceFilePath(basePath: string, instanceId: string): string {
  const dir = dirname(basePath);
  const stem = basename(basePath, '.json');
  return join(dir, `${stem}-${instanceId}.json`);
}

/**
 * Return all instance file paths matching the base pattern in the same directory.
 */
export function discoverInstanceFiles(basePath: string): string[] {
  const dir = dirname(basePath);
  const stem = basename(basePath, '.json');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.startsWith(`${stem}-`) && f.endsWith('.json'))
    .map((f) => join(dir, f));
}
