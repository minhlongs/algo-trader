/**
 * HTTP/2 Benchmark — Simple HTTP/2 Adapter
 *
 * Adapter issuing requests through either the HTTP/2 connection pool or a
 * direct (unpooled) mock session. Extracted from bench-http2.ts.
 */

import { Http2ConnectionPool } from './http2-connection-pool';
import { MockHttp2Session, MockResponseHeaders } from './bench-http2-mock';

export class SimpleHttp2Adapter {
  private readonly baseUrl: string;
  private readonly http2Pool: Http2ConnectionPool | null;
  private readonly usePool: boolean;

  constructor(baseUrl: string, usePool: boolean, pool?: Http2ConnectionPool) {
    this.baseUrl = baseUrl;
    this.usePool = usePool;
    this.http2Pool = pool || null;
  }

  async request(): Promise<void> {
    const url = `${this.baseUrl}/test`;

    if (this.usePool && this.http2Pool) {
      const session = await this.http2Pool.getSession(url);
      try {
        await this.makeRequest(session as unknown as MockHttp2Session);
      } finally {
        this.http2Pool.releaseSession(url, session);
      }
    } else {
      const session = await this.createDirectSession(url);
      try {
        await this.makeRequest(session);
      } finally {
        session.close();
      }
    }
  }

  private async makeRequest(session: MockHttp2Session): Promise<void> {
    return new Promise((resolve, reject) => {
      const reqStream = session.request({
        ':method': 'GET',
        ':path': '/test',
      });

      let data = '';

      reqStream.on('response', (headers: MockResponseHeaders) => {
        const status = headers[':status'] as number;
        if (status < 200 || status >= 300) {
          reject(new Error(`HTTP ${status}`));
          return;
        }
      });

      reqStream.on('data', (chunk: Buffer) => {
        data += chunk.toString();
      });

      reqStream.on('end', () => {
        try {
          JSON.parse(data);
          resolve();
        } catch (err) {
          reject(err);
        }
      });

      reqStream.on('error', reject);
      reqStream.end();
    });
  }

  private async createDirectSession(url: string): Promise<MockHttp2Session> {
    const origin = this.extractOrigin(url);
    return new MockHttp2Session(origin);
  }

  private extractOrigin(url: string): string {
    const urlObj = new URL(url);
    const port = urlObj.port || (urlObj.protocol === 'https:' ? '443' : '80');
    return `${urlObj.protocol}//${urlObj.hostname}:${port}`;
  }
}
