/**
 * Wave 231: Jaisson & Rosenbaum (2016) Microstructural High-Frequency Hawkes Rough Heston Engine.
 * Strictly < 200 LOC, zero :any.
 */

import {
  HawkesRoughHestonConfig,
  HighFrequencyArrivalSnapshot,
  HawkesMicrostructureAssessment,
} from './jaisson-types';
import { JaissonMath } from './jaisson-math';

export class JaissonHawkesEngine {
  constructor(private readonly config: HawkesRoughHestonConfig) {}

  public evaluate(snapshot: HighFrequencyArrivalSnapshot): HawkesMicrostructureAssessment {
    return JaissonMath.evaluate(this.config, snapshot);
  }

  public getHurstExponent(): number {
    return JaissonMath.computeImpliedHurst(this.config.memoryKernelAlpha);
  }
}
