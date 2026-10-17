import type { LogAggregator } from './log-aggregator';

/**
 * Child logger with pre-bound context and trace ID.
 * All log calls inherit the parent's context.
 */
export class ChildLogger {
  constructor(
    private readonly parent: LogAggregator,
    private readonly boundContext: Record<string, unknown>,
    private readonly traceId?: string
  ) {}

  private mergeContext(context?: Record<string, unknown>): Record<string, unknown> {
    return { ...this.boundContext, ...context };
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.parent.debug(message, this.mergeContext(context), this.traceId);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.parent.info(message, this.mergeContext(context), this.traceId);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.parent.warn(message, this.mergeContext(context), this.traceId);
  }

  error(message: string, context?: Record<string, unknown>, error?: Error): void {
    this.parent.error(message, this.mergeContext(context), error, this.traceId);
  }

  critical(message: string, context?: Record<string, unknown>, error?: Error): void {
    this.parent.critical(message, this.mergeContext(context), error, this.traceId);
  }
}
