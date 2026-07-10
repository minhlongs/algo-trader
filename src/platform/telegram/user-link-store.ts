import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../shared/utils/logger';

export interface UserLink {
  telegramUserId: number;
  licenseId: string;
  linkedAt: string;
}

const DEFAULT_PATH = path.join(process.cwd(), 'data', 'telegram-user-links.json');

export class UserLinkStore {
  private static instance: UserLinkStore;
  private links: Map<number, UserLink> = new Map();
  private readonly storePath: string;

  private constructor(storePath?: string) {
    this.storePath = storePath || DEFAULT_PATH;
    this.load();
  }

  static getInstance(storePath?: string): UserLinkStore {
    if (!UserLinkStore.instance) {
      UserLinkStore.instance = new UserLinkStore(storePath);
    }
    return UserLinkStore.instance;
  }

  static resetInstance(): void {
    UserLinkStore.instance = null as unknown as UserLinkStore;
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.storePath)) return;
      const raw = fs.readFileSync(this.storePath, 'utf-8');
      const entries: UserLink[] = JSON.parse(raw);
      for (const entry of entries) {
        this.links.set(entry.telegramUserId, entry);
      }
    } catch (error) {
      logger.warn('[UserLinkStore] Failed to load, starting fresh:', { error });
      this.links = new Map();
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(this.storePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = JSON.stringify(Array.from(this.links.values()), null, 2);
      fs.writeFileSync(this.storePath, data, 'utf-8');
    } catch (error) {
      logger.error('[UserLinkStore] Failed to save:', { error });
    }
  }

  link(telegramUserId: number, licenseId: string): void {
    const link: UserLink = {
      telegramUserId,
      licenseId,
      linkedAt: new Date().toISOString(),
    };
    this.links.set(telegramUserId, link);
    this.save();
    logger.info(`[UserLinkStore] Linked telegram user ${telegramUserId} to license ${licenseId}`);
  }

  unlink(telegramUserId: number): boolean {
    const existed = this.links.delete(telegramUserId);
    if (existed) {
      this.save();
      logger.info(`[UserLinkStore] Unlinked telegram user ${telegramUserId}`);
    }
    return existed;
  }

  getByTelegramUserId(telegramUserId: number): UserLink | undefined {
    return this.links.get(telegramUserId);
  }

  getByLicenseId(licenseId: string): UserLink | undefined {
    for (const link of this.links.values()) {
      if (link.licenseId === licenseId) return link;
    }
    return undefined;
  }

  getAll(): UserLink[] {
    return Array.from(this.links.values());
  }

  getAllTelegramUserIds(): number[] {
    return Array.from(this.links.keys());
  }
}

export const userLinkStore = UserLinkStore.getInstance();
