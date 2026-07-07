/**
 * Cross-layer Prometheus metrics registry.
 *
 * Lives in shared/ so both shared/ utilities and desk/ modules can emit
 * metrics without violating boundary isolation (shared/ must not import from desk/).
 *
 * desk/middleware/prometheus-metrics.ts re-exports these for backward compatibility.
 */

import { Registry, Counter, Gauge, CounterConfiguration, GaugeConfiguration } from "prom-client";

export const register = new Registry();

// ── Lazy init helpers ───────────────────────────────────────────────

function initCounter(conf: CounterConfiguration<string>): Counter<string> {
  return new Counter({ ...conf, registers: [register] });
}
function initGauge(conf: GaugeConfiguration<string>): Gauge<string> {
  return new Gauge({ ...conf, registers: [register] });
}

// ── Memory pressure metrics ─────────────────────────────────────────

let _memoryRssGauge: Gauge<string> | undefined;
let _memoryRssConf: GaugeConfiguration<string> = {
  name: "algo_trader_memory_rss_bytes",
  help: "Process RSS memory in bytes",
  labelNames: [],
};
export function setMemoryRssBytes(bytes: number): void {
  if (!_memoryRssGauge) _memoryRssGauge = initGauge(_memoryRssConf);
  _memoryRssGauge.set({}, bytes);
}

let _memoryHeapGauge: Gauge<string> | undefined;
let _memoryHeapConf: GaugeConfiguration<string> = {
  name: "algo_trader_memory_heap_used_bytes",
  help: "V8 heap used bytes",
  labelNames: [],
};
export function setMemoryHeapBytes(bytes: number): void {
  if (!_memoryHeapGauge) _memoryHeapGauge = initGauge(_memoryHeapConf);
  _memoryHeapGauge.set({}, bytes);
}

export function setMemoryMetrics(rss: number, heapUsed: number): void {
  setMemoryRssBytes(rss);
  setMemoryHeapBytes(heapUsed);
}

let _memoryPressureEventCounter: Counter<string> | undefined;
let _memoryPressureEventConf: CounterConfiguration<string> = {
  name: "algo_trader_memory_pressure_events_total",
  help: "Total memory pressure events detected",
  labelNames: ["level"],
};
export function recordMemoryPressureEvent(level: string): void {
  if (!_memoryPressureEventCounter) _memoryPressureEventCounter = initCounter(_memoryPressureEventConf);
  _memoryPressureEventCounter.inc({ level });
}

// ── Cache eviction metrics ───────────────────────────────────────────

let _cacheEvictionCounter: Counter<string> | undefined;
let _cacheEvictionConf: CounterConfiguration<string> = {
  name: "algo_trader_cache_eviction_total",
  help: "Total cache eviction events",
  labelNames: ["cache_name"],
};
export function recordCacheEviction(cacheName: string): void {
  if (!_cacheEvictionCounter) _cacheEvictionCounter = initCounter(_cacheEvictionConf);
  _cacheEvictionCounter.inc({ cache_name: cacheName });
}

// ── Compression metrics ─────────────────────────────────────────────

let _compressionRatioGauge: Gauge<string> | undefined;
let _compressionRatioConf: GaugeConfiguration<string> = {
  name: "algo_trader_compression_ratio",
  help: "Compression ratio (original/compressed)",
  labelNames: ["algorithm"],
};
export function recordCompressionRatio(originalSize: number, compressedSize: number): void {
  if (!_compressionRatioGauge) _compressionRatioGauge = initGauge(_compressionRatioConf);
  if (compressedSize > 0) {
    _compressionRatioGauge.set({ algorithm: "br" }, originalSize / compressedSize);
  }
}

// ── Metrics endpoint ────────────────────────────────────────────────

export function getMetrics(): Promise<string> {
  return register.metrics();
}
