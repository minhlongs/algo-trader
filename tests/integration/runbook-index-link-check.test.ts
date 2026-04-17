/**
 * Runbook Index Link Checker.
 *
 * docs/runbooks/README.md (PR #129) maps alert UIDs → runbook .md files.
 * If a runbook is renamed or removed without updating the index, operators
 * hit a 404 during an incident. This test asserts every relative .md link
 * in the index resolves to an actual file under docs/runbooks/.
 *
 * Non-goals: external URL probing, anchor validation, markdown lint.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'fs';
import { resolve, dirname, join } from 'path';

const INDEX_PATH = resolve(__dirname, '../../docs/runbooks/README.md');
const INDEX_DIR = dirname(INDEX_PATH);

const indexContent = readFileSync(INDEX_PATH, 'utf8');

/**
 * Extract relative markdown file references: [text](file.md) or [text](./file.md).
 * Ignores http(s) URLs, anchor-only links (#section), and mailto.
 */
function extractLocalMarkdownLinks(md: string): Array<{ text: string; path: string }> {
  const links: Array<{ text: string; path: string }> = [];
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = linkRegex.exec(md)) !== null) {
    const [, text, href] = m;
    // Skip external + anchor-only
    if (/^(https?:|mailto:|#)/.test(href)) continue;
    // Only care about .md files
    if (!href.endsWith('.md') && !href.includes('.md#')) continue;
    // Strip any #anchor suffix
    const cleanPath = href.split('#')[0];
    links.push({ text, path: cleanPath });
  }
  return links;
}

describe('docs/runbooks/README.md — link integrity', () => {
  const links = extractLocalMarkdownLinks(indexContent);

  it('index extracts at least 5 local .md links (sanity)', () => {
    expect(
      links.length,
      'regex found 0 local markdown links — parser may be stale'
    ).toBeGreaterThanOrEqual(5);
  });

  it('every local .md link resolves to an actual file', () => {
    const missing: string[] = [];
    for (const link of links) {
      const absolutePath = resolve(INDEX_DIR, link.path);
      if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
        missing.push(`[${link.text}](${link.path})`);
      }
    }
    expect(
      missing,
      `runbook index has ${missing.length} broken link(s): ${missing.join(', ')}`
    ).toEqual([]);
  });

  it('includes all 7 canonical runbook files by filename', () => {
    const expectedRunbooks = [
      'algo-trader-deadman.md',
      'qwen-drawdown-breach.md',
      'qwen-drawdown-monitor-stale.md',
      'qwen-paper-gate.md',
      'qwen-signals-loop-error.md',
      'qwen-signals-loop-stale.md',
      'qwen-strategy-review-backlog.md',
    ];
    for (const filename of expectedRunbooks) {
      const abs = join(INDEX_DIR, filename);
      expect(existsSync(abs), `missing canonical runbook: ${filename}`).toBe(true);
      const mentioned = links.some((l) => l.path.endsWith(filename));
      expect(mentioned, `runbook ${filename} exists but not linked from README.md`).toBe(true);
    }
  });
});
