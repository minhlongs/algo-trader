/**
 * Logger utility - simple console wrapper (Workers-compatible, no fs/winston)
 *
 * Winston's File transport crashes in Cloudflare Workers (no filesystem).
 * This logger uses Console only — structured enough for Workers runtime.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
let _logLevel: LogLevel = 'info';

function getLogLevel(): LogLevel { return _logLevel; }

function setLogLevel(level: LogLevel): void { _logLevel = level; }

function shouldLog(current: LogLevel): boolean {
  return LEVELS[current] >= LEVELS[_logLevel];
}

function formatMessage(level: string, msg: string, meta?: unknown): string {
  const ts = new Date().toISOString();
  const base = `[${ts}] ${level}: ${msg}`;
  if (meta !== undefined && meta !== null) {
    const serialized = typeof meta === 'string' ? meta : JSON.stringify(meta);
    return `${base} ${serialized}`;
  }
  return base;
}

export const logger = {
  debug(msg: string, meta?: unknown) {
    if (shouldLog('debug')) console.debug(formatMessage('DEBUG', msg, meta));
  },
  info(msg: string, meta?: unknown) {
    if (shouldLog('info')) console.info(formatMessage('INFO', msg, meta));
  },
  warn(msg: string, meta?: unknown) {
    if (shouldLog('warn')) console.warn(formatMessage('WARN', msg, meta));
  },
  error(msg: string, meta?: unknown) {
    if (shouldLog('error')) console.error(formatMessage('ERROR', msg, meta));
  },
};

export default logger;
