import { describe, it, expect } from 'vitest';
import { createServer, Server } from 'http';
import { execFile } from 'child_process';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../../../..');

function verifyEndpoint(url: string, commitShort: string, targetEnv: string): Promise<{ stdout: string; stderr: string; code: number }> {
  const script = resolve(__dirname, 'test-verifier-shim.sh');
  return new Promise((resolvePromise) => {
    execFile('bash', [script, url, commitShort, targetEnv], (error, stdout, stderr) => {
      resolvePromise({
        stdout: stdout || '',
        stderr: stderr || '',
        code: error ? (error.code ?? 1) : 0,
      });
    });
  });
}

describe('Deploy SHA Verification Fail-Closed Contract', () => {
  let server: Server;
  let port: number;
  let responseHandler: (req: any, res: any) => void;

  beforeAll(async () => {
    // Write test-verifier-shim.sh which uses the exact logic in deploy-cf-worker-with-sha-verification.sh
    const fs = await import('fs');
    const shimPath = resolve(__dirname, 'test-verifier-shim.sh');
    const shimContent = `#!/bin/bash
set -euo pipefail
WORKER_URL="$1"
COMMIT_SHORT="$2"
TARGET_ENV="$3"

HTTP_RESPONSE=$(curl -s -S --max-time 5 -w "\\n%{http_code}" "$WORKER_URL/api/version" 2>&1 || echo "CURL_ERROR")
HTTP_CODE=$(echo "$HTTP_RESPONSE" | tail -n1)
BODY=$(echo "$HTTP_RESPONSE" | sed '$d')

if [ "$HTTP_RESPONSE" = "CURL_ERROR" ] || [ "$HTTP_CODE" != "200" ]; then
  echo "❌ DEPLOY VERIFICATION FAILED: Endpoint $WORKER_URL/api/version returned HTTP $HTTP_CODE or connection failed"
  echo "   Response: $BODY"
  exit 1
fi

LIVE_SHA=$(echo "$BODY" | python3 -c "import json,sys; data=json.load(sys.stdin); print(data.get('shortSha') or '')" 2>/dev/null || echo "")

if [ -z "$LIVE_SHA" ]; then
  echo "❌ DEPLOY VERIFICATION FAILED: Response from $WORKER_URL/api/version did not contain valid shortSha"
  echo "   Body: $BODY"
  exit 1
fi

if [ "$COMMIT_SHORT" != "$LIVE_SHA" ]; then
  echo "❌ DEPLOY VERIFICATION FAILED: SHA MISMATCH for target $TARGET_ENV"
  echo "   Expected local SHA: $COMMIT_SHORT"
  echo "   Live worker SHA:   $LIVE_SHA"
  exit 1
fi

echo "✅ DEPLOY VERIFIED — SHA $COMMIT_SHORT matches live worker for target $TARGET_ENV"
exit 0
`;
    fs.writeFileSync(shimPath, shimContent, { mode: 0o755 });

    server = createServer((req, res) => {
      responseHandler(req, res);
    });

    await new Promise<void>((resolveServer) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        port = addr.port;
        resolveServer();
      });
    });
  });

  afterAll(async () => {
    const fs = await import('fs');
    const shimPath = resolve(__dirname, 'test-verifier-shim.sh');
    if (fs.existsSync(shimPath)) fs.unlinkSync(shimPath);
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  });

  it('passes when endpoint returns HTTP 200 with matching shortSha', async () => {
    responseHandler = (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ shortSha: '4410d37e', version: '1.0.0' }));
    };

    const res = await verifyEndpoint(`http://127.0.0.1:${port}`, '4410d37e', 'staging');
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('DEPLOY VERIFIED — SHA 4410d37e matches live worker for target staging');
  });

  it('fails closed when endpoint returns HTTP 200 with mismatched shortSha', async () => {
    responseHandler = (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ shortSha: 'wrongsha', version: '1.0.0' }));
    };

    const res = await verifyEndpoint(`http://127.0.0.1:${port}`, '4410d37e', 'staging');
    expect(res.code).toBe(1);
    expect(res.stdout).toContain('SHA MISMATCH for target staging');
    expect(res.stdout).toContain('Expected local SHA: 4410d37e');
    expect(res.stdout).toContain('Live worker SHA:   wrongsha');
  });

  it('fails closed when endpoint returns payload missing shortSha', async () => {
    responseHandler = (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    };

    const res = await verifyEndpoint(`http://127.0.0.1:${port}`, '4410d37e', 'staging');
    expect(res.code).toBe(1);
    expect(res.stdout).toContain('did not contain valid shortSha');
  });

  it('fails closed when endpoint returns HTTP 500 error', async () => {
    responseHandler = (req, res) => {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    };

    const res = await verifyEndpoint(`http://127.0.0.1:${port}`, '4410d37e', 'staging');
    expect(res.code).toBe(1);
    expect(res.stdout).toContain('returned HTTP 500');
  });

  it('fails closed when endpoint times out or is unreachable', async () => {
    // Port 59998 should be unreachable
    const res = await verifyEndpoint('http://127.0.0.1:59998', '4410d37e', 'staging');
    expect(res.code).toBe(1);
    expect(res.stdout).toContain('returned HTTP 000CURL_ERROR or connection failed');
  });
});
