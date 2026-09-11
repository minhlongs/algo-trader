/**
 * Migration SQL Dialect — Detection and query rewrites for Postgres and SQLite.
 */

export function getDialect(client: unknown): 'postgres' | 'sqlite' {
  if (client && typeof client === 'object' && 'constructor' in client) {
    const ctor = (client as { constructor: () => unknown }).constructor;
    if (ctor && typeof ctor.name === 'string' && ctor.name.includes('Client')) {
      return 'postgres';
    }
  }
  if (process.env.DB_HOST || process.env.DB_NAME) {
    return 'postgres';
  }
  return 'sqlite';
}

export function parseAndRewriteSql(rawSql: string, dialect: 'postgres' | 'sqlite'): string {
  let sql = rawSql;
  if (dialect === 'postgres') {
    // Replace SQLite strftime with Postgres equivalent
    sql = sql.replace(/strftime\(\s*['"]%s['"]\s*,\s*['"]now['"]\s*\)\s*\*\s*1000/g, "(EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) * 1000)::bigint");
    sql = sql.replace(/strftime\(\s*['"]%s['"]\s*,\s*['"]now['"]\s*\)/g, "EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::bigint");
    sql = sql.replace(/\bAUTOINCREMENT\b/gi, '');
  } else {
    // Replace PostgreSQL gen_random_uuid() with hex(randomblob())
    sql = sql.replace(/gen_random_uuid\(\)::text/gi, "(lower(hex(randomblob(16))))");
    sql = sql.replace(/gen_random_uuid\(\)/gi, "(lower(hex(randomblob(16))))");
    // Replace EXTRACT(EPOCH FROM NOW()) with strftime('%s','now')
    sql = sql.replace(/EXTRACT\(EPOCH FROM (?:NOW\(\)|CURRENT_TIMESTAMP)\)\s*\*\s*1000::bigint/gi, "(strftime('%s','now') * 1000)");
    sql = sql.replace(/EXTRACT\(EPOCH FROM (?:NOW\(\)|CURRENT_TIMESTAMP)\)::bigint\s*\*\s*1000/gi, "(strftime('%s','now') * 1000)");
    sql = sql.replace(/EXTRACT\(EPOCH FROM (?:NOW\(\)|CURRENT_TIMESTAMP)\)\s*\*\s*1000/gi, "(strftime('%s','now') * 1000)");
    sql = sql.replace(/EXTRACT\(EPOCH FROM (?:NOW\(\)|CURRENT_TIMESTAMP)\)/gi, "strftime('%s','now')");
    sql = sql.replace(/::bigint/gi, '');
    sql = sql.replace(/::text/gi, '');
    sql = sql.replace(/\bUUID\b/gi, 'TEXT');
    sql = sql.replace(/\bTIMESTAMPTZ\b/gi, 'TIMESTAMP');
    sql = sql.replace(/\bJSONB\b/gi, 'TEXT');
    sql = sql.replace(/\bTEXT\[\]\b/gi, 'TEXT');
    sql = sql.replace(/\bnow\(\)/gi, "CURRENT_TIMESTAMP");
    sql = sql.replace(/\(\(created_at\s+AT\s+TIME\s+ZONE\s+['"]UTC['"]\)::date\)/gi, "date(created_at)");
  }
  return sql;
}
