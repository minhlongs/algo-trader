/**
 * Provenance Run Card
 *
 * Every experiment / backtest result is frozen into a run card before it can be cited.
 * Writing a card is fail-safe: a write failure is logged and recorded on the card.
 *
 * @see docs/ALPHA_DISCOVERY_ARCHITECTURE.md — "Provenance Contract"
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { logger } from '../../shared/utils/logger';
import {
  RUN_CARD_SCHEMA_VERSION,
  type RunCard,
  type WriteRunCardInput,
} from './run-card-types';
import { hashConfig } from './run-card-config';
import { renderMarkdown } from './run-card-markdown';

export * from './run-card-types';
export * from './run-card-config';
export * from './run-card-markdown';

/**
 * Write a run card (JSON + markdown) into `runDir`. Fail-safe: never throws —
 * any write error is captured on the returned card as `writeError` and logged.
 */
export async function writeRunCard(
  runDir: string,
  input: WriteRunCardInput,
): Promise<RunCard> {
  const createdAt = new Date().toISOString();
  const card: RunCard = {
    schemaVersion: RUN_CARD_SCHEMA_VERSION,
    runId: input.runId,
    configHash: hashConfig(input.config),
    createdAt,
    resultClass: input.resultClass,
    strategyRef: input.strategyRef,
    hypothesis: input.hypothesis,
    dataSources: input.dataSources,
    metrics: input.metrics,
    gateResults: input.gateResults ?? [],
    warnings: input.warnings ?? [],
  };

  try {
    await mkdir(runDir, { recursive: true });
    await writeFile(join(runDir, 'run_card.json'), JSON.stringify(card, null, 2), 'utf8');
    await writeFile(join(runDir, 'run_card.md'), renderMarkdown(card), 'utf8');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    card.writeError = message;
    logger.warn('Run card write failed (fail-safe, result preserved)', 'RunCard', {
      runId: input.runId,
      err: message,
    });
  }

  return card;
}
