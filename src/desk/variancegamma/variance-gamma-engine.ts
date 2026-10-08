import { ComplexNumber, VarianceGammaCharFn } from './variance-gamma-char-fn';
import {
  VgModelParameters,
  VgOptionResult,
  VgOptionSpec,
} from './variance-gamma-types';

export class VarianceGammaEngine {
  public priceOption(
    params: VgModelParameters,
    spec: VgOptionSpec,
    alphaDamping = 1.5,
    numIntegrationSteps = 400,
    integrationUpperLimit = 40.0
  ): VgOptionResult {
    const { spotPrice: S, strikePrice: K, timeToExpiryYears: T, isCall } = spec;
    const r = spec.riskFreeRatePct / 100.0;
    const q = (spec.dividendYieldPct || 0.0) / 100.0;

    if (S <= 0 || K <= 0) throw new Error('Spot and strike prices must be positive');
    if (T <= 0) throw new Error('Expiry must be positive');
    if (params.sigma <= 0 || params.nu <= 0) throw new Error('Sigma and nu must be strictly positive');

    const omega = VarianceGammaCharFn.calculateDriftCorrector(params);
    const moments = VarianceGammaCharFn.calculateMoments(params, T);

    // Carr-Madan (1999) damped Fourier transform pricing:
    // log-strike variable k = ln(K) - ln(S) - (r - q + omega)*T
    const k = Math.log(K / S) - (r - q + omega) * T;
    const alpha = alphaDamping;

    // Numerical integration via Simpson's rule over [0, integrationUpperLimit]
    const n = numIntegrationSteps % 2 === 0 ? numIntegrationSteps : numIntegrationSteps + 1;
    const du = integrationUpperLimit / n;

    const integrand = (u: number): number => {
      // Evaluate phi_{VG}(u - i*(alpha + 1))
      // u_comp = u - i*(alpha + 1)
      const uReal = u;
      const uImag = -(alpha + 1.0);

      // Argument: 1 - i*(u_comp)*theta*nu + 0.5*sigma^2*nu*(u_comp)^2
      // (u_comp)^2 = (uReal + i*uImag)^2 = (uReal^2 - uImag^2) + 2*i*uReal*uImag
      const sqReal = uReal * uReal - uImag * uImag;
      const sqImag = 2.0 * uReal * uImag;

      // i * u_comp = i * (uReal + i * uImag) = -uImag + i * uReal
      const iUcompReal = -uImag;
      const iUcompImag = uReal;

      const baseReal = 1.0 - iUcompReal * params.theta * params.nu + 0.5 * params.sigma * params.sigma * params.nu * sqReal;
      const baseImag = -iUcompImag * params.theta * params.nu + 0.5 * params.sigma * params.sigma * params.nu * sqImag;

      const rBase = Math.sqrt(baseReal * baseReal + baseImag * baseImag);
      const angleBase = Math.atan2(baseImag, baseReal);

      const power = -T / params.nu;
      const phiMag = Math.pow(rBase, power);
      const phiAngle = power * angleBase;

      const phiReal = phiMag * Math.cos(phiAngle);
      const phiImag = phiMag * Math.sin(phiAngle);

      // Multiply by exp(-i * u * k) = cos(u*k) - i*sin(u*k)
      const cosUK = Math.cos(u * k);
      const sinUK = -Math.sin(u * k);
      const numReal = phiReal * cosUK - phiImag * sinUK;
      const numImag = phiReal * sinUK + phiImag * cosUK;

      // Denominator: alpha^2 + alpha - u^2 + i*(2*alpha + 1)*u
      const denReal = alpha * alpha + alpha - u * u;
      const denImag = (2.0 * alpha + 1.0) * u;
      const denMagSq = denReal * denReal + denImag * denImag;

      // Real part of numerator / denominator
      return (numReal * denReal + numImag * denImag) / denMagSq;
    };

    let integral = integrand(0.0001); // avoid exact 0 singularity
    for (let i = 1; i < n; i++) {
      const u = i * du;
      const weight = i % 2 === 0 ? 2.0 : 4.0;
      integral += weight * integrand(u);
    }
    integral += integrand(integrationUpperLimit);
    integral *= du / 3.0;

    const callPriceDamped = (Math.exp(-alpha * k) / Math.PI) * integral;
    let callPrice = S * Math.exp(-q * T) * callPriceDamped;
    callPrice = Math.max(0.0, Math.max(S * Math.exp(-q * T) - K * Math.exp(-r * T), callPrice));

    let finalPrice = callPrice;
    if (!isCall) {
      // Put-Call Parity: P = C - S*exp(-q*T) + K*exp(-r*T)
      const putPrice = callPrice - S * Math.exp(-q * T) + K * Math.exp(-r * T);
      finalPrice = Math.max(0.0, Math.max(K * Math.exp(-r * T) - S * Math.exp(-q * T), putPrice));
    }

    const intrinsic = isCall ? Math.max(0, S - K) : Math.max(0, K - S);

    return {
      optionPrice: Number(finalPrice.toFixed(4)),
      intrinsicValue: Number(intrinsic.toFixed(4)),
      isCall,
      moments,
      characteristicPsi: Number(omega.toFixed(6)),
    };
  }
}
