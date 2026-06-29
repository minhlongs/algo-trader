// State persistence & crash recovery - saves snapshots to disk for restart recovery
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, basename, join } from 'node:path';
import { logger } from '../../core/logger.js';
import type { StrategyConfig, Position } from '../../core/types.js';

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
 * Resolve the instance identifier: PM2_INSTANCE_ID env var, then process.pid.
 */
function resolveInstanceId(): string {
  return process.env['PM2_INSTANCE_ID'] ?? String(process.pid);
}

/**
 * Given a base file path, return the instance-specific file path.
 * e.g. /tmp/x/recovery-state.json -> /tmp/x/recovery-state-3.json
 */
function instanceFilePath(basePath: string, instanceId: string): string {
  const dir = dirname(basePath);
  const stem = basename(basePath, '.json');
  return join(dir, `${stem}-${instanceId}.json`);
}

/**
 * Return all instance file paths matching the base pattern in the same directory.
 */
function discoverInstanceFiles(basePath: string): string[] {
  const dir = dirname(basePath);
  const stem = basename(basePath, '.json');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.startsWith(`${stem}-`) && f.endsWith('.json'))
    .map((f) => join(dir, f));
}

export class RecoveryManager {
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  private readonly filePath: string;
  private readonly instanceId: string;

  constructor(filePath: string = RECOVERY_FILE_DEFAULT) {
    this.filePath = filePath;
    this.instanceId = resolveInstanceId();
  }

  /** The instance-specific file this manager reads/writes. */
  get instanceFilePath(): string {
    return instanceFilePath(this.filePath, this.instanceId);
  }

  /** Persist state snapshot to the instance-specific JSON file */
  saveState(state: RecoveryState): void {
    const target = this.instanceFilePath;
    try {
      const dir = dirname(target);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      const payload: RecoveryState = { ...state, timestamp: Date.now() };
      writeFileSync(target, JSON.stringify(payload, null, 2), 'utf8');
      logger.debug('Recovery state saved', 'RecoveryManager', { file: target });
    } catch (err) {
      logger.error('Failed to save recovery state', 'RecoveryManager', {
        error: String(err),
        file: target,
      });
    }
  }

  /**
   * Load the most recent valid snapshot across all instance files.
   * Returns null if no valid files exist.
   */
  loadState(): RecoveryState | null {
    const files = discoverInstanceFiles(this.filePath);
    if (files.length === 0) return null;

    let best: RecoveryState | null = null;
    let bestTime = 0;

    for (const f of files) {
      try {
        const raw = readFileSync(f, 'utf8');
        const parsed = JSON.parse(raw) as RecoveryState;
        if (parsed.timestamp > bestTime) {
          bestTime = parsed.timestamp;
          best = parsed;
        }
      } catch {
        // skip corrupted files silently
      }
    }

    if (best) {
      logger.info('Recovery state loaded', 'RecoveryManager', {
        file: this.instanceFilePath,
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
   * Returns true if a valid, recent recovery snapshot exists.
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
    const target = this.instanceFilePath;
    if (!existsSync(target)) return;
    try {
      unlinkSync(target);
      logger.info('Recovery state cleared', 'RecoveryManager', { file: target });
    } catch (err) {
      logger.error('Failed to clear recovery state', 'RecoveryManager', { error: String(err) });
    }
  }

  /** Delete all instance recovery files in the directory */
  clearAllStates(): void {
    const files = discoverInstanceFiles(this.filePath);
    for (const f of files) {
      try {
        unlinkSync(f);
      } catch {
        // ignore individual failures
      }
    }
    logger.info('All recovery states cleared', 'RecoveryManager', { count: files.length });
  }

  isAutoSaveRunning(): boolean {
    return this.autoSaveTimer !== null;
  }
}

/** Default singleton instance */
export const recoveryManager = new RecoveryManager();
