/**
 * Wave 229: Bouchaud, Farmer & Lillo (2009) Metaorder Square-Root Impact Engine.
 * Strictly < 200 LOC, zero :any.
 */

import { BouchaudImpactConfig, MetaorderParams, MetaorderImpactAssessment } from './bouchaud-types';
import { BouchaudMath } from './bouchaud-math';

export class BouchaudMetaorderEngine {
  constructor(private readonly config: BouchaudImpactConfig) {}

  public evaluate(params: MetaorderParams): MetaorderImpactAssessment {
    return BouchaudMath.assessMetaorder(this.config, params);
  }

  public getRelaxedImpact(peakImpact: number, timePostSec: number, durationT: number): number {
    return BouchaudMath.computeRelaxation(
      peakImpact,
      timePostSec,
      durationT,
      this.config.relaxationExponentBeta ?? 0.5
    );
  }
}
