/**
 * Run Card Index tests
 *
 * Covers: buildRunCardIndex finds run_card.json across roots, readRunCardByRunId
 * returns the card, duplicate runId last-write-wins, missing root yields nothing,
 * unreadable/malformed card is skipped, and DEFAULT_RUN_CARD_ROOTS is exported.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildRunCardIndex,
  readRunCardByRunId,
  indexRunCards,
  DEFAULT_RUN_CARD_ROOTS,
} from '../run-card-index';

// ── Fixtures ──────────────────────────────────────────────────────────────────

let tmp: string;
beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'run-card-index-'));
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

const card = (runId: string, strategyRef: string) => ({
  runId,
  resultClass: 'PAPER',
  strategyRef,
  configHash: 'abc',
  createdAt: '2026-01-01T00:00:00Z',
  metrics: { sharpe: 1.0 },
  gateResults: [],
  warnings: [],
});

// ── indexRunCards ──────────────────────────────────────────────────────────────

describe('indexRunCards', () => {
  it('returns an empty array when the root does not exist', async () => {
    const entries = await indexRunCards(join(tmp, 'does-not-exist'));
    expect(entries).toEqual([]);
  });

  it('finds run_card.json files recursively', async () => {
    const deep = join(tmp, 'a', 'b', 'c');
    await mkdir(deep, { recursive: true });
    await writeFile(join(deep, 'run_card.json'), JSON.stringify(card('run-9', 'strat-x')));
    await writeFile(join(deep, 'other.json'), JSON.stringify({ not: 'a card' }));

    const entries = await indexRunCards(tmp);
    expect(entries).toHaveLength(1);
    expect(entries[0].runId).toBe('run-9');
    expect(entries[0].path).toBe(join(deep, 'run_card.json'));
  });

  it('skips malformed run_card.json without failing the whole index', async () => {
    const sub = join(tmp, 'sub');
    await mkdir(sub, { recursive: true });
    await writeFile(join(sub, 'run_card.json'), 'not json{{{');
    await writeFile(join(sub, 'run_card2.json'), JSON.stringify(card('run-10', 'strat-y')));

    const entries = await indexRunCards(tmp);
    expect(entries).toEqual([]);
  });

  it('skips run_card.json missing a string runId', async () => {
    const sub = join(tmp, 'sub');
    await mkdir(sub, { recursive: true });
    await writeFile(join(sub, 'run_card.json'), JSON.stringify({ strategyRef: 'x' }));

    const entries = await indexRunCards(tmp);
    expect(entries).toEqual([]);
  });
});

// ── buildRunCardIndex ─────────────────────────────────────────────────────────

describe('buildRunCardIndex', () => {
  it('indexes across multiple roots', async () => {
    const rootA = join(tmp, 'a');
    const rootB = join(tmp, 'b');
    await mkdir(rootA, { recursive: true });
    await mkdir(rootB, { recursive: true });
    await writeFile(join(rootA, 'run_card.json'), JSON.stringify(card('run-1', 's1')));
    await writeFile(join(rootB, 'run_card.json'), JSON.stringify(card('run-2', 's2')));

    const index = await buildRunCardIndex([rootA, rootB]);
    expect(index.size).toBe(2);
    expect(index.get('run-1')?.path).toBe(join(rootA, 'run_card.json'));
    expect(index.get('run-2')?.path).toBe(join(rootB, 'run_card.json'));
  });

  it('last write wins on duplicate runId', async () => {
    const rootA = join(tmp, 'a');
    const rootB = join(tmp, 'b');
    await mkdir(rootA, { recursive: true });
    await mkdir(rootB, { recursive: true });
    await writeFile(join(rootA, 'run_card.json'), JSON.stringify(card('run-1', 's1')));
    await writeFile(join(rootB, 'run_card.json'), JSON.stringify(card('run-1', 's2')));

    const index = await buildRunCardIndex([rootA, rootB]);
    expect(index.size).toBe(1);
    expect(index.get('run-1')?.path).toBe(join(rootB, 'run_card.json'));
  });

  it('ignores roots that do not exist', async () => {
    const index = await buildRunCardIndex([join(tmp, 'nope')]);
    expect(index.size).toBe(0);
  });
});

// ── readRunCardByRunId ────────────────────────────────────────────────────────

describe('readRunCardByRunId', () => {
  it('returns null when no card exists for the runId', async () => {
    const cardResult = await readRunCardByRunId('missing', [tmp]);
    expect(cardResult).toBeNull();
  });

  it('returns the parsed card when found', async () => {
    const sub = join(tmp, 'sub');
    await mkdir(sub, { recursive: true });
    await writeFile(join(sub, 'run_card.json'), JSON.stringify(card('run-7', 'rsi-strat')));

    const cardResult = await readRunCardByRunId('run-7', [tmp]);
    expect(cardResult).not.toBeNull();
    expect(cardResult?.runId).toBe('run-7');
    expect(cardResult?.strategyRef).toBe('rsi-strat');
  });

  it('returns null when the card file is unreadable', async () => {
    const sub = join(tmp, 'sub');
    await mkdir(sub, { recursive: true });
    await writeFile(join(sub, 'run_card.json'), '{ broken');

    const cardResult = await readRunCardByRunId('whatever', [tmp]);
    expect(cardResult).toBeNull();
  });
});

// ── Constants ─────────────────────────────────────────────────────────────────

describe('DEFAULT_RUN_CARD_ROOTS', () => {
  it('is a non-empty array of conventional roots', () => {
    expect(Array.isArray(DEFAULT_RUN_CARD_ROOTS)).toBe(true);
    expect(DEFAULT_RUN_CARD_ROOTS.length).toBeGreaterThan(0);
    expect(DEFAULT_RUN_CARD_ROOTS.every((r) => typeof r === 'string')).toBe(true);
  });
});