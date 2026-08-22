/**
 * Candle Contracts
 *
 * Zod schemas for OHLCV candle batches. These contracts are the single
 * source of truth for what a valid candle looks like before it enters the
 * backtest / research pipeline. Anything that fails these schemas is
 * rejected at the boundary — never silently fed to a strategy.
 *
 * Invariants enforced (per upstream `backtest/validation.py`):
 *   - timestamps strictly monotonic ascending
 *   - high >= max(open, close)
 *   - low  <= min(open, close)
 *   - volume >= 0
 *   - timeframe is a known enum value
 */

import * as z from 'zod';

// ── Timeframe enum ────────────────────────────────────────────────────────────

/**
 * Supported candle timeframes. Matches Binance kline interval vocabulary
 * plus the daily/weekly/monthly buckets used by the Gamma historical feed.
 */
export const TimeframeSchema = z.enum([
  '1m', '3m', '5m', '15m', '30m',
  '1h', '2h', '4h', '6h', '8h', '12h',
  '1d', '3d', '1w', '1M',
]);

export type Timeframe = z.infer<typeof TimeframeSchema>;

// ── Single candle ─────────────────────────────────────────────────────────────

const finiteNumber = z.number().finite();

/**
 * A single OHLCV candle. The geometric invariants (high/low vs open/close)
 * are enforced via `superRefine` because they span multiple fields.
 */
export const OhlcvCandleSchema = z.object({
  market: z.string().min(1, 'market must be a non-empty string'),
  exchange: z.string().min(1, 'exchange must be a non-empty string'),
  timeframe: TimeframeSchema,
  timestamp: z.date(),
  open: finiteNumber,
  high: finiteNumber,
  low: finiteNumber,
  close: finiteNumber,
  volume: finiteNumber.nonnegative('volume must be >= 0'),
}).superRefine((candle, ctx) => {
  const maxOH = Math.max(candle.open, candle.close);
  if (candle.high < maxOH) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `high (${candle.high}) must be >= max(open, close) = ${maxOH}`,
      path: ['high'],
    });
  }

  const minOH = Math.min(candle.open, candle.close);
  if (candle.low > minOH) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `low (${candle.low}) must be <= min(open, close) = ${minOH}`,
      path: ['low'],
    });
  }
});

export type OhlcvCandle = z.infer<typeof OhlcvCandleSchema>;

// ── Batch ─────────────────────────────────────────────────────────────────────

/**
 * A batch of candles for one market+timeframe. Enforces strict timestamp
 * monotonicity across the whole batch — duplicates and out-of-order
 * candles are rejected here so downstream code can assume sorted input.
 */
export const OhlcvBatchSchema = z.array(OhlcvCandleSchema).superRefine((candles, ctx) => {
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1].timestamp;
    const curr = candles[i].timestamp;
    if (curr <= prev) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `timestamps must be strictly monotonic at index ${i}: ` +
          `${prev.toISOString()} is not before ${curr.toISOString()}`,
        path: [i, 'timestamp'],
      });
    }
  }
});

export type OhlcvBatch = z.infer<typeof OhlcvBatchSchema>;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse and validate a batch, returning a typed result or throwing. */
export function parseOhlcvBatch(raw: unknown): OhlcvBatch {
  return OhlcvBatchSchema.parse(raw);
}

/** Safe variant — returns success flag + either data or issues. */
export function safeParseOhlcvBatch(raw: unknown): z.ZodSafeParseResult<OhlcvBatch> {
  return OhlcvBatchSchema.safeParse(raw);
}