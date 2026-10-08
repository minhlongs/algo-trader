/**
 * Microsecond & Nanosecond Tick-to-Trade Profiler
 * Measures end-to-end execution path delays and computes percentiles (p50, p99, p99.9).
 *
 * @module desk/hardware/microsecond-tick-profiler
 */

import { LatencyHistogramSummary, TickToTradeLatencySample } from './hardware-types';

export class MicrosecondTickProfiler {
  private readonly samples: number[] = [];
  private readonly maxCapacity: number;

  public constructor(capacity = 50_000) {
    this.maxCapacity = capacity;
  }

  public recordSample(sample: TickToTradeLatencySample): void {
    if (this.samples.length >= this.maxCapacity) {
      this.samples.shift();
    }
    this.samples.push(sample.processingLatencyNs);
  }

  public getSummary(): LatencyHistogramSummary {
    if (this.samples.length === 0) {
      return { count: 0, minNs: 0, maxNs: 0, meanNs: 0, p50Ns: 0, p99Ns: 0, p999Ns: 0 };
    }

    const sorted = [...this.samples].sort((a, b) => a - b);
    const count = sorted.length;
    const minNs = sorted[0] ?? 0;
    const maxNs = sorted[count - 1] ?? 0;
    const sum = sorted.reduce((acc, v) => acc + v, 0);
    const meanNs = Math.round(sum / count);

    const getPercentile = (p: number): number => {
      const idx = Math.min(count - 1, Math.floor((p / 100) * count));
      return sorted[idx] ?? 0;
    };

    return {
      count,
      minNs,
      maxNs,
      meanNs,
      p50Ns: getPercentile(50),
      p99Ns: getPercentile(99),
      p999Ns: getPercentile(99.9),
    };
  }

  public reset(): void {
    this.samples.length = 0;
  }
}
