/**
 * Semantic Similarity Scoring
 *
 * Pure vector math shared by the similarity search entry points: cosine
 * similarity on pre-normalized (unit) embeddings plus the candidate scan that
 * ranks a store against one query vector.
 *
 * Keeping these free of Redis/logger access makes the ranking behaviour testable
 * without an embedding store.
 */

import type { SimilarMarket } from './semantic-similarity-search';

/**
 * Cosine similarity between two equal-length numeric vectors.
 * Assumes pre-normalized (unit) vectors → result is just dot product.
 *
 * Clamps to [0,1]: floating point may yield tiny negatives on orthogonal vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return Math.max(0, Math.min(1, dot));
}

/**
 * Score every embedding in `candidates` against `queryVec`, skipping
 * `selfId` and any vector with a dimension mismatch.
 */
export function rankCandidates(
  candidates: Map<string, number[]>,
  queryVec: number[],
  selfId?: string,
): SimilarMarket[] {
  const results: SimilarMarket[] = [];
  for (const [candidateId, candidateVec] of candidates) {
    if (candidateId === selfId) continue; // skip self
    if (candidateVec.length !== queryVec.length) continue; // dimension mismatch
    results.push({ marketId: candidateId, score: cosineSimilarity(queryVec, candidateVec) });
  }
  return results.sort((a, b) => b.score - a.score);
}

/**
 * Score only the requested candidate ids against `queryVec`. Ids whose
 * embedding is missing or dimension-mismatched are absent from the result so
 * callers decide their own fallback policy.
 */
export function scoreSpecificCandidates(
  candidates: Map<string, number[]>,
  queryVec: number[],
  candidateIds: string[],
): Map<string, number> {
  const scores = new Map<string, number>();
  for (const candidateId of candidateIds) {
    const candidateVec = candidates.get(candidateId);
    if (!candidateVec || candidateVec.length !== queryVec.length) continue;
    scores.set(candidateId, cosineSimilarity(queryVec, candidateVec));
  }
  return scores;
}
