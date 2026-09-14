// State persistence & crash recovery - saves snapshots to disk for restart recovery
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { logger } from '../utils/logger';
import {
  RECOVERY_FILE_DEFAULT,
  MAX_SNAPSHOT_AGE_MS,
  type RecoveryState,
} from './recovery-manager-types';
import {
  resolveInstanceId,
  instanceFilePath,
  discoverInstanceFiles,
} from './recovery-manager-paths';

export * from './recovery-manager-types';
export * from './recovery-manager-paths';

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

  /** Load the most recent valid snapshot across all instance files. */
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

  /** Start periodic auto-save. */
  startAutoSave(intervalMs: number, stateProvider: () => RecoveryState): void {
    if (this.autoSaveTimer !== null) {
      logger.warn('Auto-save already running, stopping previous timer', 'RecoveryManager');
      this.stopAutoSave();
    }
    this.autoSaveTimer = setInterval(() => {
      try {
        this.saveState(stateProvider());
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

  /** Returns true if a valid, recent recovery snapshot exists (< 1 hour). */
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
