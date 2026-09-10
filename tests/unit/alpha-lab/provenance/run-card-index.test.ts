/**
 * Run Card Index tests
 *
 * Covers: buildRunCardIndex finds run_card.json across roots, readRunCardByRunId
 * returns the card, duplicate runId last-write-wins, missing root yields nothing,
 * unreadable/malformed card is skipped, and DEFAULT_RUN_CARD_ROOTS is exported.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, symlink } from 'node:fs/promises';
import { rmSync, Stats } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { logger } from '../../../../src/shared/utils/logger';

import {
  buildRunCardIndex,
  readRunCardByRunId,
  indexRunCards,
  DEFAULT_RUN_CARD_ROOTS,
} from '../../../../src/alpha-lab/provenance/run-card-index';

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

  it('skips run_card.json when file contents parse to null', async () => {
    const sub = join(tmp, 'sub');
    await mkdir(sub, { recursive: true });
    await writeFile(join(sub, 'run_card.json'), 'null');

    const entries = await indexRunCards(tmp);
    expect(entries).toEqual([]);
  });

  it('skips dangling symlinks where stat fails', async () => {
    const dangling = join(tmp, 'dangling-symlink');
    await symlink(join(tmp, 'nonexistent-target'), dangling);

    const entries = await indexRunCards(tmp);
    expect(entries).toEqual([]);
  });

  it('handles walk failure with Error and logs warning', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockReturnValue();
    await writeFile(join(tmp, 'dummy.txt'), 'content');
    const orig = Stats.prototype.isDirectory;
    Stats.prototype.isDirectory = function () {
      throw new Error('isDirectory failed');
    };
    try {
      const entries = await indexRunCards(tmp);
      expect(entries).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith('[RunCardIndex] walk failed', {
        root: tmp,
        err: 'isDirectory failed',
      });
    } finally {
      Stats.prototype.isDirectory = orig;
      warnSpy.mockRestore();
    }
  });

  it('handles walk failure with non-Error throw and logs warning with String(err)', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockReturnValue();
    await writeFile(join(tmp, 'dummy.txt'), 'content');
    const orig = Stats.prototype.isDirectory;
    Stats.prototype.isDirectory = function () {
      throw 'non-error-walk-failure';
    };
    try {
      const entries = await indexRunCards(tmp);
      expect(entries).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith('[RunCardIndex] walk failed', {
        root: tmp,
        err: 'non-error-walk-failure',
      });
    } finally {
      Stats.prototype.isDirectory = orig;
      warnSpy.mockRestore();
    }
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

  it('uses DEFAULT_RUN_CARD_ROOTS when roots parameter is omitted', async () => {
    const index = await buildRunCardIndex();
    expect(index).toBeInstanceOf(Map);
  });
});

// ── readRunCardByRunId ────────────────────────────────────────────────────────

describe('readRunCardByRunId', () => {
  it('returns null when no card exists for the runId', async () => {
    const cardResult = await readRunCardByRunId('missing', [tmp]);
    expect(cardResult).toBeNull();
  });

  it('uses DEFAULT_RUN_CARD_ROOTS when roots parameter is omitted', async () => {
    const cardResult = await readRunCardByRunId('non-existent-default-run');
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

  it('handles unreadable run card when file is missing at read time (Error instance)', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockReturnValue();
    const rootA = join(tmp, 'rootA');
    await mkdir(rootA, { recursive: true });
    await writeFile(join(rootA, 'run_card.json'), JSON.stringify(card('run-race-1', 's1')));

    const roots = [rootA];
    Object.defineProperty(roots, '1', {
      get() {
        // Remove file after rootA was scanned during buildRunCardIndex
        rmSync(join(rootA, 'run_card.json'));
        return join(tmp, 'dummy-root');
      },
    });

    const cardResult = await readRunCardByRunId('run-race-1', roots);
    expect(cardResult).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      '[RunCardIndex] unreadable run card',
      expect.objectContaining({
        runId: 'run-race-1',
        path: join(rootA, 'run_card.json'),
        err: expect.stringContaining('ENOENT'),
      }),
    );
    warnSpy.mockRestore();
  });

  it('handles unreadable run card when non-Error is thrown during parsing', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockReturnValue();
    const rootA = join(tmp, 'rootA');
    await mkdir(rootA, { recursive: true });
    await writeFile(join(rootA, 'run_card.json'), JSON.stringify(card('run-non-err', 's1')));

    let parseCalls = 0;
    const origParse = JSON.parse;
    const parseSpy = vi.spyOn(JSON, 'parse').mockImplementation(function (...args) {
      parseCalls++;
      if (parseCalls > 1) {
        throw 'non-error-json-parse';
      }
      return origParse.apply(JSON, args);
    });

    try {
      const cardResult = await readRunCardByRunId('run-non-err', [rootA]);
      expect(cardResult).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith('[RunCardIndex] unreadable run card', {
        runId: 'run-non-err',
        path: join(rootA, 'run_card.json'),
        err: 'non-error-json-parse',
      });
    } finally {
      parseSpy.mockRestore();
      warnSpy.mockRestore();
    }
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