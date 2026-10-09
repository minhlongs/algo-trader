import { HasbrouckObservation, HasbrouckParams, HasbrouckResult, VarCoefficients } from './hasbrouck-types.js';
import { HasbrouckMath } from './hasbrouck-math.js';

export class HasbrouckEngine {
  public static validate(obs: HasbrouckObservation[], params: HasbrouckParams): void {
    if (!obs || obs.length < params.lags + 10) {
      throw new Error(`Observations must have at least ${params.lags + 10} data points`);
    }
    if (params.lags < 1 || !Number.isInteger(params.lags)) {
      throw new Error('VAR lags must be an integer >= 1');
    }
  }

  public static estimate(obs: HasbrouckObservation[], params: HasbrouckParams): HasbrouckResult {
    this.validate(obs, params);
    const p = params.lags;
    const n = obs.length - p;

    // Build regressor matrices
    // Eq 1: r_t ~ beta0 * x_t + sum(alpha_i * r_{t-i}) + sum(beta_i * x_{t-i})
    const X_r: number[][] = [];
    const y_r: number[] = [];

    // Eq 2: x_t ~ sum(gamma_i * r_{t-i}) + sum(phi_i * x_{t-i})
    const X_x: number[][] = [];
    const y_x: number[] = [];

    for (let t = p; t < obs.length; t++) {
      const r_t = obs[t].quoteRevision;
      const x_t = obs[t].tradeSign;

      const r_lags: number[] = [];
      const x_lags: number[] = [];
      for (let lag = 1; lag <= p; lag++) {
        r_lags.push(obs[t - lag].quoteRevision);
        x_lags.push(obs[t - lag].tradeSign);
      }

      // Regressors for r_t: [x_t, ...r_lags, ...x_lags]
      X_r.push([x_t, ...r_lags, ...x_lags]);
      y_r.push(r_t);

      // Regressors for x_t: [...r_lags, ...x_lags]
      X_x.push([...r_lags, ...x_lags]);
      y_x.push(x_t);
    }

    const betaR_full = HasbrouckMath.solveOls(X_r, y_r);
    const betaX_full = HasbrouckMath.solveOls(X_x, y_x);

    const betaZero = betaR_full[0];
    const alphaLags = betaR_full.slice(1, 1 + p);
    const betaLags = betaR_full.slice(1 + p);

    const gammaLags = betaX_full.slice(0, p);
    const phiLags = betaX_full.slice(p);

    // Residual calculations
    let sumErrR2 = 0;
    let sumErrX2 = 0;
    let sumErrRX = 0;

    for (let i = 0; i < n; i++) {
      let predR = 0;
      for (let j = 0; j < X_r[i].length; j++) predR += X_r[i][j] * betaR_full[j];
      const errR = y_r[i] - predR;

      let predX = 0;
      for (let j = 0; j < X_x[i].length; j++) predX += X_x[i][j] * betaX_full[j];
      const errX = y_x[i] - predX;

      sumErrR2 += errR * errR;
      sumErrX2 += errX * errX;
      sumErrRX += errR * errX;
    }

    const varR = sumErrR2 / n;
    const varX = sumErrX2 / n;
    const covRX = sumErrRX / n;

    // Impulse response accumulation
    const irfX = HasbrouckMath.computeImpulseResponse(alphaLags, betaZero, betaLags, gammaLags, phiLags, 1, 0, 30);
    const irfR = HasbrouckMath.computeImpulseResponse(alphaLags, betaZero, betaLags, gammaLags, phiLags, 0, 1, 30);

    const psiX = irfX.reduce((a, b) => a + b, 0);
    const psiR = irfR.reduce((a, b) => a + b, 0);

    // Variance decomposition with trade shock first
    const totalVariance = Math.max(1e-12, psiR * psiR * varR + 2 * psiR * psiX * covRX + psiX * psiX * varX);
    const tradeRelatedVariance = Math.max(0, psiX * psiX * varX);
    const informationShare = Math.min(1.0, Math.max(0, tradeRelatedVariance / totalVariance));

    const varCoefficients: VarCoefficients = {
      alphaLags,
      betaZero,
      betaLags,
      gammaLags,
      phiLags,
      residualVarR: varR,
      residualVarX: varX,
      residualCov: covRX,
    };

    return {
      lags: p,
      varCoefficients,
      permanentPriceImpact: psiX,
      totalVariance,
      tradeRelatedVariance,
      informationShare,
    };
  }
}
