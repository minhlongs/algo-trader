/**
 * Telegram UserSession D1 Repository
 *
 * Single source of truth for user session (bot /link state) persistence.
 * Replaces in-memory Map in TelegramBotService.
 *
 * Persistence: D1 via postgres-client query() wrapper.
 */

import { query } from '../../db/postgres-client';
import { logger } from '../../shared/utils/logger';
import type { UserSession } from './bot';

export interface UserSessionRow {
  user_id: number;
  license_keys: string[];
  notifications_enabled: boolean;
  last_command: string;
  updated_at: number;
}

function rowToSession(row: UserSessionRow): UserSession {
  return {
    userId: row.user_id,
    licenseKeys: row.license_keys,
    notificationsEnabled: row.notifications_enabled,
    lastCommand: row.last_command,
  };
}

export class UserSessionRepositoryD1 {
  private initialized = false;

  async ensureTable(): Promise<void> {
    if (this.initialized) return;
    await query(
      "CREATE TABLE IF NOT EXISTS telegram_user_sessions (user_id BIGINT PRIMARY KEY, license_keys TEXT[] NOT NULL DEFAULT '{}', notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE, last_command TEXT NOT NULL DEFAULT '', updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT * 1000))",
    );
    await query(
      'CREATE INDEX IF NOT EXISTS idx_sessions_updated ON telegram_user_sessions (updated_at)',
    );
    this.initialized = true;
    logger.info('[UserSessionRepo] Table ensured');
  }

  async getByUserId(userId: number): Promise<UserSession | undefined> {
    await this.ensureTable();
    const result = await query(
      'SELECT * FROM telegram_user_sessions WHERE user_id = $1',
      [userId],
    );
    const row = result.rows[0] as unknown as UserSessionRow | undefined;
    return row ? rowToSession(row) : undefined;
  }

  async upsert(session: UserSession): Promise<void> {
    await this.ensureTable();
    await query(
      'INSERT INTO telegram_user_sessions (user_id, license_keys, notifications_enabled, last_command, updated_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (user_id) DO UPDATE SET license_keys = EXCLUDED.license_keys, notifications_enabled = EXCLUDED.notifications_enabled, last_command = EXCLUDED.last_command, updated_at = EXCLUDED.updated_at',
      [
        session.userId,
        session.licenseKeys,
        session.notificationsEnabled,
        session.lastCommand,
        Date.now(),
      ],
    );
  }

  async linkLicenseKey(userId: number, licenseKey: string): Promise<UserSession> {
    await this.ensureTable();
    const existing = await this.getByUserId(userId);
    if (existing) {
      if (!existing.licenseKeys.includes(licenseKey)) {
        existing.licenseKeys.push(licenseKey);
      }
      existing.lastCommand = 'link';
      await this.upsert(existing);
      return existing;
    }
    const session: UserSession = {
      userId,
      licenseKeys: [licenseKey],
      notificationsEnabled: true,
      lastCommand: 'link',
    };
    await this.upsert(session);
    return session;
  }

  async unlinkLicenseKey(
    userId: number,
    licenseKey: string,
  ): Promise<UserSession | undefined> {
    const existing = await this.getByUserId(userId);
    if (!existing) return undefined;
    const index = existing.licenseKeys.indexOf(licenseKey);
    if (index > -1) {
      existing.licenseKeys.splice(index, 1);
    }
    existing.lastCommand = 'unlink';
    await this.upsert(existing);
    return existing;
  }

  async toggleNotifications(userId: number): Promise<UserSession | undefined> {
    const existing = await this.getByUserId(userId);
    if (!existing) {
      const created: UserSession = {
        userId,
        licenseKeys: [],
        notificationsEnabled: false,
        lastCommand: 'notifications',
      };
      await this.upsert(created);
      return created;
    }
    existing.notificationsEnabled = !existing.notificationsEnabled;
    existing.lastCommand = 'notifications';
    await this.upsert(existing);
    return existing;
  }

  async getAll(): Promise<UserSession[]> {
    await this.ensureTable();
    const result = await query('SELECT * FROM telegram_user_sessions');
    return result.rows.map((r) => rowToSession(r as unknown as UserSessionRow));
  }

  async delete(userId: number): Promise<boolean> {
    await this.ensureTable();
    const result = await query(
      'DELETE FROM telegram_user_sessions WHERE user_id = $1',
      [userId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}

export const userSessionRepo = new UserSessionRepositoryD1();
