declare module 'pg-query-stream' {
  import { Readable } from 'stream';
  export default class QueryStream extends Readable {
    constructor(text: string, values?: unknown[], options?: Record<string, unknown>);
    text: string;
    values?: unknown[];
    cursor: number;
    rowCount: number;
  }
}
