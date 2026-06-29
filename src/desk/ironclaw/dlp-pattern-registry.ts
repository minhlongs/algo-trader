/**
 * DLP Pattern Registry
 * Loads DLP rules from D1 (or in-memory store for tests).
 * Caches for 60 s to avoid per-request DB round-trips.
 */

export type MatchType = 'regex' | 'substring';
export type DlpAction = 'allow' | 'redact' | 'block' | 'alert';
export type DlpScope = 'url' | 'header' | 'body' | 'any';

export interface DlpPattern {
  id: string;
  name: string;
  pattern: string;
  matchType: MatchType;
  action: DlpAction;
  scope: DlpScope;
  enabled: boolean;
}

/** Minimal D1-like interface so we can inject a stub in tests. */
export interface PatternStore {
  query(sql: string): Promise<{ results: RawRow[] }>;
}

interface RawRow {
  id: string;
  name: string;
  pattern: string;
  match_type: string;
  action: string;
  scope: string;
  enabled: number;
}

const CACHE_TTL_MS = 60_000;

export class DlpPatternRegistry {
  private cache: DlpPattern[] = [];
  private cacheExpiry = 0;

  constructor(private readonly store: PatternStore) {}

  async getPatterns(): Promise<DlpPattern[]> {
    if (Date.now() < this.cacheExpiry && this.cache.length > 0) {
      return this.cache;
    }
    const { results } = await this.store.query(
      "SELECT id, name, pattern, match_type, action, scope, enabled FROM dlp_patterns WHERE enabled = 1"
    );
    this.cache = results.map(rowToPattern);
    this.cacheExpiry = Date.now() + CACHE_TTL_MS;
    return this.cache;
  }

  /** Force refresh (e.g. after admin update). */
  invalidate(): void {
    this.cacheExpiry = 0;
  }

  /** Inject patterns directly (for tests / seed). */
  seed(patterns: DlpPattern[]): void {
    this.cache = patterns;
    this.cacheExpiry = Date.now() + CACHE_TTL_MS;
  }
}

function rowToPattern(r: RawRow): DlpPattern {
  return {
    id: r.id,
    name: r.name,
    pattern: r.pattern,
    matchType: r.match_type as MatchType,
    action: r.action as DlpAction,
    scope: r.scope as DlpScope,
    enabled: r.enabled === 1,
  };
}

/** Default patterns seeded in tests / local dev (mirrors 012 SQL seed). */
export const DEFAULT_PATTERNS: DlpPattern[] = [
  { id: 'p-sk',     name: 'OpenAI/Stripe secret key',  pattern: 'sk-[A-Za-z0-9_-]{20,}',   matchType: 'regex',     action: 'block',  scope: 'body',   enabled: true },
  { id: 'p-pk',     name: 'Public API key prefix',      pattern: 'pk-[A-Za-z0-9_-]{20,}',   matchType: 'regex',     action: 'redact', scope: 'body',   enabled: true },
  { id: 'p-eth',    name: 'Ethereum private key',       pattern: '0x[0-9a-fA-F]{64}',       matchType: 'regex',     action: 'block',  scope: 'body',   enabled: true },
  { id: 'p-email',  name: 'Email address PII',          pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}', matchType: 'regex', action: 'redact', scope: 'body', enabled: true },
  { id: 'p-bearer', name: 'Authorization Bearer token', pattern: 'Bearer [A-Za-z0-9._-]{20,}', matchType: 'regex',  action: 'redact', scope: 'header', enabled: true },
];
