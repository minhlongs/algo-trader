/**
 * Relationship Graph Builder Tests
 * Tests JSON parsing and relationship extraction from LLM responses
 */

import { describe, it, expect } from 'vitest';
import { extractJsonArray, parseRelationship, buildDependencyGraph } from '../../../../src/desk/intelligence/relationship-graph-builder';

describe('Relationship Graph Builder', () => {
  describe('extractJsonArray', () => {
    it('should parse plain JSON array', () => {
      const input = `[
        {"marketA": "m1", "marketB": "m2", "type": "CAUSAL", "confidence": 0.8, "reasoning": "direct link"}
      ]`;

      const result = extractJsonArray(input);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
    });

    it('should extract array from markdown code fences', () => {
      const input = `\`\`\`json
        [{"marketA": "m1", "marketB": "m2", "type": "CAUSAL", "confidence": 0.8, "reasoning": "link"}]
      \`\`\``;

      const result = extractJsonArray(input);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
    });

    it('should extract from code fences without json lang tag', () => {
      const input = `\`\`\`
        [{"marketA": "m1", "marketB": "m2", "type": "CAUSAL", "confidence": 0.8, "reasoning": "link"}]
      \`\`\``;

      const result = extractJsonArray(input);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
    });

    it('should unwrap relationships object', () => {
      const input = `{"relationships": [{"marketA": "m1", "marketB": "m2", "type": "CAUSAL", "confidence": 0.8, "reasoning": "link"}]}`;

      const result = extractJsonArray(input);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
    });

    it('should handle multiple relationships', () => {
      const input = `[
        {"marketA": "m1", "marketB": "m2", "type": "CAUSAL", "confidence": 0.8, "reasoning": "a"},
        {"marketA": "m2", "marketB": "m3", "type": "CORRELATED", "confidence": 0.7, "reasoning": "b"},
        {"marketA": "m1", "marketB": "m3", "type": "MUTUAL_EXCLUSION", "confidence": 0.9, "reasoning": "c"}
      ]`;

      const result = extractJsonArray(input);

      expect(result.length).toBe(3);
    });

    it('should return empty array for invalid JSON', () => {
      const input = 'not json at all';

      const result = extractJsonArray(input);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('should handle mixed content with code fences', () => {
      const input = `
        Here are the market relationships:
        \`\`\`json
        [
          {"marketA": "trump", "marketB": "harris", "type": "MUTUAL_EXCLUSION", "confidence": 0.95, "reasoning": "exclusive outcomes"}
        ]
        \`\`\`
        These are the only relationships found.
      `;

      const result = extractJsonArray(input);

      expect(result.length).toBe(1);
      expect((result[0] as Record<string, unknown>).marketA).toBe('trump');
    });

    it('should handle whitespace variations', () => {
      const input = `[
  {
    "marketA"  :  "m1"  ,
    "marketB"  :  "m2"  ,
    "type"     :  "CAUSAL"  ,
    "confidence"  :  0.8  ,
    "reasoning"  :  "link"
  }
]`;

      const result = extractJsonArray(input);

      expect(result.length).toBe(1);
    });

    it('should extract from first valid JSON array', () => {
      const input = `Some text [invalid json here

      [{"marketA": "m1", "marketB": "m2", "type": "CAUSAL", "confidence": 0.8, "reasoning": "link"}]

      more text`;

      const result = extractJsonArray(input);

      expect(Array.isArray(result)).toBe(true);
    });

    it('should extract array from markdown code fences', () => {
      const input = `\`\`\`json
        [{"marketA": "m1", "marketB": "m2", "type": "CAUSAL", "confidence": 0.8, "reasoning": "link"}]
      \`\`\``;

      const result = extractJsonArray(input);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
    });

    it('should handle nested code fences', () => {
      const input = `\`\`\`json
[{"marketA": "m1", "marketB": "m2", "type": "CAUSAL", "confidence": 0.8, "reasoning": "{\\"nested\\": \\"json\\"}"}]
\`\`\``;

      const result = extractJsonArray(input);

      expect(result.length).toBe(1);
    });
  });

  // ── parseRelationship ────────────────────────────────────────────────────

  describe('parseRelationship', () => {
    const valid = {
      marketA: 'm1',
      marketB: 'm2',
      type: 'CAUSAL',
      confidence: 0.8,
      reasoning: 'direct link',
    };

    it('parses a valid relationship', () => {
      const rel = parseRelationship(valid);
      expect(rel).toEqual(valid);
    });

    it('rejects when marketA is not a string', () => {
      expect(parseRelationship({ ...valid, marketA: 42 })).toBeNull();
    });

    it('rejects when marketB is not a string', () => {
      expect(parseRelationship({ ...valid, marketB: null })).toBeNull();
    });

    it('rejects when type is not a string', () => {
      expect(parseRelationship({ ...valid, type: 123 })).toBeNull();
    });

    it('rejects when type is not a valid RelationType', () => {
      expect(parseRelationship({ ...valid, type: 'UNKNOWN' })).toBeNull();
    });

    it('accepts all valid RelationType values', () => {
      for (const t of ['CAUSAL', 'MUTUAL_EXCLUSION', 'CONDITIONAL', 'CORRELATED']) {
        expect(parseRelationship({ ...valid, type: t })).not.toBeNull();
      }
    });

    it('rejects when confidence is not a number', () => {
      expect(parseRelationship({ ...valid, confidence: '0.8' })).toBeNull();
    });

    it('rejects when confidence is below MIN_CONFIDENCE (0.5)', () => {
      expect(parseRelationship({ ...valid, confidence: 0.49 })).toBeNull();
    });

    it('accepts confidence at the MIN_CONFIDENCE boundary', () => {
      expect(parseRelationship({ ...valid, confidence: 0.5 })).not.toBeNull();
    });

    it('rejects when confidence exceeds 1', () => {
      expect(parseRelationship({ ...valid, confidence: 1.01 })).toBeNull();
    });

    it('accepts confidence at the upper boundary', () => {
      expect(parseRelationship({ ...valid, confidence: 1 })).not.toBeNull();
    });

    it('rejects when reasoning is not a string', () => {
      expect(parseRelationship({ ...valid, reasoning: undefined })).toBeNull();
    });
  });

  // ── buildDependencyGraph ─────────────────────────────────────────────────

  describe('buildDependencyGraph', () => {
    const rel = (overrides: Record<string, unknown> = {}) => ({
      marketA: 'm1',
      marketB: 'm2',
      type: 'CAUSAL',
      confidence: 0.8,
      reasoning: 'link',
      ...overrides,
    });

    it('returns empty graph for no batch results', () => {
      const graph = buildDependencyGraph([], 5);
      expect(graph.relationships).toEqual([]);
      expect(graph.marketCount).toBe(5);
      expect(typeof graph.updatedAt).toBe('number');
    });

    it('builds graph from a single valid batch', () => {
      const batch = JSON.stringify([rel()]);
      const graph = buildDependencyGraph([batch], 3);
      expect(graph.relationships).toHaveLength(1);
      expect(graph.relationships[0].marketA).toBe('m1');
    });

    it('builds graph from multiple batches', () => {
      const batch1 = JSON.stringify([rel()]);
      const batch2 = JSON.stringify([rel({ marketA: 'm2', marketB: 'm3' })]);
      const graph = buildDependencyGraph([batch1, batch2], 4);
      expect(graph.relationships).toHaveLength(2);
    });

    it('deduplicates by (marketA, marketB, type) keeping highest confidence', () => {
      const batch1 = JSON.stringify([rel({ confidence: 0.7 })]);
      const batch2 = JSON.stringify([rel({ confidence: 0.9 })]);
      const graph = buildDependencyGraph([batch1, batch2], 3);
      expect(graph.relationships).toHaveLength(1);
      expect(graph.relationships[0].confidence).toBe(0.9);
    });

    it('keeps lower-confidence duplicate when it is the only one', () => {
      const batch = JSON.stringify([rel({ confidence: 0.6 })]);
      const graph = buildDependencyGraph([batch], 3);
      expect(graph.relationships).toHaveLength(1);
    });

    it('filters out low-confidence relationships below threshold', () => {
      const batch = JSON.stringify([
        rel({ confidence: 0.4 }),
        rel({ marketA: 'm3', marketB: 'm4', confidence: 0.9 }),
      ]);
      const graph = buildDependencyGraph([batch], 5);
      expect(graph.relationships).toHaveLength(1);
      expect(graph.relationships[0].marketA).toBe('m3');
    });

    it('filters out relationships with invalid fields', () => {
      const batch = JSON.stringify([
        rel({ type: 'BOGUS' }),
        rel({ marketA: 'm3', marketB: 'm4' }),
      ]);
      const graph = buildDependencyGraph([batch], 5);
      expect(graph.relationships).toHaveLength(1);
    });

    it('extracts relationships from wrapped object form', () => {
      const batch = JSON.stringify({ relationships: [rel()] });
      const graph = buildDependencyGraph([batch], 3);
      expect(graph.relationships).toHaveLength(1);
    });

    it('extracts relationships from markdown code fences', () => {
      const batch = `\`\`\`json\n${JSON.stringify([rel()])}\n\`\`\``;
      const graph = buildDependencyGraph([batch], 3);
      expect(graph.relationships).toHaveLength(1);
    });

    it('extracts relationships from bare array in text', () => {
      const batch = `Here is the data: ${JSON.stringify([rel()])} end`;
      const graph = buildDependencyGraph([batch], 3);
      expect(graph.relationships).toHaveLength(1);
    });

    it('handles batch that throws during extraction', () => {
      // JSON.parse of a non-string will throw inside extractJsonArray
      const batch = JSON.stringify(null) + 'x'.repeat(1000);
      const graph = buildDependencyGraph([batch], 3);
      expect(graph.relationships).toEqual([]);
    });

    it('passes through totalMarkets as marketCount', () => {
      const graph = buildDependencyGraph([], 42);
      expect(graph.marketCount).toBe(42);
    });

    it('sets updatedAt to a numeric timestamp', () => {
      const before = Date.now();
      const graph = buildDependencyGraph([], 1);
      const after = Date.now();
      expect(graph.updatedAt).toBeGreaterThanOrEqual(before);
      expect(graph.updatedAt).toBeLessThanOrEqual(after);
    });
  });

});

