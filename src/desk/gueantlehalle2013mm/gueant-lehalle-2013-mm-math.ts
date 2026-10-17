/**
 * Wave 278 — Guéant, Lehalle & Fernandez-Tapia (2013): Dealing with the Inventory Risk
 * Closed-form asymptotic bid/ask spreads under hard inventory bounds |q| <= Q.
 */
import type {
  GueantLehalle2013MmConfig,
  GueantLehalle2013MmResult,
  InventoryBoundedQuote,
} from './types';

export function computeGueantLehalle2013MarketMaking(
  cfg: GueantLehalle2013MmConfig,
): GueantLehalle2013MmResult {
  const {
    maxInventoryCapQ: Q,
    riskAversionGamma: gamma,
    volatilitySigma: sigma,
    orderBookIntensityA: A,
    orderBookDecayKappa: kappa,
  } = cfg;

  if (Q <= 0 || gamma <= 0 || sigma <= 0 || A <= 0 || kappa <= 0) {
    throw new Error('Invalid GueantLehalle2013MmConfig: all parameters must be positive');
  }

  const baseSpread = (1 / kappa) * Math.log(1 + gamma / kappa);
  const riskUnit = 0.5 * gamma * sigma * sigma;
  const quotes: InventoryBoundedQuote[] = [];

  for (let q = -Q; q <= Q; q++) {
    const valQ = Math.exp(-kappa * riskUnit * q * q * 0.1);
    const skew = (2 * q) * riskUnit * 0.5;
    const bidSpread = q < Q ? Math.max(0.0001, baseSpread + (2 * q + 1) * riskUnit * 0.5) : null;
    const askSpread = q > -Q ? Math.max(0.0001, baseSpread - (2 * q - 1) * riskUnit * 0.5) : null;

    quotes.push({
      inventory: q,
      optimalBidSpread: bidSpread,
      optimalAskSpread: askSpread,
      reservationPriceSkew: skew,
      asymptoticValueCoeff: valQ,
    });
  }

  const centerQuote = quotes.find((item) => item.inventory === 0)!;
  const neutralSpread = (centerQuote.optimalBidSpread ?? baseSpread) + (centerQuote.optimalAskSpread ?? baseSpread);
  const maxSkew = Math.abs(quotes[quotes.length - 1].reservationPriceSkew - quotes[0].reservationPriceSkew);

  return {
    quotes,
    neutralFullSpread: neutralSpread,
    maxInventorySkewWidth: maxSkew,
  };
}
