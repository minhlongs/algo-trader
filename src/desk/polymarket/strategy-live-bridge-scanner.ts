/**
 * Strategy-to-Live Bridge Scanner
 * Queries Gamma API for near-resolution endgame markets with mispriced odds.
 */

import { logger } from '../../shared/utils/logger';
import type { ScannerConfig, TradeSignal } from './strategy-live-bridge-types';

export interface EndgameScanOutcome {
  signals: TradeSignal[];
  totalMarkets: number;
}

/**
 * Scan Gamma API for high-probability endgame markets meeting volume and edge thresholds.
 */
export async function scanGammaEndgameMarkets(
  cfg: ScannerConfig,
): Promise<EndgameScanOutcome | null> {
  const resp = await fetch(
    'https://gamma-api.polymarket.com/markets?closed=false&limit=200',
    { signal: AbortSignal.timeout(15_000) },
  );

  if (!resp.ok) {
    logger.warn(`Gamma API error ${resp.status}`, 'StrategyLiveBridge');
    return null;
  }

  const markets = (await resp.json()) as Array<Record<string, unknown>>;
  const signals: TradeSignal[] = [];

  for (const m of markets) {
    if (signals.length >= cfg.maxSignalsPerScan) break;

    try {
      const prices = JSON.parse((m['outcomePrices'] as string) ?? '[]') as string[];
      const yes = parseFloat(prices[0] ?? '0');
      const vol = Number(m['volume'] ?? 0);
      const tokens = m['clobTokenIds'] as string | undefined;
      const yesTokenId = tokens ? JSON.parse(tokens)[0] : undefined;

      if (!yesTokenId || vol < cfg.minVolume) continue;

      const isEndgame = yes > cfg.priceThreshold || yes < (1 - cfg.priceThreshold);
      if (!isEndgame) continue;

      const side = yes > cfg.priceThreshold ? 'BUY' : 'SELL';
      const edge = side === 'BUY'
        ? 1 - yes - 0.02  // BUY YES at discount to $1
        : yes - 0.02;     // BUY NO at discount to $0

      if (edge <= 0.01) continue; // minimum 1% edge

      signals.push({
        tokenId: yesTokenId,
        side: side === 'BUY' ? 'SELL' : 'BUY', // BUY the cheaper side
        size: (cfg.capitalUsdc * 0.02) / yes,   // 2% capital position
        price: yes, // Always use YES price since scanner always trades YES token
        description: String(m['question'] ?? '').slice(0, 60),
        confidence: Math.abs(edge) * 100,
        timestamp: Date.now(),
      });
    } catch {
      // skip malformed entry
    }
  }

  return { signals, totalMarkets: markets.length };
}
