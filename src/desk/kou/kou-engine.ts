import { KouCharFn } from './kou-char-fn';
import { KouModelParameters, KouOptionResult, KouOptionSpec } from './kou-types';

export class KouEngine {
  public priceOption(
    params: KouModelParameters,
    spec: KouOptionSpec
  ): KouOptionResult {
    if (spec.spotPrice <= 0 || spec.strikePrice <= 0) {
      throw new Error('Spot and strike prices must be positive');
    }
    if (spec.timeToExpiryYears <= 0) {
      throw new Error('Time to expiry must be positive');
    }

    const S0 = spec.spotPrice;
    const K = spec.strikePrice;
    const T = spec.timeToExpiryYears;
    const r = spec.riskFreeRatePct / 100.0;
    const q = (spec.dividendYieldPct || 0.0) / 100.0;

    const moments = KouCharFn.calculateJumpMoments(params);
    const riskNeutralDrift =
      r - q - 0.5 * params.sigma * params.sigma - params.lambda * moments.expectedRelativeJump;

    // Carr-Madan (1999) damped Fourier inversion
    // Alpha dampening factor (typically alpha = 1.5)
    const alpha = 1.5;
    const k = Math.log(K);

    // Simpson's rule integration
    const N = 1024;
    const uMax = 50.0;
    const du = uMax / N;
    let integralSum = 0.0;

    for (let j = 0; j <= N; j++) {
      const u = j * du;
      const weight = j === 0 || j === N ? 1.0 : j % 2 === 1 ? 4.0 : 2.0;

      // Evaluate phi at complex argument u - i*(alpha + 1)
      // phi(u - i*(alpha + 1))
      // Let v = u - i*(alpha + 1)
      const uShifted = u;
      const vIm = -(alpha + 1.0);

      // Manual evaluation of characteristic function at u + i*vIm:
      const brownianRe =
        -0.5 * params.sigma * params.sigma * T * (uShifted * uShifted - vIm * vIm);
      const brownianIm =
        -params.sigma * params.sigma * T * uShifted * vIm +
        uShifted * riskNeutralDrift * T;
      const driftRealPart = -vIm * riskNeutralDrift * T;

      // Complex jump evaluation:
      // eta1 - i * (u + i * vIm) = (eta1 + vIm) - i * u
      const denom1A = params.eta1 + vIm;
      const denom1Norm = denom1A * denom1A + uShifted * uShifted;
      const term1Re = (params.p * params.eta1 * denom1A) / denom1Norm;
      const term1Im = (params.p * params.eta1 * uShifted) / denom1Norm;

      // eta2 + i * (u + i * vIm) = (eta2 - vIm) + i * u
      const denom2A = params.eta2 - vIm;
      const denom2Norm = denom2A * denom2A + uShifted * uShifted;
      const term2Re = ((1.0 - params.p) * params.eta2 * denom2A) / denom2Norm;
      const term2Im = (-(1.0 - params.p) * params.eta2 * uShifted) / denom2Norm;

      const jumpRe = params.lambda * T * (term1Re + term2Re - 1.0);
      const jumpIm = params.lambda * T * (term1Im + term2Im);

      const totalExponentRe = brownianRe + driftRealPart + jumpRe;
      const totalExponentIm = brownianIm + jumpIm + uShifted * Math.log(S0);
      const expMag = Math.exp(totalExponentRe - vIm * Math.log(S0));

      const phiRe = expMag * Math.cos(totalExponentIm);
      const phiIm = expMag * Math.sin(totalExponentIm);

      // Denominator: alpha^2 + alpha - u^2 + i * (2*alpha + 1)*u
      const dRe = alpha * alpha + alpha - uShifted * uShifted;
      const dIm = (2.0 * alpha + 1.0) * uShifted;
      const dNorm = dRe * dRe + dIm * dIm;

      // psi = exp(-r*T) * phi / denom
      const disc = Math.exp(-r * T);
      const psiRe = (disc * (phiRe * dRe + phiIm * dIm)) / dNorm;
      const psiIm = (disc * (phiIm * dRe - phiRe * dIm)) / dNorm;

      // Re(exp(-i * u * k) * psi) = cos(u*k)*psiRe + sin(u*k)*psiIm
      const integrand = Math.cos(uShifted * k) * psiRe + Math.sin(uShifted * k) * psiIm;
      integralSum += weight * integrand;
    }

    const integral = (du / 3.0) * integralSum;
    const callPrice = Math.max(0.0, (Math.exp(-alpha * k) / Math.PI) * integral);

    // Put-Call parity for Put price: P = C - S0*e^{-q*T} + K*e^{-r*T}
    const parityTerm = S0 * Math.exp(-q * T) - K * Math.exp(-r * T);
    const putPrice = Math.max(0.0, callPrice - parityTerm);

    const intrinsicValue = spec.isCall
      ? Math.max(0, S0 - K)
      : Math.max(0, K - S0);

    const optionPrice = spec.isCall ? callPrice : putPrice;

    return {
      optionPrice: Number(optionPrice.toFixed(4)),
      intrinsicValue: Number(intrinsicValue.toFixed(4)),
      isCall: spec.isCall,
      jumpMoments: moments,
      riskNeutralDrift: Number(riskNeutralDrift.toFixed(6)),
    };
  }
}
