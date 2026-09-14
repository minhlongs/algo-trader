/**
 * Recovery Manager File I/O Operations.
 */

import {
  readFileSync,
  writeFileSync,
  unlinkSync,
  existsSync,
  mkdirSync,
  renameSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { logger } from '../shared/utils/logger';
import type { RecoveryState } from './recovery-manager-types';
import { listInstancePaths } from './recovery-manager-paths';

/** Persist state snapshot using atomic write (temp file + rename) */
export function writeRecoverySnapshot(filePath: string, state: RecoveryState): void {
  try {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const payload: RecoveryState = { ...state, timestamp: Date.now() };
    const json = JSON.stringify(payload, null, 2);
    const tmp = `${filePath}.tmp`;
    writeFileSync(tmp, json, 'utf8');
    renameSync(tmp, filePath);
    logger.debug('Recovery state saved', 'RecoveryManager', { file: filePath });
  } catch (err) {
    logger.error('Failed to save recovery state', 'RecoveryManager', {
      error: String(err),
      file: filePath,
    });
  }
}

/** Load most recent valid snapshot across all instance files. */
export function loadLatestRecoverySnapshot(
  basePath: string,
  defaultPath: string,
): RecoveryState | null {
  const candidates = listInstancePaths(basePath);
  const paths = candidates.length > 0 ? candidates : [defaultPath];

  let best: RecoveryState | null = null;
  for (const p of paths) {
    if (!existsSync(p)) continue;
    try {
      const raw = readFileSync(p, 'utf8');
      const parsed = JSON.parse(raw) as RecoveryState;
      if (!best || parsed.timestamp > best.timestamp) {
        best = parsed;
      }
    } catch (err) {
      logger.warn('Skipping unreadable recovery snapshot', 'RecoveryManager', {
        file: p,
        error: String(err),
      });
    }
  }

  if (best) {
    logger.info('Recovery state loaded', 'RecoveryManager', {
      file: defaultPath,
      timestamp: new Date(best.timestamp).toISOString(),
    });
  }
  return best;
}

/** Delete this instance's recovery file on clean shutdown */
export function clearRecoveryPath(filePath: string): void {
  if (!existsSync(filePath)) return;
  try {
    unlinkSync(filePath);
    logger.info('Recovery state cleared', 'RecoveryManager', { file: filePath });
  } catch (err) {
    logger.error('Failed to clear recovery state', 'RecoveryManager', { error: String(err) });
  }
}

/** Delete all instance snapshot files — use on full cluster shutdown */
export function clearAllRecoveryPaths(basePath: string): void {
  const paths = listInstancePaths(basePath);
  for (const p of paths) {
    if (!existsSync(p)) continue;
    try {
      unlinkSync(p);
      logger.info('Recovery state cleared', 'RecoveryManager', { file: p });
    } catch (err) {
      logger.error('Failed to clear recovery state', 'RecoveryManager', {
        error: String(err),
      });
    }
  }
}
