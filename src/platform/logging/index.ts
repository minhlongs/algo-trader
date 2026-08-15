/**
 * Centralized Logging Module
 * Structured JSON logging with batching, trace IDs, and configurable backends.
 */

export {
  LogAggregator,
  ChildLogger,
  StdoutBackend,
  FileBackend,
  HttpBackend,
  generateTraceId,
  type LogLevel,
  type LogEntry,
  type LogBackend,
  type AggregatorConfig,
} from './log-aggregator';
