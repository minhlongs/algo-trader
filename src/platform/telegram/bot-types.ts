/**
 * Telegram Bot Configuration and Session Types
 */

export interface TelegramConfig {
  botToken: string;
}

export interface UserSession {
  userId: number;
  licenseKeys: string[];
  notificationsEnabled: boolean;
  lastCommand: string;
}
