/**
 * Recovery Manager Service Implementation.
 */

import { logger } from '../shared/utils/logger';
import {
  RECOVERY_FILE_DEFAULT,
  MAX_SNAPSHOT_AGE_MS,
  type RecoveryState,
} from './recovery-manager-types';
import { resolveInstancePath } from './recovery-manager-paths';
import {
  writeRecoverySnapshot,
  loadLatestRecoverySnapshot,
  clearRecoveryPath,
  clearAllRecoveryPaths,
} from './recovery-manager-io';

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
    writeRecoverySnapshot(this.filePath, state);
  }

  /**
   * Load most recent valid snapshot across all instance files.
   * Falls back to this instance's own file when no siblings exist.
   */
  loadState(): RecoveryState | null {
    return loadLatestRecoverySnapshot(this.basePath, this.filePath);
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
    clearRecoveryPath(this.filePath);
  }

  /** Delete all instance snapshot files — use on full cluster shutdown */
  clearAllStates(): void {
    clearAllRecoveryPaths(this.basePath);
  }

  isAutoSaveRunning(): boolean {
    return this.autoSaveTimer !== null;
  }
}
