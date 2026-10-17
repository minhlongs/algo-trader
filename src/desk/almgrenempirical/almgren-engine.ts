/**
 * Wave 236: Almgren, Thum, Hauptmann & Li (2005) Engine
 */

import { AlmgrenEmpiricalConfig, EmpiricalOrderExecution, EmpiricalImpactCostAssessment } from './almgren-types';
import { evaluateEmpiricalExecution } from './almgren-math';

export class AlmgrenEmpiricalEngine {
  constructor(private readonly config: AlmgrenEmpiricalConfig) {}

  public evaluate(order: EmpiricalOrderExecution): EmpiricalImpactCostAssessment {
    return evaluateEmpiricalExecution(order, this.config);
  }
}
