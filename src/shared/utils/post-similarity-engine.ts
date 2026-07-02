/**
 * Post Similarity Engine — Simple TF-IDF-based recommendation.
 * Computes similarity scores between blog posts using tag + title overlap.
 * Zero external API dependency — pure TypeScript.
 */

export interface SimilarityInput {
  id: string;
  title: string;
  tags: string[];
}

export interface ScoredRecommendation {
  id: string;
  score: number;       // 0–1, higher = more similar
  matchTags: string[]; // shared tags
}

interface TokenFreq { [token: string]: number }

const STOP_WORDS = new Set([
  'the','a','an','is','are','was','were','be','been','being',
  'have','has','had','do','does','did','will','would','shall','should',
  'may','might','must','can','could','of','in','to','for','with','on',
  'at','by','from','and','or','not','no','but','if','so','that','this',
  'it','its','we','you','he','she','they','i','me','my','our','your',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t));
}

/** Compute term frequencies for a document */
function tf(tokens: string[]): TokenFreq {
  const freq: TokenFreq = {};
  for (const t of tokens) {
    freq[t] = (freq[t] || 0) + 1;
  }
  const len = tokens.length || 1;
  for (const k of Object.keys(freq)) {
    freq[k] /= len;
  }
  return freq;
}

/** Cosine similarity between two TF vectors */
function cosineSimilarity(a: TokenFreq, b: TokenFreq): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (const [term, weight] of Object.entries(a)) {
    dot += weight * (b[term] || 0);
    magA += weight * weight;
  }
  for (const weight of Object.values(b)) {
    magB += weight * weight;
  }

  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/**
 * Find similar posts to a source post.
 * @param source — the post to find recommendations for
 * @param candidates — all other posts (excluding source)
 * @param topN — max recommendations to return (default 5)
 * @param minScore — minimum similarity threshold (default 0.05)
 */
export function findSimilarPosts(
  source: SimilarityInput,
  candidates: SimilarityInput[],
  topN = 5,
  minScore = 0.05,
): ScoredRecommendation[] {
  const sourceTokens = tokenize(source.title);
  const sourceTags = new Set(source.tags.map(t => t.toLowerCase()));

  const scored = candidates
    .filter(c => c.id !== source.id)
    .map(c => {
      const candTokens = tokenize(c.title);
      const titleSim = cosineSimilarity(tf(sourceTokens), tf(candTokens));

      // Tag overlap bonus: each shared tag adds 0.15
      const matchTags = c.tags.filter(t => sourceTags.has(t.toLowerCase()));
      const tagBonus = matchTags.length * 0.15;

      // Combined score: title similarity (weight 0.6) + tag bonus (weight 0.4)
      const score = Math.min(1, titleSim * 0.6 + Math.min(tagBonus, 0.4));

      return { id: c.id, score, matchTags } as ScoredRecommendation;
    })
    .filter(r => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  return scored;
}
