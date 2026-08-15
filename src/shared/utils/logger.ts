/**
 * Logger utility — console wrapper with optional aggregator bridge.
 *
 * Winston's File transport crashes in Cloudflare Workers (no filesystem).
 * This logger uses Console only — structured enough for Workers runtime.
 *
 * When an aggregator is registered via `setAggregator()`, log calls also
 * route to the centralized LogAggregator for batch shipping to Loki/file.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
let _logLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

/** Optional aggregator reference — set via setAggregator() */
let _aggregator: {
  debug(msg: string, ctx?: Record<string, unknown>): void;
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>, err?: Error): void;
} | null = null;

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

/** Extract a clean context object from logger args */
function extractContext(args: unknown[]): Record<string, unknown> | undefined {
  if (!args || args.length === 0) return undefined;

  if (args.length >= 2 && typeof args[0] === 'string' && args[1] !== null && typeof args[1] === 'object') {
    return { _tag: args[0], ...(args[1] as Record<string, unknown>) };
  }

  if (args[0] !== null && typeof args[0] === 'object') {
    return args[0] as Record<string, unknown>;
  }

  if (typeof args[0] === 'string') {
    return { detail: args[0] };
  }

  return undefined;
}

/** Extract an Error from args if present */
function extractError(args: unknown[]): Error | undefined {
  for (const arg of args) {
    if (arg instanceof Error) return arg;
  }
  return undefined;
}

/**
 * Bridge an external aggregator to the console logger.
 * Call once at app startup after the aggregator is created.
 */
function setAggregator(aggregator: typeof _aggregator): void {
  _aggregator = aggregator;
}

export const logger = {
  debug(msg: string, ...args: unknown[]) {
    if (shouldLog('debug')) console.debug(formatMessage('DEBUG', msg, args));
    _aggregator?.debug(msg, extractContext(args));
  },
  info(msg: string, ...args: unknown[]) {
    if (shouldLog('info')) console.info(formatMessage('INFO', msg, args));
    _aggregator?.info(msg, extractContext(args));
  },
  warn(msg: string, ...args: unknown[]) {
    if (shouldLog('warn')) console.warn(formatMessage('WARN', msg, args));
    _aggregator?.warn(msg, extractContext(args));
  },
  error(msg: string, ...args: unknown[]) {
    if (shouldLog('error')) console.error(formatMessage('ERROR', msg, args));
    _aggregator?.error(msg, extractContext(args), extractError(args));
  },
};

export { setLogLevel, getLogLevel, setAggregator };
export default logger;
