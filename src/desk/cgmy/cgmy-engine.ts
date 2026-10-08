import { CgmyParams, CgmyResult, ComplexNumber } from './cgmy-types';
import { CgmyMath } from './cgmy-math';

export class CgmyEngine {
  public static calculate(params: CgmyParams): CgmyResult {
    const { spotPrice: S0, strikePrice: K, timeToMaturity: T, riskFreeRate: r, dividendYield: q, c, g, m, y, isCall } = params;

    if (S0 <= 0 || K <= 0 || T <= 0 || c <= 0 || g <= 0) {
      throw new Error('S0, K, T, c, and g must be strictly positive');
    }
    if (m <= 1) {
      throw new Error('Parameter m must be strictly greater than 1 for martingale risk-neutral measure');
    }
    if (y <= 0 || y >= 2 || Math.abs(y - 1.0) < 1e-6) {
      throw new Error('Parameter y must be in (0, 2) and not equal to 1.0');
    }

    const gammaNegY = CgmyMath.gamma(2.0 - y) / (y * (y - 1.0));

    // Martingale correction omega = -psi(-i)
    const omega = -c * gammaNegY * (
      Math.pow(m - 1.0, y) - Math.pow(m, y) +
      Math.pow(g + 1.0, y) - Math.pow(g, y)
    );

    const forwardLog = Math.log(S0) + (r - q + omega) * T;
    const lnK = Math.log(K);

    // Composite Simpson's integration on [0.0001, U_MAX]
    const uMax = 60.0;
    const n = 120; // Even number of steps
    const du = (uMax - 0.0001) / n;

    let sum1 = 0.0;
    let sum2 = 0.0;

    for (let i = 0; i <= n; i++) {
      const u = 0.0001 + i * du;
      const weight = (i === 0 || i === n) ? 1.0 : (i % 2 === 1 ? 4.0 : 2.0);

      // Integrand 1: phi(u - i)
      const cf1 = this.charFn(u, -1.0, T, c, g, m, y, gammaNegY, forwardLog);
      const exp1 = CgmyMath.complexExp({ re: 0, im: -u * lnK });
      const num1 = CgmyMath.complexMul(exp1, cf1);
      const denom1 = u * S0 * Math.exp((r - q) * T);
      const val1 = num1.im / denom1; // Re(num / (i * denom)) = Im(num) / denom

      // Integrand 2: phi(u)
      const cf2 = this.charFn(u, 0.0, T, c, g, m, y, gammaNegY, forwardLog);
      const exp2 = CgmyMath.complexExp({ re: 0, im: -u * lnK });
      const num2 = CgmyMath.complexMul(exp2, cf2);
      const val2 = num2.im / u; // Re(num / (i * u)) = Im(num) / u

      sum1 += weight * val1;
      sum2 += weight * val2;
    }

    const pi1 = 0.5 + (du / (3.0 * Math.PI)) * sum1;
    const pi2 = 0.5 + (du / (3.0 * Math.PI)) * sum2;

    const callPrice = S0 * Math.exp(-q * T) * pi1 - K * Math.exp(-r * T) * pi2;
    const price = isCall
      ? Math.max(0.0, callPrice)
      : Math.max(0.0, callPrice - S0 * Math.exp(-q * T) + K * Math.exp(-r * T));

    // Theoretical moments
    const var1 = c * CgmyMath.gamma(2.0 - y) * (Math.pow(m, y - 2.0) + Math.pow(g, y - 2.0));
    const skew1 = (c * CgmyMath.gamma(3.0 - y) * (Math.pow(m, y - 3.0) - Math.pow(g, y - 3.0))) / Math.pow(var1, 1.5);
    const kurt1 = 3.0 + (c * CgmyMath.gamma(4.0 - y) * (Math.pow(m, y - 4.0) + Math.pow(g, y - 4.0))) / (var1 * var1);

    return {
      price,
      martingaleCorrection: omega,
      variance: var1 * T,
      skewness: skew1 / Math.sqrt(T),
      kurtosis: kurt1 / T,
    };
  }

  private static charFn(
    u: number,
    shiftIm: number,
    T: number,
    c: number,
    g: number,
    m: number,
    y: number,
    gammaNegY: number,
    forwardLog: number
  ): ComplexNumber {
    // z = u + i * shiftIm
    // M - i*z = (M + shiftIm) - i*u
    // G + i*z = (G - shiftIm) + i*u
    const zM: ComplexNumber = { re: m + shiftIm, im: -u };
    const zG: ComplexNumber = { re: g - shiftIm, im: u };

    const powM = CgmyMath.complexPow(zM, y);
    const powG = CgmyMath.complexPow(zG, y);

    const mY = Math.pow(m, y);
    const gY = Math.pow(g, y);

    const bracketRe = (powM.re - mY) + (powG.re - gY);
    const bracketIm = powM.im + powG.im;

    const psiRe = c * gammaNegY * bracketRe;
    const psiIm = c * gammaNegY * bracketIm;

    // exp( i * z * forwardLog + T * psi )
    // i * (u + i * shiftIm) * forwardLog = (-shiftIm * forwardLog) + i * (u * forwardLog)
    const totalExponent: ComplexNumber = {
      re: -shiftIm * forwardLog + T * psiRe,
      im: u * forwardLog + T * psiIm,
    };

    return CgmyMath.complexExp(totalExponent);
  }
}
