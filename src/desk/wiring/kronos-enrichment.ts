/**
 * Kronos Signal Enrichment
 * Optionally enriches signal reasoning with Kronos sidecar forecast data.
 * Gracefully returns original reasoning if sidecar is unavailable.
 */

import { isSidecarHealthy } from '../intelligence/kronos-sidecar-monitor';
import { alphaear } from '../intelligence/alphaear-client';

interface EnrichableCandidate {
  reasoning: string;
  markets: Array<{ yesPrice: number; [k: string]: unknown }>;
}

/** Enrich signal reasoning with Kronos forecast when sidecar is healthy */
export async function enrichWithKronos(candidate: EnrichableCandidate): Promise<void> {
  if (!isSidecarHealthy()) return;

  try {
    const prices = candidate.markets.map(m => m.yesPrice);
    if (prices.length === 0) return;

    const forecast = await alphaear.forecast(prices, 60, 5, candidate.reasoning);
    if (forecast.length === 0) return;

    const last = forecast[forecast.length - 1];
    if (!last) return;

    const direction = last.close > (prices[0] ?? 0) ? 'UP' : 'DOWN';
    candidate.reasoning = `${candidate.reasoning} [Kronos: predicted=${last.close.toFixed(4)} direction=${direction}]`;
  } catch {
    // Kronos enrichment is optional — never block on failure
  }
}
