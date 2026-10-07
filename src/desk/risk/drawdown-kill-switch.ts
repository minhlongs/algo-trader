import { EventEmitter } from 'node:events';
import type {
  CircuitBreakerLevel,
  DrawdownStatus,
  DrawdownThresholdConfig,
} from './drawdown-kill-switch-types';

export class DrawdownKillSwitchCircuitBreaker extends EventEmitter {
  private highWaterMarkUsd: number;
  private readonly thresholds: DrawdownThresholdConfig;
  private currentState: CircuitBreakerLevel = 'NORMAL';

  public constructor(
    initialEquityUsd: number,
    thresholds: DrawdownThresholdConfig = {
      stage1ThresholdPct: 5.0,
      stage2ThresholdPct: 10.0,
      stage3ThresholdPct: 15.0,
    }
  ) {
    super();
    this.highWaterMarkUsd = Math.max(0, initialEquityUsd);
    this.thresholds = thresholds;
  }

  public updateEquity(currentEquityUsd: number): DrawdownStatus {
    if (currentEquityUsd > this.highWaterMarkUsd) {
      this.highWaterMarkUsd = currentEquityUsd;
    }

    const drawdownUsd = Math.max(0, this.highWaterMarkUsd - currentEquityUsd);
    const drawdownPct = this.highWaterMarkUsd > 0
      ? (drawdownUsd / this.highWaterMarkUsd) * 100
      : 0;

    let newState: CircuitBreakerLevel = 'NORMAL';
    let quotingMultiplier = 1.0;
    let canOpenNew = true;
    let requiresFlattening = false;

    if (drawdownPct >= this.thresholds.stage3ThresholdPct) {
      newState = 'STAGE_3_KILL_SWITCH';
      quotingMultiplier = 0.0;
      canOpenNew = false;
      requiresFlattening = true;
    } else if (drawdownPct >= this.thresholds.stage2ThresholdPct) {
      newState = 'STAGE_2_FREEZE';
      quotingMultiplier = 0.0;
      canOpenNew = false;
      requiresFlattening = false;
    } else if (drawdownPct >= this.thresholds.stage1ThresholdPct) {
      newState = 'STAGE_1_THROTTLE';
      quotingMultiplier = 0.5;
      canOpenNew = true;
      requiresFlattening = false;
    }

    if (newState !== this.currentState) {
      const prevState = this.currentState;
      this.currentState = newState;
      this.emit('circuitBreakerTransition', {
        previousState: prevState,
        newState,
        drawdownPct,
        currentEquityUsd,
      });
    }

    return {
      currentEquityUsd: Math.round(currentEquityUsd * 100) / 100,
      highWaterMarkUsd: Math.round(this.highWaterMarkUsd * 100) / 100,
      drawdownUsd: Math.round(drawdownUsd * 100) / 100,
      drawdownPct: Math.round(drawdownPct * 100) / 100,
      state: newState,
      quotingSizeMultiplier: quotingMultiplier,
      canOpenNewPositions: canOpenNew,
      requiresEmergencyFlattening: requiresFlattening,
    };
  }

  public resetHighWaterMark(newEquityUsd: number): void {
    this.highWaterMarkUsd = newEquityUsd;
    this.currentState = 'NORMAL';
  }
}
