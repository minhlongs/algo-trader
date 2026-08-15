/**
 * Telegram Bot Command Handlers
 * Individual command handler methods extracted from TelegramBotService.
 * Each handler corresponds to a bot slash command.
 *
 * NOTE: user sessions are persisted in D1 via userSessionRepo (not in-memory Map).
 * grammy passes only (ctx) to command handlers — no Map argument.
 *
 * Handler implementations are now in ./handlers/ subdirectory.
 * This file re-exports everything for backward compatibility.
 */

// Re-export all handlers from the handlers/ directory
export {
  handleStart,
  handleHelp,
  handleStatus,
  handleLimits,
} from './handlers';

export { handleCampaign } from './handlers';

export {
  handleLink,
  handleUnlink,
  handleNotifications,
} from './handlers';

export {
  handleBalance,
  handlePositions,
  handlePnl,
  handleResults,
} from './handlers';

// Re-export types used by handlers for convenience
import type { UserSession } from './bot';
export type { UserSession };

// Re-export alert formatting helpers for backward compatibility
export {
  formatTelegramMessage,
  getTelegramActionMessage,
  generateTelegramProgressBar,
  getShortKey,
} from '../notifications/alert-formatter';
