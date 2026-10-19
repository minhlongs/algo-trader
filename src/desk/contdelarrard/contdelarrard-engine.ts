/**
 * Main Markovian LOB Queue Depletion Engine.
 * Cont & de Larrard (2013) analytical first-passage and order flow calibration.
 * Strictly < 150 LOC, zero `:any` types.
 */

import {
  ContDeLarrardParameters,
  FirstPassageResult,
  LobQueueState,
} from './contdelarrard-types';
import { ContDeLarrardFirstPassage } from './contdelarrard-firstpassage';

export interface OrderFlowSample {
  readonly side: 'BID' | 'ASK';
  readonly type: 'LIMIT' | 'CANCEL' | 'MARKET';
  readonly timestampSec: number;
}

export class ContDeLarrardEngine {
  private readonly defaultParams: ContDeLarrardParameters = {
    lambdaBid: 12.5,
    lambdaAsk: 12.5,
    muBid: 14.0,
    muAsk: 14.0,
    unitOrderSize: 1,
  };

  /**
   * Evaluates first-passage probability of price increase or decrease.
   */
  public evaluate(
    state: LobQueueState,
    params?: Partial<ContDeLarrardParameters>
  ): FirstPassageResult {
    const mergedParams: ContDeLarrardParameters = {
      ...this.defaultParams,
      ...params,
    };
    return ContDeLarrardFirstPassage.calculateAbsorption(state, mergedParams);
  }

  /**
   * Calibrates Poisson arrival and cancellation rates from timestamped order flow stream.
   */
  public calibrate(
    samples: readonly OrderFlowSample[],
    durationSec?: number
  ): ContDeLarrardParameters {
    if (samples.length === 0) {
      return { ...this.defaultParams };
    }

    let minT = samples[0].timestampSec;
    let maxT = samples[0].timestampSec;
    let limitB = 0;
    let limitA = 0;
    let depB = 0;
    let depA = 0;

    for (const s of samples) {
      if (s.timestampSec < minT) minT = s.timestampSec;
      if (s.timestampSec > maxT) maxT = s.timestampSec;

      if (s.side === 'BID') {
        if (s.type === 'LIMIT') limitB++;
        else depB++;
      } else {
        if (s.type === 'LIMIT') limitA++;
        else depA++;
      }
    }

    const totalDuration = Math.max(1.0, durationSec ?? (maxT - minT));

    return {
      lambdaBid: Math.round((limitB / totalDuration) * 100) / 100,
      lambdaAsk: Math.round((limitA / totalDuration) * 100) / 100,
      muBid: Math.round((depB / totalDuration) * 100) / 100,
      muAsk: Math.round((depA / totalDuration) * 100) / 100,
      unitOrderSize: 1,
    };
  }

  /**
   * Generates a 2D probability surface table for queue combinations up to maxDepth.
   */
  public generateProbabilitySurface(
    maxDepth: number,
    params?: Partial<ContDeLarrardParameters>
  ): readonly (readonly number[])[] {
    const surface: number[][] = [];
    const mergedParams: ContDeLarrardParameters = {
      ...this.defaultParams,
      ...params,
    };

    for (let qb = 1; qb <= maxDepth; qb++) {
      const row: number[] = [];
      for (let qa = 1; qa <= maxDepth; qa++) {
        const res = ContDeLarrardFirstPassage.calculateAbsorption(
          { bidDepth: qb, askDepth: qa },
          mergedParams
        );
        row.push(res.priceIncreaseProb);
      }
      surface.push(row);
    }

    return surface;
  }
}
