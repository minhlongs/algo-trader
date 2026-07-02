/**
 * Tests for Post Similarity Engine
 * Phase 34b Content Personalization
 */
import { describe, it, expect } from 'vitest';
import { findSimilarPosts, SimilarityInput } from '../post-similarity-engine';

function makePost(overrides: Partial<SimilarityInput> = {}): SimilarityInput {
  return {
    id: Math.random().toString(36).slice(2),
    title: 'Test Post',
    tags: ['test'],
    ...overrides,
  };
}

describe('findSimilarPosts', () => {
  it('returns empty array when no candidates', () => {
    const source = makePost({ id: 's1', title: 'Bitcoin Trading Strategies' });
    const result = findSimilarPosts(source, []);
    expect(result).toEqual([]);
  });

  it('returns empty array when no candidates pass minScore', () => {
    const source = makePost({ id: 's1', title: 'AAAA BBBB CCCC DDDD', tags: ['xyz'] });
    const unrelated = [
      makePost({ id: 'c1', title: 'EEEE FFFF GGGG HHHH', tags: ['abc'] }),
      makePost({ id: 'c2', title: 'IIII JJJJ KKKK LLLL', tags: ['def'] }),
    ];
    const result = findSimilarPosts(source, unrelated);
    expect(result.length).toBe(0);
  });

  it('finds similar posts by shared tags', () => {
    const source = makePost({ id: 's1', title: 'Signal Digest Monday', tags: ['Signals', 'Daily Digest'] });
    const candidates = [
      makePost({ id: 'c1', title: 'Signal Digest Tuesday', tags: ['Signals', 'Daily Digest'] }),
      makePost({ id: 'c2', title: 'Something Unrelated', tags: ['Random'] }),
    ];
    const result = findSimilarPosts(source, candidates);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]!.matchTags).toContain('Signals');
    expect(result[0]!.score).toBeGreaterThan(0);
  });

  it('finds similar posts by title overlap', () => {
    const source = makePost({ id: 's1', title: 'Bitcoin Price Analysis Weekly', tags: ['bitcoin'] });
    const candidates = [
      makePost({ id: 'c1', title: 'Bitcoin Market Update Daily', tags: ['bitcoin', 'market'] }),
      makePost({ id: 'c2', title: 'Ethereum Gas Fee Analysis', tags: ['ethereum'] }),
    ];
    const result = findSimilarPosts(source, candidates);
    expect(result.length).toBeGreaterThanOrEqual(1);
    // Bitcoin post should rank higher
    expect(result[0]!.id).toBe('c1');
  });

  it('respects topN limit', () => {
    const source = makePost({ id: 's1', title: 'Trading', tags: ['trading'] });
    const candidates = Array.from({ length: 10 }, (_, i) =>
      makePost({ id: `c${i}`, title: 'Trading Strategy', tags: ['trading'] })
    );
    const result = findSimilarPosts(source, candidates, 3);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('scores exact match highest', () => {
    const post = makePost({ id: 'dup', title: 'Exact Same Title Here', tags: ['a', 'b'] });
    const source = makePost({ id: 's1', title: 'Exact Same Title Here', tags: ['a', 'b'] });
    const candidates = [
      post,
      makePost({ id: 'c2', title: 'Completely Different Words', tags: ['x'] }),
    ];
    const result = findSimilarPosts(source, candidates);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]!.id).toBe('dup');
    expect(result[0]!.score).toBeGreaterThan(0.5);
  });

  it('excludes source post from results', () => {
    const source = makePost({ id: 'source', title: 'Test Post', tags: ['test'] });
    const candidates = [
      makePost({ id: 'source', title: 'Test Post', tags: ['test'] }), // same ID
      makePost({ id: 'other', title: 'Test Post', tags: ['test'] }),
    ];
    const result = findSimilarPosts(source, candidates);
    expect(result.every(r => r.id !== 'source')).toBe(true);
  });

  it('handles empty tags', () => {
    const source = makePost({ id: 's1', title: 'Trading Signals Today', tags: [] });
    const candidates = [
      makePost({ id: 'c1', title: 'Trading Signals Today', tags: [] }),
      makePost({ id: 'c2', title: 'Unrelated Post', tags: [] }),
    ];
    const result = findSimilarPosts(source, candidates);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});
