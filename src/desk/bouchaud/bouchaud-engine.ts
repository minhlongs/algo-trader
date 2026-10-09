import { BouchaudParams, BouchaudResult, ResponsePoint } from './bouchaud-types';
import { BouchaudMath } from './bouchaud-math';

export class BouchaudEngine {
  public static calculate(params: BouchaudParams): BouchaudResult {
    const { orderSigns, decayExponentBeta: beta, memoryExponentGamma: gamma } = params;
    const gamma0 = params.propagatorScale ?? 1.0;
    const s0 = params.initialPrice ?? 100.0;

    if (beta <= 0.0 || gamma <= 0.0 || gamma >= 1.0) {
      throw new Error('beta must be > 0 and gamma must be in (0, 1)');
    }
    if (!orderSigns || orderSigns.length === 0) {
      throw new Error('orderSigns must be a non-empty array');
    }

    const { regime, error, isArbitrageFree } = BouchaudMath.evaluateRegime(beta, gamma);

    // Compute response curve up to lag 20 (or order length)
    const maxLag = Math.min(25, orderSigns.length);
    const responseCurve: ResponsePoint[] = [];

    for (let lag = 0; lag <= maxLag; lag++) {
      const cLag = BouchaudMath.signAutocorrelation(lag, gamma);
      const gLag = BouchaudMath.barePropagator(lag, beta, gamma0);
      const rLag = BouchaudMath.computeDressedResponse(lag, beta, gamma, gamma0);

      responseCurve.push({
        lag,
        signAutocorrelation: cLag,
        barePropagator: gLag,
        dressedResponse: rLag,
      });
    }

    const simulatedPriceShifts = BouchaudMath.simulatePriceImpact(orderSigns, beta, gamma0);
    const cumulativePriceImpact = simulatedPriceShifts[simulatedPriceShifts.length - 1] ?? 0.0;

    return {
      efficiencyRegime: regime,
      diffusiveCancellationError: error,
      isArbitrageFree,
      cumulativePriceImpact,
      responseCurve,
    };
  }
}
