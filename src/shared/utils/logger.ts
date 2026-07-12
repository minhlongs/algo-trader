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

function formatMessage(level: string, msg: string, args?: unknown[]): string {
  const ts = new Date().toISOString();
  const base = `[${ts}] ${level}: ${msg}`;
  if (args && args.length > 0) {
    if (args.length >= 2 && typeof args[0] === 'string' && args[1] !== null && typeof args[1] === 'object') {
      const tag = args[0] as string;
      const meta = args[1] as Record<string, unknown>;
      const withTag = { _tag: tag, ...meta };
      return `${base} ${JSON.stringify(withTag)}`;
    }
    const meta = args[0];
    const serialized = typeof meta === 'string' ? meta : JSON.stringify(meta);
    return `${base} ${serialized}`;
  }
  return base;
}

export const logger = {
  debug(msg: string, ...args: unknown[]) {
    if (shouldLog('debug')) console.debug(formatMessage('DEBUG', msg, args));
  },
  info(msg: string, ...args: unknown[]) {
    if (shouldLog('info')) console.info(formatMessage('INFO', msg, args));
  },
  warn(msg: string, ...args: unknown[]) {
    if (shouldLog('warn')) console.warn(formatMessage('WARN', msg, args));
  },
  error(msg: string, ...args: unknown[]) {
    if (shouldLog('error')) console.error(formatMessage('ERROR', msg, args));
  },
};

export default logger;
