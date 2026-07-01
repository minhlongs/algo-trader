/**
 * Paper Trading Market Scanner
 *
 * Self-contained multi-strategy market scan using Gamma API.
 * Extracted from paper-trading-orchestrator.ts for focused responsibility.
 *
 * Strategies:
 * 1. Cross-market logical arbitrage (primary vs general election)
 * 2. Near-resolution endgame (>95% or <5% = near-certain)
 * 3. YES+NO spread arbitrage
 */

import { logger } from '../../shared/utils/logger';
import type { SignalCandidate } from '../intelligence/signal-validator';

export type ProcessCandidateFn = (candidate: SignalCandidate, maxPositions: number) => Promise<void>;

/**
 * Scan Gamma API markets and feed candidates to the processing pipeline.
 */
export async function scanAndTrade(processCandidate: ProcessCandidateFn, maxPositions: number): Promise<void> {
  try {
    const resp = await fetch('https://gamma-api.polymarket.com/markets?closed=false&limit=200', {
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) return;
    const raw = (await resp.json()) as Array<Record<string, unknown>>;

    type PM = { id: string; title: string; yes: number; no: number; vol: number; group: string };
    const markets: PM[] = [];
    for (const m of raw) {
      try {
        const p = JSON.parse((m['outcomePrices'] as string) ?? '[]');
        const yes = parseFloat(p[0] ?? '0'), no = parseFloat(p[1] ?? '0');
        if (yes > 0 && no > 0) markets.push({
          id: String(m['conditionId'] ?? ''),
          title: String(m['question'] ?? ''),
          yes, no, vol: Number(m['volume'] ?? 0),
          group: String(m['groupItemTitle'] ?? m['question'] ?? ''),
        });
      } catch { /* skip */ }
    }

    // Strategy 1: Cross-market logical arb (primary vs general election)
    const groups: Record<string, PM[]> = {};
    for (const m of markets) { (groups[m.group] ??= []).push(m); }
    for (const ms of Object.values(groups)) {
      if (ms.length < 2) continue;
      ms.sort((a, b) => b.yes - a.yes);
      const primary = ms[0], general = ms[1];
      if (primary.yes < general.yes && general.yes - primary.yes > 0.03) {
        const edge = general.yes - primary.yes;
        await processCandidate({
          signalType: 'cross-market',
          markets: [
            { id: primary.id, title: primary.title, yesPrice: primary.yes, noPrice: primary.no },
            { id: general.id, title: general.title, yesPrice: general.yes, noPrice: general.no },
          ],
          expectedEdge: edge,
          reasoning: `Logical violation: "${primary.title.substring(0,30)}" YES=${primary.yes.toFixed(3)} < "${general.title.substring(0,30)}" YES=${general.yes.toFixed(3)}. Edge=${(edge*100).toFixed(1)}%`,
        }, maxPositions);
      }
    }

    // Strategy 2: Near-resolution endgame (>95% or <5% = near-certain)
    for (const m of markets) {
      if (m.vol < 10_000) continue;
      if (m.yes > 0.95) {
        const edge = 1 - m.yes - 0.02;
        if (edge > 0.005) await processCandidate({
          signalType: 'simple-arb',
          markets: [{ id: m.id, title: m.title, yesPrice: m.yes, noPrice: m.no }],
          expectedEdge: edge,
          reasoning: `Endgame: YES=${m.yes.toFixed(3)} near-certain, edge=${(edge*100).toFixed(1)}% after fees`,
        }, maxPositions);
      } else if (m.yes < 0.05) {
        const edge = m.yes - 0.02;
        if (edge > 0.005) await processCandidate({
          signalType: 'simple-arb',
          markets: [{ id: m.id, title: m.title, yesPrice: m.yes, noPrice: m.no }],
          expectedEdge: edge,
          reasoning: `Endgame: NO near-certain (YES=${m.yes.toFixed(3)}), edge=${(edge*100).toFixed(1)}%`,
        }, maxPositions);
      }
    }

    // Strategy 3: YES+NO spread (simple arb, rare but checked)
    for (const m of markets) {
      const spread = 1 - m.yes - m.no;
      if (spread > 0.025) await processCandidate({
        signalType: 'simple-arb',
        markets: [{ id: m.id, title: m.title, yesPrice: m.yes, noPrice: m.no }],
        expectedEdge: spread,
        reasoning: `Spread: YES+NO=${(m.yes+m.no).toFixed(3)}, edge=${(spread*100).toFixed(1)}%`,
      }, maxPositions);
    }

    logger.info('[PaperOrchestrator] Scan complete', { markets: markets.length });
  } catch (err) { logger.warn('[PaperOrchestrator] Scan error', { err: (err as Error).message }); }
}
