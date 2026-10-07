/**
 * Deflated Sharpe Ratio (DSR) implementation.
 * Accounts for strategy selection bias.
 */
import {
    BootstrapOptions,
    BootstrapResult,
    mulberry32,
    annualizedSharpe,
    percentile,
    DEFAULT_N_SIMULATIONS,
    DEFAULT_SIMULATION_SEED,
    DEFAULT_BARS_PER_YEAR
} from './validation-types';

export function calculateDSR(
    sharpe: number,
    sigma: number,
    nTrials: number,
    nBacktests: number
): number {
    if (sigma <= 0 || nTrials <= 0) return sharpe;

    // Simplified DSR adjustment based on Bailey & de Prado
    // Correction for multiple testing (selection bias)
    const expectation = 0.5772156649; // Euler-Mascheroni constant
    const zScore = sharpe / (sigma / Math.sqrt(nTrials));
    const adjustmentFactor = Math.sqrt(2 * Math.log(nBacktests)) -
                             (Math.log(Math.log(nBacktests)) + Math.log(4 * Math.PI)) / (2 * Math.sqrt(2 * Math.log(nBacktests)));

    return (zScore - expectation * adjustmentFactor) / (1 - expectation * adjustmentFactor);
}

export function bootstrapSharpeCi(
    returns: readonly number[],
    options?: BootstrapOptions
): BootstrapResult {
    const nBootstrap = options?.nBootstrap ?? DEFAULT_N_SIMULATIONS;
    const confidence = options?.confidence ?? 0.95;
    const seed = options?.seed ?? DEFAULT_SIMULATION_SEED;
    const barsPerYear = options?.barsPerYear ?? DEFAULT_BARS_PER_YEAR;

    if (returns.length < 5) return { ok: false, error: 'need at least 5 observations' };
    if (!Number.isInteger(nBootstrap) || nBootstrap <= 0) return { ok: false, error: 'nBootstrap must be integer >= 1' };
    if (!Number.isFinite(confidence) || confidence <= 0 || confidence >= 1) return { ok: false, error: 'confidence must be in (0, 1)' };
    if (!Number.isInteger(seed) || seed < 0) return { ok: false, error: 'seed must be integer >= 0' };

    for (let i = 0; i < returns.length; i++) {
        if (!Number.isFinite(returns[i])) {
            return { ok: false, error: 'All returns must be finite' };
        }
    }

    const observedSharpe = annualizedSharpe(returns, barsPerYear);
    const rng = mulberry32(seed);

    const bootstrapSharpes: number[] = new Array(nBootstrap);
    let positiveCount = 0;

    for (let b = 0; b < nBootstrap; b++) {
        const resampled = new Array(returns.length);
        for (let i = 0; i < returns.length; i++) {
            const idx = Math.floor(rng() * returns.length);
            resampled[i] = returns[idx];
        }
        const s = annualizedSharpe(resampled, barsPerYear);
        bootstrapSharpes[b] = s;
        if (s > 0) positiveCount++;
    }

    const alpha = (1 - confidence) / 2;
    const ciLower = percentile(bootstrapSharpes, alpha * 100);
    const ciUpper = percentile(bootstrapSharpes, (1 - alpha) * 100);
    const medianSharpe = percentile(bootstrapSharpes, 50);

    return {
        ok: true,
        observedSharpe,
        ciLower,
        ciUpper,
        medianSharpe,
        probPositive: positiveCount / nBootstrap,
        confidence,
        nBootstrap,
        seed
    };
}
