// Unset all proxy environment variables to prevent http/https/superagent/fetch
// from routing requests through Cloudflare WARP SOCKS proxy (127.0.0.1:1080)
// or local proxy servers
delete process.env.HTTP_PROXY;
delete process.env.HTTPS_PROXY;
delete process.env.ALL_PROXY;
delete process.env.http_proxy;
delete process.env.https_proxy;
delete process.env.all_proxy;
process.env.NO_PROXY = '*';
process.env.no_proxy = '*';

// Supertest requests to ephemeral port servers
// When supertest passes an Express app instance, it calls `app.listen(0)` to spin up a server.
// In Node.js on macOS, this binds an IPv6 wildcard socket (`::`).
// Supertest's `serverAddress` then constructs the target URL as `http://127.0.0.1:${port}${path}` (IPv4 loopback).
// If a local process (e.g., IDE language_server, Hermes proxy) is listening on `127.0.0.1:${port}` in the 49152-65535 range,
// macOS routes the connection to the proxy instead of the Node.js test server, causing HTTP 400 Bad Request errors.
// We monkey-patch `Test.prototype.serverAddress` to route requests to `[::1]` (IPv6 loopback) if the server bound to `::`.
import Test from 'supertest/lib/test';
import type { Server as HttpServer, AddressInfo } from 'node:http';
import { Server } from 'tls';

interface TestInstance {
  _server?: HttpServer;
  serverAddress(app: HttpServer, path: string): string;
}

const testProto = Test.prototype as unknown as TestInstance;
testProto.serverAddress = function(this: TestInstance, app: HttpServer, path: string) {
  const addr = app.address() as AddressInfo | null;
  if (!addr) this._server = app.listen(0);
  const appAddr = app.address() as AddressInfo;
  const port = appAddr.port;
  const protocol = app instanceof Server ? 'https' : 'http';
  const host = (appAddr.address === '::' || appAddr.family === 'IPv6' || appAddr.family === 6)
    ? '[::1]'
    : '127.0.0.1';
  return `${protocol}://${host}:${port}${path}`;
};


