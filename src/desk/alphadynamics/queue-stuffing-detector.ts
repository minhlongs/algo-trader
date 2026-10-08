/**
 * High-Frequency Queue Stuffing & Microstructure Anomaly Detector
 * Detects quote stuffing and spoofing bursts via rolling window cancel-to-trade ratios and message frequency.
 *
 * @module desk/alphadynamics/queue-stuffing-detector
 */

import {
  OrderBookEvent,
  QueueStuffingAlert,
} from './alphadynamics-types';

export class QueueStuffingDetector {
  private events: OrderBookEvent[] = [];

  constructor(
    private readonly windowDurationMs = 1000, // 1-second rolling analysis
    private readonly cancelRatioThreshold = 10.0, // > 10 cancels per trade
    private readonly frequencyThresholdHz = 50 // > 50 messages/sec
  ) {}

  /**
   * Ingests order event and computes anomaly detection indicators.
   */
  public addEvent(event: OrderBookEvent): QueueStuffingAlert {
    this.events.push(event);

    // Evict events outside rolling time window
    const cutoffMs = event.timestampMs - this.windowDurationMs;
    this.events = this.events.filter((e) => e.timestampMs >= cutoffMs);

    let cancelCount = 0;
    let tradeCount = 0;
    let newCount = 0;

    for (const e of this.events) {
      if (e.eventType === 'CANCEL') cancelCount++;
      else if (e.eventType === 'TRADE') tradeCount++;
      else if (e.eventType === 'NEW' || e.eventType === 'REPLACE') newCount++;
    }

    // Cancel-to-trade ratio (smoothed to avoid division by zero)
    const cancelToTradeRatio = cancelCount / Math.max(1, tradeCount);

    // Message frequency in Hertz
    const eventFrequencyHz = (this.events.length / this.windowDurationMs) * 1000;

    // Severity score normalized [0.0, 1.0]
    const ratioFactor = Math.min(1.0, cancelToTradeRatio / (this.cancelRatioThreshold * 2));
    const freqFactor = Math.min(1.0, eventFrequencyHz / (this.frequencyThresholdHz * 2));
    const burstSeverityScore = Number(((ratioFactor + freqFactor) / 2).toFixed(4));

    const isAnomalyDetected =
      cancelToTradeRatio >= this.cancelRatioThreshold ||
      eventFrequencyHz >= this.frequencyThresholdHz;

    const isQueueStuffed =
      cancelToTradeRatio >= this.cancelRatioThreshold &&
      eventFrequencyHz >= this.frequencyThresholdHz;

    return {
      isAnomalyDetected,
      cancelToTradeRatio: Number(cancelToTradeRatio.toFixed(2)),
      eventFrequencyHz: Number(eventFrequencyHz.toFixed(1)),
      burstSeverityScore,
      isQueueStuffed,
    };
  }
}
