/**
 * Ultra-Low Latency Hardware & Profiling Types
 *
 * @module desk/hardware/hardware-types
 */

export interface MarketTickPacket {
  readonly streamId: number;
  readonly sequenceNumber: number;
  readonly symbolCode: number;
  readonly priceScaled: bigint;
  readonly quantityScaled: bigint;
  readonly side: 'BID' | 'ASK';
  readonly ingressTimestampNs: bigint;
}

export interface FpgaPacingConfig {
  readonly targetFrequencyMhz: number;
  readonly pipelineStages: number;
  readonly fifoDepth: number;
  readonly clockJitterToleranceNs: number;
}

export interface TickToTradeLatencySample {
  readonly tickIngressNs: bigint;
  readonly orderDispatchNs: bigint;
  readonly processingLatencyNs: number;
  readonly stageDelaysNs: Readonly<Record<string, number>>;
}

export interface LatencyHistogramSummary {
  readonly count: number;
  readonly minNs: number;
  readonly maxNs: number;
  readonly meanNs: number;
  readonly p50Ns: number;
  readonly p99Ns: number;
  readonly p999Ns: number;
}
