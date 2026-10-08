import { Complex, ComplexMath } from './complex-math';
import { GaussLegendreQuadrature } from './gauss-legendre-quadrature';
import { HestonModelParameters, HestonOptionPriceResult, OptionTerms } from './heston-types';

export class HestonPricingEngine {
  private evaluateCharacteristicFunc(
    phi: number,
    j: 1 | 2,
    params: HestonModelParameters,
    terms: OptionTerms
  ): Complex {
    const { spotPrice: S0, initialVariance: v0, kappa, theta, sigmaVolOfVol: sigma, rho } = params;
    const r = params.riskFreeRatePct / 100.0;
    const q = params.dividendYieldPct / 100.0;
    const tau = terms.timeToExpiryYears;

    const u = j === 1 ? 0.5 : -0.5;
    const b = j === 1 ? kappa - rho * sigma : kappa;
    const sigmaSq = sigma * sigma;

    // d = sqrt((b - i * rho * sigma * phi)^2 - sigma^2 * (2 * i * u * phi - phi^2))
    const beta: Complex = { re: b, im: -rho * sigma * phi };
    const betaSq = ComplexMath.mul(beta, beta);
    const gammaTerm: Complex = { re: -sigmaSq * (-phi * phi), im: -sigmaSq * (2.0 * u * phi) };
    const insideSqrt = ComplexMath.add(betaSq, gammaTerm);
    const d = ComplexMath.sqrt(insideSqrt);

    // g = (beta - d) / (beta + d)
    const betaMinusD = ComplexMath.sub(beta, d);
    const betaPlusD = ComplexMath.add(beta, d);
    const g = ComplexMath.div(betaMinusD, betaPlusD);

    // exp(-d * tau)
    const expNegDTau = ComplexMath.exp(ComplexMath.mulScalar(d, -tau));
    const gExp = ComplexMath.mul(g, expNegDTau);
    const oneMinusGExp = ComplexMath.sub({ re: 1.0, im: 0.0 }, gExp);
    const oneMinusG = ComplexMath.sub({ re: 1.0, im: 0.0 }, g);
    const logRatio = ComplexMath.log(ComplexMath.div(oneMinusGExp, oneMinusG));

    // C(phi) = (r - q) * i * phi * tau + (kappa * theta / sigma^2) * [ (beta - d) * tau - 2 * ln(...) ]
    const termC1: Complex = { re: 0.0, im: (r - q) * phi * tau };
    const bracketC = ComplexMath.sub(ComplexMath.mulScalar(betaMinusD, tau), ComplexMath.mulScalar(logRatio, 2.0));
    const termC2 = ComplexMath.mulScalar(bracketC, (kappa * theta) / sigmaSq);
    const C = ComplexMath.add(termC1, termC2);

    // D(phi) = ((beta - d) / sigma^2) * ( (1 - exp(-d * tau)) / (1 - g * exp(-d * tau)) )
    const numD = ComplexMath.sub({ re: 1.0, im: 0.0 }, expNegDTau);
    const ratioD = ComplexMath.div(numD, oneMinusGExp);
    const D = ComplexMath.mul(ComplexMath.mulScalar(betaMinusD, 1.0 / sigmaSq), ratioD);

    // Total exponent: C + D * v0 + i * phi * ln(S0 * exp((r - q) * tau))
    const forwardLog = Math.log(S0) + (r - q) * tau;
    const exponent = ComplexMath.add(
      ComplexMath.add(C, ComplexMath.mulScalar(D, v0)),
      { re: 0.0, im: phi * forwardLog }
    );

    return ComplexMath.exp(exponent);
  }

  public priceOption(params: HestonModelParameters, terms: OptionTerms): HestonOptionPriceResult {
    const { spotPrice: S0, kappa, theta, sigmaVolOfVol: sigma } = params;
    const { strikePrice: K, timeToExpiryYears: tau } = terms;
    const r = params.riskFreeRatePct / 100.0;
    const q = params.dividendYieldPct / 100.0;

    if (S0 <= 0 || K <= 0 || tau <= 0) throw new Error('Prices and expiry must be positive');
    if (sigma <= 0 || kappa <= 0 || theta <= 0) throw new Error('Parameters must be strictly positive');

    const fellerRatio = (2.0 * kappa * theta) / (sigma * sigma);
    const fellerSatisfied = fellerRatio >= 1.0;

    const uMax = Math.max(100.0, 10.0 / Math.sqrt(Math.max(1e-4, params.initialVariance * tau)));

    // Gil-Pelaez inversion: P_j = 0.5 + (1 / pi) * int_0^uMax Re( e^(-i*phi*ln(K)) * Phi_j(phi) / (i*phi) ) dphi
    // Notice Re(Z / (i * phi)) = Im(Z) / phi
    const computeP = (j: 1 | 2): number => {
      const integrand = (phi: number): number => {
        if (phi < 1e-8) return 0;
        const phiJ = this.evaluateCharacteristicFunc(phi, j, params, terms);
        // e^(-i * phi * ln(K))
        const angle = -phi * Math.log(K);
        const expTerm: Complex = { re: Math.cos(angle), im: Math.sin(angle) };
        const z = ComplexMath.mul(expTerm, phiJ);
        return z.im / phi;
      };
      const integral = GaussLegendreQuadrature.integrate(integrand, 1e-5, uMax);
      return Math.min(1.0, Math.max(0.0, 0.5 + (1.0 / Math.PI) * integral));
    };

    const P1 = computeP(1);
    const P2 = computeP(2);

    const callPrice = S0 * Math.exp(-q * tau) * P1 - K * Math.exp(-r * tau) * P2;
    const putPrice = callPrice - S0 * Math.exp(-q * tau) + K * Math.exp(-r * tau);

    return {
      callPriceUsd: Number(Math.max(0, callPrice).toFixed(4)),
      putPriceUsd: Number(Math.max(0, putPrice).toFixed(4)),
      probabilityP1: Number(P1.toFixed(6)),
      probabilityP2: Number(P2.toFixed(6)),
      fellerConditionRatio: Number(fellerRatio.toFixed(4)),
      fellerSatisfied,
    };
  }
}
