import { GueantParams, GueantResult, GueantQuote } from './gueant-types';
import { GueantMath } from './gueant-math';

export class GueantEngine {
  public static calculate(params: GueantParams): GueantResult {
    const {
      midPrice: S,
      maxInventory: Q,
      currentInventory = 0,
      timeHorizon: T,
      currentTime: t,
      volatility: sigma,
      riskAversion: gamma,
      orderIntensityA: A,
      orderSensitivityK: k,
      terminalLiquidationPenalty: alphaTerm,
    } = params;

    if (S <= 0 || Q <= 0 || T <= 0 || sigma <= 0 || gamma <= 0 || A <= 0 || k <= 0) {
      throw new Error('Mid-price, max inventory, horizon, volatility, gamma, A, and k must be strictly positive');
    }

    if (t < 0 || t >= T) {
      throw new Error('Current time t must be in [0, T)');
    }

    if (alphaTerm < 0) {
      throw new Error('Terminal liquidation penalty must be non-negative');
    }

    const tau = T - t;
    const n = 2 * Q + 1;

    // Transition coupling constant C from Gueant (2012, 2016)
    const ratio = gamma / k;
    const exponent = 1.0 + 1.0 / ratio;
    const constantC = A * Math.pow(1.0 + ratio, -exponent);

    // Construct tridiagonal matrix M of size n x n
    const M: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      const q = i - Q; // Inventory from -Q to +Q
      M[i][i] = -0.5 * k * gamma * sigma * sigma * q * q;

      if (i > 0) {
        M[i][i - 1] = constantC;
      }
      if (i < n - 1) {
        M[i][i + 1] = constantC;
      }
    }

    // Scale M by time to horizon tau: MTau = M * tau
    const MTau: number[][] = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => M[i][j] * tau)
    );

    // Compute matrix exponential exp(M * tau)
    const expMTau = GueantMath.matrixExponential(MTau);

    // Terminal condition vector: w(T, q) = exp(-0.5 * k * gamma * alphaTerm * q^2)
    const wTerminal = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      const q = i - Q;
      wTerminal[i] = Math.exp(-0.5 * k * gamma * alphaTerm * q * q);
    }

    // Solution at time t: w(t) = exp(M * tau) * w(T)
    const w = GueantMath.multiplyMatrixVector(expMTau, wTerminal);

    const quotes: GueantQuote[] = [];

    for (let i = 0; i < n; i++) {
      const q = i - Q;

      // Ask spread: delta^a*(q) = (1/k) * (1 + ln(w[q] / w[q-1]))
      let askSpread = 0.0;
      if (i > 0 && w[i - 1] > 0 && w[i] > 0) {
        askSpread = (1.0 / k) * (1.0 + Math.log(w[i] / w[i - 1]));
      } else {
        // At lower inventory limit -Q, market maker cannot sell further
        askSpread = 999.0;
      }

      // Bid spread: delta^b*(q) = (1/k) * (1 + ln(w[q] / w[q+1]))
      let bidSpread = 0.0;
      if (i < n - 1 && w[i + 1] > 0 && w[i] > 0) {
        bidSpread = (1.0 / k) * (1.0 + Math.log(w[i] / w[i + 1]));
      } else {
        // At upper inventory limit +Q, market maker cannot buy further
        bidSpread = 999.0;
      }

      const totalSpread = (askSpread < 500 && bidSpread < 500) ? askSpread + bidSpread : Math.max(askSpread, bidSpread);
      const resPrice = (askSpread < 500 && bidSpread < 500)
        ? S + 0.5 * (askSpread - bidSpread)
        : (askSpread < 500 ? S - askSpread : S + bidSpread);

      quotes.push({
        inventory: q,
        optimalBidSpread: bidSpread,
        optimalAskSpread: askSpread,
        totalSpread,
        optimalBid: S - bidSpread,
        optimalAsk: S + askSpread,
        reservationPrice: resPrice,
      });
    }

    const clampedCurrentInv = Math.max(-Q, Math.min(Q, currentInventory));
    const currentIdx = clampedCurrentInv + Q;
    const currentQuote = quotes[currentIdx];

    return {
      quotes,
      currentQuote,
      matrixDimension: n,
      constantC,
    };
  }
}
