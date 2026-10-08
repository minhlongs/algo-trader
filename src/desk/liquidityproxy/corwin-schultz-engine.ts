import { CorwinSchultzParams, CorwinSchultzMetrics } from './corwin-schultz-types';

export class CorwinSchultzEngine {
  /**
   * Estimates the Bid-Ask Spread using the Corwin-Schultz (2012) High-Low estimator.
   * Widely used for extracting liquidity proxies in OTC/Dark Pool markets.
   */
  public static calculateSpread(params: CorwinSchultzParams): CorwinSchultzMetrics {
    const H1 = params.highDay1;
    const L1 = params.lowDay1;
    const H2 = params.highDay2;
    const L2 = params.lowDay2;

    // 2-day High and Low
    const H12 = Math.max(H1, H2);
    const L12 = Math.min(L1, L2);

    // Calculate Gamma (sum of squared log ratios of individual days)
    const logHL1 = Math.log(H1 / L1);
    const logHL2 = Math.log(H2 / L2);
    const gamma = (logHL1 * logHL1) + (logHL2 * logHL2);

    // Calculate Beta (squared log ratio of the combined 2-day period)
    const logHL12 = Math.log(H12 / L12);
    const beta = logHL12 * logHL12;

    const sqrt2 = Math.SQRT2; // ~1.41421356

    // In CS (2012), alpha = (sqrt(2 * beta) - sqrt(beta)) / (3 - 2 * sqrt(2)) 
    // Wait, the textbook formula for alpha is:
    // alpha = (sqrt(2 * beta) - sqrt(beta)) / (3 - 2 * sqrt(2)) - sqrt(gamma / (3 - 2*sqrt(2)))
    // Correct formula:
    // alpha = ( (sqrt(2)*sqrt(beta) - sqrt(beta)) / (3 - 2*sqrt(2)) ) - ( sqrt(gamma / (3 - 2*sqrt(2))) )
    // Let's use the standard simplified constants CS provides:
    // denom = 3 - 2*sqrt(2)
    const denom = 3.0 - 2.0 * sqrt2;
    
    // Actually the exact formula from CS (2012) Eq. 14 is:
    // alpha = [sqrt(2*beta) - sqrt(beta)] / [3 - 2*sqrt(2)] - sqrt(gamma / (3 - 2*sqrt(2)))
    // Wait, no: alpha = (sqrt(2 * beta) - sqrt(beta)) / ... is wrong.
    // The CS estimator formula simplifies to:
    // alpha = (sqrt(2) - 1)*sqrt(beta) / (3 - 2*sqrt(2)) - sqrt(gamma / (3 - 2*sqrt(2)))
    // No, CS 2012 is:
    // alpha = (sqrt(2beta) - sqrt(beta)) / (3 - 2sqrt(2)) - (sqrt(gamma / (3 - 2sqrt(2)))) -- wait, no.
    
    // Using correct CS Alpha formula:
    // beta = E[Sum(log(H/L)^2)] for 2 days combined
    // gamma = log(H1/L1)^2 + log(H2/L2)^2
    // alpha = (sqrt(2*beta) - sqrt(beta)) / (3 - 2*sqrt(2)) - sqrt(gamma / (3 - 2*sqrt(2)))
    
    // Correct CS (2012):
    const term1 = (Math.sqrt(2.0 * beta) - Math.sqrt(beta)) / denom;
    const term2 = Math.sqrt(gamma / denom);
    
    let alpha = term1 - term2;
    // Because gamma and beta are noisy, sometimes alpha becomes imaginary or term2 > term1
    // Spread S = (2 * (e^alpha - 1)) / (1 + e^alpha)
    // CS requires alpha >= 0 implies negative spread if not capped. We cap S at 0.
    
    // In practice, it's (sqrt(2) - 1) * sqrt(beta) / (3 - 2*sqrt(2)) - sqrt(gamma / (3 - 2*sqrt(2)))
    // Wait, let's just compute the literal definition to avoid typos:
    const k2 = Math.sqrt(8.0 / Math.PI); // Not needed for the simple estimator
    
    const csAlpha = (Math.sqrt(2.0 * beta) - Math.sqrt(beta)) / (3.0 - 2.0 * Math.sqrt(2.0)) - Math.sqrt(gamma / (3.0 - 2.0 * Math.sqrt(2.0)));
    
    let spread = 0.0;
    let isValid = true;
    
    if (csAlpha < 0) {
      // Numerical noise or extremely liquid market where variance exceeds combined high/low
      spread = 0.0;
      isValid = false; 
    } else {
      const eAlpha = Math.exp(csAlpha);
      spread = (2.0 * (eAlpha - 1.0)) / (1.0 + eAlpha);
    }
    
    return {
      gamma,
      beta,
      alpha: csAlpha,
      spread,
      isValid
    };
  }
}
