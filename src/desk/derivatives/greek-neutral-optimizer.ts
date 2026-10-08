/**
 * Simultaneous Delta-Gamma-Vega Risk Neutralization Optimizer
 * Solves exact 3x3 matrix equations to eliminate residual first- and second-order Greek exposures.
 *
 * @module desk/derivatives/greek-neutral-optimizer
 */

import {
  PortfolioGreekExposure,
  HedgeInstrument,
  GreekNeutralHedgeSolution,
} from './derivatives-types';

export class GreekNeutralOptimizer {
  /**
   * Solves linear system A * w = -b to eliminate portfolio Greeks:
   * [ delta_1  delta_2  delta_3 ] [ w_1 ]   [ -Delta_port ]
   * [ gamma_1  gamma_2  gamma_3 ] [ w_2 ] = [ -Gamma_port ]
   * [ vega_1   vega_2   vega_3  ] [ w_3 ]   [ -Vega_port  ]
   */
  public solveNeutralHedge(
    portfolio: PortfolioGreekExposure,
    instruments: HedgeInstrument[]
  ): GreekNeutralHedgeSolution {
    if (instruments.length < 3) {
      throw new Error('At least 3 linearly independent hedging instruments required to neutralize Delta, Gamma, and Vega');
    }

    const [inst1, inst2, inst3] = instruments;
    if (!inst1 || !inst2 || !inst3) {
      throw new Error('Hedging instruments must be defined');
    }

    // Matrix A
    const a11 = inst1.deltaPerUnit, a12 = inst2.deltaPerUnit, a13 = inst3.deltaPerUnit;
    const a21 = inst1.gammaPerUnit, a22 = inst2.gammaPerUnit, a23 = inst3.gammaPerUnit;
    const a31 = inst1.vegaPerUnit,  a32 = inst2.vegaPerUnit,  a33 = inst3.vegaPerUnit;

    // Vector -b
    const b1 = -portfolio.delta;
    const b2 = -portfolio.gamma;
    const b3 = -portfolio.vega;

    // Compute Determinant via rule of Sarrus
    const det =
      a11 * (a22 * a33 - a23 * a32) -
      a12 * (a21 * a33 - a23 * a31) +
      a13 * (a21 * a32 - a22 * a31);

    if (Math.abs(det) < 1e-9) {
      throw new Error('Singular matrix: selected hedging instruments are linearly dependent in Greek space');
    }

    // Solve via Cramer's Rule
    const det1 =
      b1 * (a22 * a33 - a23 * a32) -
      a12 * (b2 * a33 - a23 * b3) +
      a13 * (b2 * a32 - a22 * b3);

    const det2 =
      a11 * (b2 * a33 - a23 * b3) -
      b1 * (a21 * a33 - a23 * a31) +
      a13 * (a21 * b3 - b2 * a31);

    const det3 =
      a11 * (a22 * b3 - b2 * a32) -
      a12 * (a21 * b3 - b2 * a31) +
      b1 * (a21 * a32 - a22 * a31);

    const w1 = Number((det1 / det).toFixed(4));
    const w2 = Number((det2 / det).toFixed(4));
    const w3 = Number((det3 / det).toFixed(4));

    const residualDelta = Number((portfolio.delta + w1 * a11 + w2 * a12 + w3 * a13).toFixed(4));
    const residualGamma = Number((portfolio.gamma + w1 * a21 + w2 * a22 + w3 * a23).toFixed(4));
    const residualVega  = Number((portfolio.vega  + w1 * a31 + w2 * a32 + w3 * a33).toFixed(4));

    const isNeutralized =
      Math.abs(residualDelta) < 0.05 &&
      Math.abs(residualGamma) < 0.05 &&
      Math.abs(residualVega) < 0.05;

    return {
      hedgeUnits: {
        [inst1.symbol]: w1,
        [inst2.symbol]: w2,
        [inst3.symbol]: w3,
      },
      residualDelta,
      residualGamma,
      residualVega,
      isNeutralized,
    };
  }
}
