import { BatesParams, BatesOptionParams, ComplexNumber } from './bates-types';
import { BatesMath as BM } from './bates-math';

export class BatesEngine {
  private static readonly GL_NODES = [
    0.093307812017, 0.492691740301, 1.215595412071, 2.269949526203, 3.667622721751,
    5.425336627413, 7.565916226613, 10.120228568019, 13.130282482175, 16.654407708329,
    20.776478899448, 25.623894226728, 31.407519169753, 38.530683306486, 48.026085572685,
  ];
  private static readonly GL_WEIGHTS = [
    0.218234817967, 0.342210177922, 0.263027577941, 0.126425818105, 0.040206864921,
    0.008563877803, 0.001212436147, 0.000111674392, 0.000006459926, 0.000000222631,
    0.000000004312, 0.000000000042, 0.000000000000, 0.000000000000, 0.000000000000,
  ];

  public static calculateEuropeanOption(model: BatesParams, option: BatesOptionParams): number {
    const T = option.timeToMaturity;
    if (T <= 0) {
      return option.isCall
        ? Math.max(0, model.spotPrice - option.strike)
        : Math.max(0, option.strike - model.spotPrice);
    }

    let integral1 = 0.0;
    let integral2 = 0.0;
    const lnK = Math.log(option.strike);
    const fMinusI = model.spotPrice * Math.exp((model.riskFreeRate - model.dividendYield) * T);

    for (let idx = 0; idx < this.GL_NODES.length; idx++) {
      const phi = this.GL_NODES[idx];
      const weight = this.GL_WEIGHTS[idx] * Math.exp(phi);

      const f2 = this.batesCF(model, T, { re: phi, im: 0 });
      const f1 = this.batesCF(model, T, { re: phi, im: -1.0 });

      const expMinusIPhiLnK = BM.exp({ re: 0, im: -phi * lnK });

      const num2 = BM.mul(expMinusIPhiLnK, f2);
      const integrand2 = BM.div(num2, { re: 0, im: phi });
      integral2 += weight * integrand2.re;

      const num1 = BM.mul(expMinusIPhiLnK, f1);
      const denom1 = { re: 0, im: phi * fMinusI };
      const integrand1 = BM.div(num1, denom1);
      integral1 += weight * integrand1.re;
    }

    const p1 = 0.5 + (1.0 / Math.PI) * integral1;
    const p2 = 0.5 + (1.0 / Math.PI) * integral2;

    const callPrice = model.spotPrice * Math.exp(-model.dividendYield * T) * p1 -
                      option.strike * Math.exp(-model.riskFreeRate * T) * p2;

    if (option.isCall) {
      return Math.max(0, callPrice);
    }
    const putPrice = callPrice + option.strike * Math.exp(-model.riskFreeRate * T) -
                     model.spotPrice * Math.exp(-model.dividendYield * T);
    return Math.max(0, putPrice);
  }

  public static batesCF(model: BatesParams, tau: number, phi: ComplexNumber): ComplexNumber {
    const hestonPart = this.hestonCF(model, tau, phi);
    const jumpPart = this.jumpCF(model, tau, phi);
    return BM.mul(hestonPart, jumpPart);
  }

  private static hestonCF(m: BatesParams, tau: number, phi: ComplexNumber): ComplexNumber {
    const kappa = m.kappa;
    const theta = m.theta;
    const sigma = m.volOfVol;
    const rho = m.rho;
    const v0 = m.initialVariance;
    const i = { re: 0, im: 1 };

    const iRhoSigma = BM.mulScalar(i, rho * sigma);
    const a1 = BM.sub({ re: kappa, im: 0 }, BM.mul(iRhoSigma, phi));

    const phiSq = BM.mul(phi, phi);
    const iPhi = BM.mul(i, phi);
    const b1 = BM.add(phiSq, iPhi);

    const a1Sq = BM.mul(a1, a1);
    const sigSqB1 = BM.mulScalar(b1, sigma * sigma);
    const d = BM.sqrt(BM.add(a1Sq, sigSqB1));

    const a1MinusD = BM.sub(a1, d);
    const g = BM.div(a1MinusD, BM.add(a1, d));

    const expMinusDTau = BM.exp(BM.mulScalar(d, -tau));
    const one = { re: 1, im: 0 };
    const numD = BM.sub(one, expMinusDTau);
    const denD = BM.sub(one, BM.mul(g, expMinusDTau));

    const D = BM.mul(BM.mulScalar(a1MinusD, 1.0 / (sigma * sigma)), BM.div(numD, denD));

    const C1 = BM.mulScalar(a1MinusD, tau);
    const insideLog = BM.div(denD, BM.sub(one, g));
    const C2 = BM.mulScalar(BM.log(insideLog), -2.0);
    const C = BM.mulScalar(BM.add(C1, C2), (kappa * theta) / (sigma * sigma));

    const fwdLog = Math.log(m.spotPrice) + (m.riskFreeRate - m.dividendYield) * tau;
    const drift = BM.mulScalar(iPhi, fwdLog);

    return BM.exp(BM.add(C, BM.add(BM.mulScalar(D, v0), drift)));
  }

  private static jumpCF(m: BatesParams, tau: number, phi: ComplexNumber): ComplexNumber {
    const lambda = m.jumpIntensity;
    if (lambda === 0) return { re: 1, im: 0 };

    const gammaJ = m.jumpMean;
    const deltaJ = m.jumpVol;
    const kBar = Math.exp(gammaJ + 0.5 * deltaJ * deltaJ) - 1.0;

    const i = { re: 0, im: 1 };
    const iPhi = BM.mul(i, phi);
    const term1 = BM.mulScalar(iPhi, gammaJ);
    const phiSq = BM.mul(phi, phi);
    const term2 = BM.mulScalar(phiSq, -0.5 * deltaJ * deltaJ);
    const exponentE = BM.add(term1, term2);

    const expTerm = BM.exp(exponentE);
    const minusOne = BM.sub(expTerm, { re: 1, im: 0 });

    const driftComp = BM.mulScalar(iPhi, -lambda * kBar * tau);
    const jumpExponent = BM.add(BM.mulScalar(minusOne, lambda * tau), driftComp);

    return BM.exp(jumpExponent);
  }
}
