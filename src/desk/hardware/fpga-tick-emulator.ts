/**
 * FPGA / ASIC Hardware Pacing & Tick Pipeline Emulator
 * Emulates cycle-accurate hardware processing latency and deterministic FIFO buffering.
 *
 * @module desk/hardware/fpga-tick-emulator
 */

import { FpgaPacingConfig, MarketTickPacket } from './hardware-types';

export class FpgaTickEmulator {
  private readonly clockPeriodNs: number;
  private readonly pipelineLatencyNs: number;
  private readonly fifoBuffer: MarketTickPacket[] = [];
  private totalIngestedTicks = 0;
  private droppedTicks = 0;

  public constructor(private readonly config: FpgaPacingConfig) {
    this.clockPeriodNs = 1000 / config.targetFrequencyMhz;
    this.pipelineLatencyNs = this.clockPeriodNs * config.pipelineStages;
  }

  public ingestTick(tick: MarketTickPacket): { isEnqueued: boolean; queueDepth: number } {
    this.totalIngestedTicks += 1;
    if (this.fifoBuffer.length >= this.config.fifoDepth) {
      this.droppedTicks += 1;
      return { isEnqueued: false, queueDepth: this.fifoBuffer.length };
    }
    this.fifoBuffer.push(tick);
    return { isEnqueued: true, queueDepth: this.fifoBuffer.length };
  }

  public processNextTick(currentClockNs: bigint): {
    tick: MarketTickPacket | undefined;
    egressTimestampNs: bigint;
    cycleCount: number;
  } {
    const tick = this.fifoBuffer.shift();
    if (!tick) {
      return { tick: undefined, egressTimestampNs: currentClockNs, cycleCount: 0 };
    }

    const deterministicCycles = this.config.pipelineStages;
    const latencyNsBig = BigInt(Math.round(this.pipelineLatencyNs));
    const effectiveIngress = tick.ingressTimestampNs > currentClockNs ? tick.ingressTimestampNs : currentClockNs;
    const egressTimestampNs = effectiveIngress + latencyNsBig;

    return {
      tick,
      egressTimestampNs,
      cycleCount: deterministicCycles,
    };
  }

  public getStats(): {
    totalIngested: number;
    dropped: number;
    currentQueueDepth: number;
    clockPeriodNs: number;
  } {
    return {
      totalIngested: this.totalIngestedTicks,
      dropped: this.droppedTicks,
      currentQueueDepth: this.fifoBuffer.length,
      clockPeriodNs: Number(this.clockPeriodNs.toFixed(3)),
    };
  }
}
