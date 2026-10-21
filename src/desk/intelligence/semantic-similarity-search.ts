/**
 * Semantic Similarity Search
 * Cosine similarity search across stored TF-IDF market embeddings.
 *
 * Used by: semantic-dependency-discovery to pre-filter markets for DeepSeek analysis.
 *
 * Algorithm: cosine(A,B) = dot(A,B) / (|A|*|B|)
 * Vectors stored normalized (unit length), so cosine = simple dot product.
 */

import { getAllEmbeddings, getEmbedding } from './vector-embedding-store';
import { logger } from '../../shared/utils/logger';
import { rankCandidates, scoreSpecificCandidates } from './semantic-similarity-scoring';

export interface SimilarMarket {
  marketId: string;
  /** Cosine similarity score in [0, 1] — higher = more similar */
  score: number;
}

/**
 * Find the top-K most semantically similar markets to a given market.
 *
 * Loads all embeddings from Redis, computes cosine similarity against
 * the query market's embedding, returns ranked results (excluding self).
 *
 * @param marketId - Target market to find neighbors for
 * @param topK     - Number of similar markets to return (default 5)
 * @returns Ranked array of {marketId, score}, highest score first
 */
export async function findSimilarMarkets(
  marketId: string,
  topK = 5,
): Promise<SimilarMarket[]> {
  const queryVec = await getEmbedding(marketId);
  if (!queryVec) {
    logger.warn('[SimilaritySearch] No embedding found for query market', { marketId });
    return [];
  }

  const allEmbeddings = await getAllEmbeddings();
  if (allEmbeddings.size === 0) {
    logger.warn('[SimilaritySearch] No embeddings in store — run generateAndStoreEmbeddings first');
    return [];
  }

  const topResults = rankCandidates(allEmbeddings, queryVec, marketId).slice(0, topK);

  logger.debug('[SimilaritySearch] Top matches', {
    queryMarketId: marketId,
    topK,
    results: topResults.map(r => `${r.marketId}:${r.score.toFixed(3)}`),
  });

  return topResults;
}

/**
 * Batch similarity lookup: find top-K neighbors for each of the given market IDs.
 * Returns a map of marketId → ranked similar markets.
 *
 * More efficient than calling findSimilarMarkets() repeatedly because
 * it loads all embeddings once, then scores against each query.
 */
export async function batchFindSimilarMarkets(
  marketIds: string[],
  topK = 5,
): Promise<Map<string, SimilarMarket[]>> {
  const allEmbeddings = await getAllEmbeddings();
  const resultMap = new Map<string, SimilarMarket[]>();

  if (allEmbeddings.size === 0) {
    logger.warn('[SimilaritySearch] No embeddings in store for batch lookup');
    for (const id of marketIds) resultMap.set(id, []);
    return resultMap;
  }

  for (const marketId of marketIds) {
    const queryVec = allEmbeddings.get(marketId);
    if (!queryVec) {
      logger.debug('[SimilaritySearch] No embedding for market in batch', { marketId });
      resultMap.set(marketId, []);
      continue;
    }
    resultMap.set(marketId, rankCandidates(allEmbeddings, queryVec, marketId).slice(0, topK));
  }

  logger.info(`[SimilaritySearch] Batch lookup complete`, {
    queried: marketIds.length,
    totalEmbeddings: allEmbeddings.size,
  });

  return resultMap;
}

/**
 * Filter a candidate list to only markets above a similarity threshold.
 * Useful for semantic dependency discovery to skip weakly-related markets.
 */
export async function filterBySimilarity(
  marketId: string,
  candidateIds: string[],
  minScore = 0.3,
): Promise<string[]> {
  const queryVec = await getEmbedding(marketId);
  if (!queryVec) return candidateIds; // can't filter without embedding — return all

  const allEmbeddings = await getAllEmbeddings();
  const scores = scoreSpecificCandidates(allEmbeddings, queryVec, candidateIds);

  // Ids with no usable embedding are kept, so absence of data never shrinks
  // the candidate set; ids with a score must clear the threshold.
  const filtered = candidateIds.filter((id) => {
    const score = scores.get(id);
    return score === undefined || score >= minScore;
  });

  logger.debug('[SimilaritySearch] filterBySimilarity', {
    marketId,
    input: candidateIds.length,
    output: filtered.length,
    minScore,
  });

  return filtered;
}
