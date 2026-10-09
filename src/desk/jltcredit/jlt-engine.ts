import { CreditRating, JltBondParams, JltPricingResult, JltTransitionMatrix } from './jlt-types.js';
import { JltMath } from './jlt-math.js';

export class JltEngine {
  public static readonly RATINGS: CreditRating[] = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'D'];
  public static readonly DEFAULT_INDEX = 7;

  // Standard historical annual rating transition matrix (P-measure)
  public static readonly BENCHMARK_TRANSITION_P: number[][] = [
    [0.9081, 0.0833, 0.0068, 0.0006, 0.0012, 0.0000, 0.0000, 0.0000],
    [0.0070, 0.9065, 0.0779, 0.0064, 0.0006, 0.0014, 0.0002, 0.0000],
    [0.0009, 0.0227, 0.9105, 0.0552, 0.0074, 0.0026, 0.0001, 0.0006],
    [0.0002, 0.0033, 0.0595, 0.8693, 0.0530, 0.0117, 0.0012, 0.0018],
    [0.0003, 0.0014, 0.0067, 0.0773, 0.8053, 0.0884, 0.0100, 0.0106],
    [0.0000, 0.0011, 0.0024, 0.0043, 0.0648, 0.8346, 0.0407, 0.0521],
    [0.0000, 0.0000, 0.0022, 0.0130, 0.0238, 0.1124, 0.6486, 0.2000],
    [0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 1.0000],
  ];

  // Rating-dependent risk premium scaling factor for default intensity
  public static readonly BENCHMARK_RISK_PREMIA: number[] = [1.2, 1.25, 1.35, 1.45, 1.55, 1.65, 1.75, 1.0];

  public static validate(params: JltBondParams): void {
    if (!this.RATINGS.includes(params.rating)) throw new Error(`Invalid credit rating: ${params.rating}`);
    if (params.maturity <= 0) throw new Error('Maturity must be strictly positive');
    if (params.recoveryRate < 0 || params.recoveryRate >= 1.0) throw new Error('Recovery rate must be in [0, 1)');
    if (params.riskFreeRate < 0) throw new Error('Risk free rate must be non-negative');
  }

  public static priceBond(
    params: JltBondParams,
    transitionP: number[][] = this.BENCHMARK_TRANSITION_P,
    riskPremia: number[] = this.BENCHMARK_RISK_PREMIA
  ): JltPricingResult {
    this.validate(params);
    const ratingIndex = this.RATINGS.indexOf(params.rating);

    // Build risk-neutral 1-year matrix Q
    const Q1 = JltMath.scaleToRiskNeutral(transitionP, riskPremia, this.DEFAULT_INDEX);

    // Multi-period transitions
    const Pt = JltMath.matrixPower(transitionP, params.maturity);
    const Qt = JltMath.matrixPower(Q1, params.maturity);

    const probDefP = Pt[ratingIndex][this.DEFAULT_INDEX];
    const probDefQ = Qt[ratingIndex][this.DEFAULT_INDEX];

    const pRiskFree = Math.exp(-params.riskFreeRate * params.maturity);
    // Bond payoff at T: 1 if survival, R if default
    const expectedPayoffQ = (1.0 - probDefQ) * 1.0 + probDefQ * params.recoveryRate;
    const pDefaultable = pRiskFree * expectedPayoffQ;

    // Credit spread s: -1/T * ln(pDefaultable / pRiskFree) = -1/T * ln(expectedPayoffQ)
    const creditSpread = expectedPayoffQ > 0 ? -(1.0 / params.maturity) * Math.log(expectedPayoffQ) : 0;
    const creditSpreadBps = creditSpread * 10000;

    // Implied hazard rate: -1/T * ln(1 - probDefQ)
    const hazardRate = probDefQ < 1.0 ? -(1.0 / params.maturity) * Math.log(1.0 - probDefQ) : 1.0;

    return {
      rating: params.rating,
      maturity: params.maturity,
      riskFreeZeroPrice: pRiskFree,
      defaultableZeroPrice: pDefaultable,
      cumulativeDefaultProbP: probDefP,
      cumulativeDefaultProbQ: probDefQ,
      creditSpreadBps,
      hazardRate,
    };
  }

  public static generateCreditCurve(
    rating: CreditRating,
    maturities: number[],
    recoveryRate = 0.4,
    riskFreeRate = 0.04
  ): JltPricingResult[] {
    return maturities.map(m => this.priceBond({ rating, maturity: m, recoveryRate, riskFreeRate }));
  }
}
