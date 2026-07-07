/**
 * PostgreSQL Client (desk layer)
 * Thin wrapper — mirrors the shared/db/postgres-client API.
 */

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
}

export interface PostgresClient {
  query<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<QueryResult<T>>;
  execute(sql: string, values?: unknown[]): Promise<QueryResult>;
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  isConnected(): boolean;
}

export function createPostgresClient(): PostgresClient {
  return {
    async query<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<QueryResult<T>> {
      return { rows: [], rowCount: 0 };
    },
    async execute(sql: string, values?: unknown[]): Promise<QueryResult> {
      return { rows: [], rowCount: 0 };
    },
    async beginTransaction(): Promise<void> {},
    async commit(): Promise<void> {},
    async rollback(): Promise<void> {},
    isConnected(): boolean {
      return false;
    },
  };
}

let _client: PostgresClient | null = null;

export function getPostgresClient(): PostgresClient {
  if (!_client) _client = createPostgresClient();
  return _client;
}

/** Named function export for consumers that destructure `{ query }` */
export async function query<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<QueryResult<T>> {
  return { rows: [] as T[], rowCount: 0 };
}
