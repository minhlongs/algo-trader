/**
 * Wave 217: Kyle & Obizhaeva (2016) Microstructure Invariance Engine.
 *
 * Coordinates invariance calibration, institutional bet sizing, and impact projection.
 * Strictly < 150 LOC, zero mocks, zero :any.
 */

import {
  MicrostructureInvarianceConfig,
  InvarianceScaleMetrics,
  OrderImpactEvaluation,
} from './kyle-obizhaeva-types';
import { KyleObizhaevaMath } from './kyle-obizhaeva-math';

export class KyleObizhaevaEngine {
  private readonly config: MicrostructureInvarianceConfig;
  private readonly metrics: InvarianceScaleMetrics;

  constructor(config: MicrostructureInvarianceConfig) {
    this.config = config;
    this.metrics = KyleObizhaevaMath.calculateInvarianceMetrics(config);
  }

  public getInvarianceMetrics(): InvarianceScaleMetrics {
    return this.metrics;
  }

  public evaluateOrder(orderSizeShares: number): OrderImpactEvaluation {
    return KyleObizhaevaMath.evaluateOrderImpact(
      orderSizeShares,
      this.config,
      this.metrics,
    );
  }

  public getOptimalParticipationRate(orderSizeShares: number): number {
    const evaluation = this.evaluateOrder(orderSizeShares);
    if (evaluation.invarianceScaleRegime === 'MICRO_ORDER') {
      return 0.15; // aggressive 15% participation
    } else if (evaluation.invarianceScaleRegime === 'NORMAL_BET') {
      return 0.08; // nominal 8% participation
    } else {
      return 0.03; // stealth 3% participation for block
    }
  }
}
