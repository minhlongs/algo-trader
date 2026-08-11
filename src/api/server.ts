/**
 * API Server — Express app wiring all route routers.
 *
 * Mount map:
 * /api/v1/signals → signalFeedRouter
 * /api/mcp → mcpRouter
 * /health → health check
 */

import express from 'express';
import { Server as HttpServer } from 'http';
import { signalFeedRouter } from './routes/signal-feed-routes';
import { mcpRouter } from './routes/mcp-routes';
import { personalizationRouter } from './routes/personalization-routes';
import { logger } from '../shared/utils/logger';
import * as zlib from 'zlib';

/** Supported compression algorithms in preference order */
const COMPRESSION_ALGORITHMS: expressCompressionAlgorithm[] = ['br', 'gzip', 'deflate'];

type expressCompressionAlgorithm = 'br' | 'gzip' | 'deflate';

const MIN_RESPONSE_BYTES = 512;
const COMPRESSIBLE_CONTENT_TYPES = [
  'application/json',
  'application/json;',
  'text/',
  'application/javascript',
  'application/xml',
];

/** Negotiate best algorithm from Accept-Encoding header */
function negotiateAlgorithm(acceptEncoding: string): expressCompressionAlgorithm | null {
  const accepted = acceptEncoding.toLowerCase().split(',').map((s) => s.trim().split(';')[0]);
  for (const algo of COMPRESSION_ALGORITHMS) {
    if (accepted.includes(algo)) return algo;
  }
  return null;
}

/** Wrap res.json / res.send to compress output transparently */
function compressionMiddleware() {
  return (_req: express.Request, res: express.Response, next: express.NextFunction): void => {
    const algorithm = negotiateAlgorithm(_req.headers['accept-encoding'] || '');
    if (!algorithm) return next();

    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    res.json = (body: unknown): express.Response => {
      const bodyStr = JSON.stringify(body);
      if (bodyStr.length < MIN_RESPONSE_BYTES) return originalJson(body);
      res.setHeader('Content-Encoding', algorithm);
      res.setHeader('Vary', 'Accept-Encoding');
      return originalSend(compressString(bodyStr, algorithm));
    };

    res.send = (body: unknown): express.Response => {
      if (typeof body !== 'string') return originalSend(body);
      if (body.length < MIN_RESPONSE_BYTES) return originalSend(body);
      const contentType = res.get('Content-Type') || '';
      if (!COMPRESSIBLE_CONTENT_TYPES.some((ct) => contentType.startsWith(ct))) return originalSend(body);
      res.setHeader('Content-Encoding', algorithm);
      res.setHeader('Vary', 'Accept-Encoding');
      return originalSend(compressString(body, algorithm));
    };

    next();
  };
}

/** Sync compress using Node's built-in zlib — safe inside Express middleware */
function compressString(data: string, algorithm: expressCompressionAlgorithm): string {
  try {
    const input = Buffer.from(data, 'utf-8');
    let compressed: Buffer;
    if (algorithm === 'br') {
      compressed = zlib.brotliCompressSync(input, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } });
    } else if (algorithm === 'gzip') {
      compressed = zlib.gzipSync(input, { level: 4 });
    } else {
      compressed = zlib.deflateSync(input, { level: 4 });
    }
    // Base64 so Express text pipeline doesn't interpret binary as UTF-8
    return compressed.toString('base64');
  } catch {
    return data;
  }
}

export class ApiServer {
  private app: express.Application;
  private server: HttpServer | null = null;

  constructor() {
    this.app = express();
    this.app.use(express.json());
    this.app.use(compressionMiddleware());

    this.app.use('/api/v1/signals', signalFeedRouter);
    this.app.use('/api/mcp', mcpRouter);
    this.app.use('/api/personalization', personalizationRouter);

    // Health check
    this.app.get('/health', (_req: express.Request, res: express.Response) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });
  }

  async start(): Promise<void> {
    const port = parseInt(process.env.API_PORT || '3000', 10);
    this.server = this.app.listen(port, () => {
      logger.info(`[Server] API listening on :${port}`);
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
      this.server = null;
    }
  }
}
