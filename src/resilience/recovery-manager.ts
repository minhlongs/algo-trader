// State persistence & crash recovery - saves instance-isolated snapshots to disk
import {
  readFileSync,
  writeFileSync,
  unlinkSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
} from 'node:fs';
import { dirname, basename, extname, join } from 'node:path';
import { logger } from '../shared/utils/logger';
import type { StrategyConfig, Position } from '../desk/core/types';

const RECOVERY_FILE_DEFAULT = 'data/recovery-state.json';
/** Maximum age (ms) of a recovery snapshot to be considered valid */
const MAX_SNAPSHOT_AGE_MS = 60 * 60 * 1000; // 1 hour

export interface RecoveryState {
  strategies: StrategyConfig[];
  positions: Position[];
  lastEquity: string;
  timestamp: number;
}

/**
 * Resolve a per-instance snapshot path.
 * PM2 sets PM2_INSTANCE_ID (0-based integer). Fallback to process.pid.
 * Example: data/recovery-state.json → data/recovery-state-0.json
 */
function resolveInstancePath(basePath: string): string {
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
function listInstancePaths(basePath: string): string[] {
  const ext = extname(basePath);
  const stem = basename(basePath, ext);
  const dir = dirname(basePath);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.startsWith(`${stem}-`) && f.endsWith(ext))
    .map((f) => join(dir, f));
}

export class RecoveryManager {
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  /** Base path (e.g. data/recovery-state.json) — instance ID is injected at runtime */
  private readonly basePath: string;
  /** Resolved path for this instance (computed once at construction) */
  private readonly filePath: string;

  constructor(filePath: string = RECOVERY_FILE_DEFAULT) {
    this.basePath = filePath;
    this.filePath = resolveInstancePath(filePath);
  }

  /** Persist state snapshot using atomic write (temp file + rename) */
  saveState(state: RecoveryState): void {
    try {
      const dir = dirname(this.filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      const payload: RecoveryState = { ...state, timestamp: Date.now() };
      const json = JSON.stringify(payload, null, 2);
      // Atomic write: write to temp then rename to avoid partial reads by other instances
      const tmp = `${this.filePath}.tmp`;
      writeFileSync(tmp, json, 'utf8');
      renameSync(tmp, this.filePath);
      logger.debug('Recovery state saved', 'RecoveryManager', { file: this.filePath });
    } catch (err) {
      logger.error('Failed to save recovery state', 'RecoveryManager', {
        error: String(err),
        file: this.filePath,
      });
    }
  }

  /**
   * Load most recent valid snapshot across all instance files.
   * Falls back to this instance's own file when no siblings exist.
   */
  loadState(): RecoveryState | null {
    const candidates = listInstancePaths(this.basePath);
    // If no siblings found, try legacy single-file path (backward compat)
    const paths = candidates.length > 0 ? candidates : [this.filePath];

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
        file: this.filePath,
        timestamp: new Date(best.timestamp).toISOString(),
      });
    }
    return best;
  }

  /**
   * Start periodic auto-save.
   * @param intervalMs - Save interval in milliseconds
   * @param stateProvider - Callback that returns current state to snapshot
   */
  startAutoSave(intervalMs: number, stateProvider: () => RecoveryState): void {
    if (this.autoSaveTimer !== null) {
      logger.warn('Auto-save already running, stopping previous timer', 'RecoveryManager');
      this.stopAutoSave();
    }
    this.autoSaveTimer = setInterval(() => {
      try {
        const state = stateProvider();
        this.saveState(state);
      } catch (err) {
        logger.error('Auto-save state provider threw', 'RecoveryManager', { error: String(err) });
      }
    }, intervalMs);
    logger.info('Auto-save started', 'RecoveryManager', { intervalMs });
  }

  /** Stop periodic auto-save */
  stopAutoSave(): void {
    if (this.autoSaveTimer !== null) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
      logger.info('Auto-save stopped', 'RecoveryManager');
    }
  }

  /**
   * Returns true if a valid, recent recovery snapshot exists (any instance).
   * "Recent" = saved within the last hour.
   */
  shouldRecover(): boolean {
    const state = this.loadState();
    if (!state) return false;
    const age = Date.now() - state.timestamp;
    const isRecent = age < MAX_SNAPSHOT_AGE_MS;
    if (!isRecent) {
      logger.warn('Recovery state exists but is too old', 'RecoveryManager', {
        ageMinutes: Math.round(age / 60000),
      });
    }
    return isRecent;
  }

  /** Delete this instance's recovery file on clean shutdown */
  clearState(): void {
    if (!existsSync(this.filePath)) return;
    try {
      unlinkSync(this.filePath);
      logger.info('Recovery state cleared', 'RecoveryManager', { file: this.filePath });
    } catch (err) {
      logger.error('Failed to clear recovery state', 'RecoveryManager', { error: String(err) });
    }
  }

  /** Delete all instance snapshot files — use on full cluster shutdown */
  clearAllStates(): void {
    const paths = listInstancePaths(this.basePath);
    for (const p of paths) {
      if (!existsSync(p)) continue;
      try {
        unlinkSync(p);
        logger.info('Recovery state cleared', 'RecoveryManager', { file: p });
      } catch (err) {
        logger.error('Failed to clear recovery state', 'RecoveryManager', {
          file: p,
          error: String(err),
        });
      }
    }
  }

  isAutoSaveRunning(): boolean {
    return this.autoSaveTimer !== null;
  }
}

/** Default singleton instance */
export const recoveryManager = new RecoveryManager();
