/**
 * Prometheus Metrics Core — Barrel Facade
 *
 * Previously a monolithic 297-LOC file. Extracted into two focused submodules:
 * - prometheus-metrics-core-data.ts    — candle/failover/queue/API/trade/ext-API metrics
 * - prometheus-metrics-core-signals.ts — qwen/memory/compression/shard/strategy metrics
 *
 * Re-exports everything; all importers retain their existing paths unchanged.
 */

export {
  register,
  recordDataGap, recordGapDetectionDuration, setExpectedCandles, setReceivedCandles,
  recordOutlierEvent, recordOutlierZScore,
  recordFailoverEvent, setCircuitBreakerState, setCircuitBreakerStateProvider, recordSlaCompliance,
  setProviderHealthScore, setProviderAvailability, setProviderErrorRate,
  recordQueueWaitTime, setJobsActive, recordJobCompleted,
  recordApiRequest, recordApiError, recordApiRequestDuration, metricsMiddleware, getMetrics,
  recordTrade, setDailyPnlUsd, dailyPnlUsd, setWinRatePercent, winRatePercent,
  recordExternalApiLatency, externalApiLatency,
} from './prometheus-metrics-core-data';

export {
  setQwenKillSwitch, setQwenDrawdownAutoDisabled,
  recordQwenSignal, qwenSignalsTotal,
  recordQwenStrategyReview, qwenStrategyReviewsResolvedTotal,
  recordQwenAdminKillAction, qwenAdminKillActionsTotal,
  setQwenPaperPnlPct, qwenPaperPnlPct,
  setQwenPaperGateDaysRemaining, qwenPaperGateDaysRemaining,
  setQwenSignalsLoopLastRunTs, qwenSignalsLoopLastRunTs,
  recordQwenSignalsLoopJournalWriteError, qwenSignalsLoopJournalWriteErrorsTotal,
  setQwenStrategyReviewBacklogSize, qwenStrategyReviewBacklogSize,
  setQwenStrategyReviewOldestPendingAgeSec, qwenStrategyReviewOldestPendingAgeSec,
  setMemoryRssBytes, setMemoryHeapBytes, setMemoryMetrics,
  recordMemoryPressureEvent, recordCacheEviction,
  setCompressionRatio, compressionRatio, recordShardLatency,
  setCandleCompleteness, recordDataGapsTotal,
  setStrategyActive,
  recordCompressionRatio,
  recordQwenStrategyReviewsQueued, qwenStrategyReviewsQueuedTotal,
  recordQwenSignalsLoopRun, qwenSignalsLoopRunsTotal,
} from './prometheus-metrics-core-signals';
