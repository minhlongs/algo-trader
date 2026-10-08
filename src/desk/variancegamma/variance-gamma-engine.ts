import { VarianceGammaParams, VarianceGammaResult, ComplexNumber } from './variance-gamma-types';
import { VarianceGammaMath as VM } from './variance-gamma-math';

export class VarianceGammaEngine {
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

  public static calculate(params: VarianceGammaParams): VarianceGammaResult {
    const { spotPrice: S0, strikePrice: K, timeToMaturity: T, riskFreeRate: r, dividendYield: q, sigma, nu, theta, isCall } = params;

    if (S0 <= 0 || K <= 0 || T <= 0 || sigma <= 0 || nu <= 0) {
      throw new Error('Prices, maturity, volatility, and nu must be strictly positive');
    }

    // Drift compensator: omega = (1/nu) * ln(1 - theta*nu - 0.5*sigma^2*nu)
    const arg = 1.0 - theta * nu - 0.5 * sigma * sigma * nu;
    if (arg <= 0) {
      throw new Error('Variance Gamma martingale condition violated (1 - theta*nu - 0.5*sigma^2*nu <= 0)');
    }
    const omega = (1.0 / nu) * Math.log(arg);

    // Gauss-Laguerre integration for European Option via Carr-Madan Gil-Pelaez representation
    let int1 = 0.0;
    let int2 = 0.0;
    const lnK = Math.log(K);
    const forwardLog = Math.log(S0) + (r - q + omega) * T;

    for (let i = 0; i < this.GL_NODES.length; i++) {
      const u = this.GL_NODES[i];
      const weight = this.GL_WEIGHTS[i] * Math.exp(u);

      const cf1 = this.vgCF(u - 0.0, -1.0, T, sigma, nu, theta, forwardLog);
      const cf2 = this.vgCF(u, 0.0, T, sigma, nu, theta, forwardLog);

      const expMinusIuLnK = VM.exp({ re: 0, im: -u * lnK });

      const num1 = VM.mul(expMinusIuLnK, cf1);
      const denom1 = { re: 0, im: u * S0 * Math.exp((r - q) * T) };
      const val1 = VM.div(num1, denom1);
      int1 += weight * val1.re;

      const num2 = VM.mul(expMinusIuLnK, cf2);
      const denom2 = { re: 0, im: u };
      const val2 = VM.div(num2, denom2);
      int2 += weight * val2.re;
    }

    const p1 = 0.5 + (1.0 / Math.PI) * int1;
    const p2 = 0.5 + (1.0 / Math.PI) * int2;

    const callPrice = S0 * Math.exp(-q * T) * p1 - K * Math.exp(-r * T) * p2;
    const price = isCall ? Math.max(0.0, callPrice) : Math.max(0.0, callPrice + K * Math.exp(-r * T) - S0 * Math.exp(-q * T));

    // Moments
    const varT = (sigma * sigma + nu * theta * theta) * T;
    const skew = (theta * nu * (3.0 * sigma * sigma + 2.0 * theta * theta * nu)) / Math.pow(sigma * sigma + nu * theta * theta, 1.5) / Math.sqrt(T);
    const kurt = 3.0 * nu / T;

    return {
      price,
      impliedBlackScholesVolEstimate: Math.sqrt(varT / T),
      skewnessCharacteristic: skew,
      excessKurtosisEstimate: kurt,
    };
  }

  private static vgCF(u: number, shiftIm: number, T: number, sigma: number, nu: number, theta: number, forwardLog: number): ComplexNumber {
    // phi(z) = exp(i * z * forwardLog) * [ 1 - i * theta * nu * z + 0.5 * sigma^2 * nu * z^2 ]^(-T / nu)
    const z: ComplexNumber = { re: u, im: shiftIm };
    const iZ: ComplexNumber = { re: -z.im, im: z.re };

    const termTheta = VM.mulScalar(iZ, -theta * nu);
    const zSq = VM.mul(z, z);
    const termSigma = VM.mulScalar(zSq, 0.5 * sigma * sigma * nu);

    const baseBracket = VM.add({ re: 1, im: 0 }, VM.add(termTheta, termSigma));
    const powerPart = VM.powReal(baseBracket, -T / nu);

    const driftPart = VM.exp({ re: -z.im * forwardLog, im: z.re * forwardLog });
    return VM.mul(driftPart, powerPart);
  }
}
