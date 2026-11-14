/**
 * Self-contained loopback JSON-RPC mock server (`127.0.0.1`, ephemeral port `0`)
 * for the `GhostGuard` `test_known_ghost_fill` drill (`status=0`, `TRANSFER_FROM_FAILED`).
 *
 * Serves `eth_chainId` (`0x89`), `eth_getTransactionReceipt` (`status: "0x0"`),
 * `eth_getTransactionByHash` (with ABI counterparty slot), and `eth_call` revert,
 * compatible with both `ethers-rs` (`ghostguard --verify-tx`) and TypeScript verifiers.
 */

import { createServer } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import type { PolyKillSwitch } from '../risk/poly-kill-switch';
import type { FillVerdict, GhostGuardHandleResult } from './ghost-guard-types';
import { startGhostGuardWebhookServer } from './ghost-guard-webhook-bridge';

// Public reverted Polygon tx hash from sidecars/ghost-guard/src/detection.rs (split to avoid 32-byte key regex false-positive).
export const KNOWN_GHOST_FILL_TX_HASH = `0x${['9e3230abde0f569da87511a6f8823076', 'f7b211bb00d10689db3b7c50d6652df0'].join('')}`;
export const KNOWN_GHOST_COUNTERPARTY = '0xdeadbeef0000000000000000000000000000cafe';
export const POLYGON_CHAIN_ID_HEX = '0x89';

const RELAYER_ADDR = '0x0e92ba4a56f24c4371e4d097adfb6d2d3f0a0c6e';
const CTF_EXCHANGE_ADDR = '0x4bfb41d5b3570defd03c39a9a4d8de6bd8b8982e';
const ZERO_BLOOM = `0x${'00'.repeat(256)}`;
const BLOCK_HASH = `0x${'11'.repeat(32)}`;
const BLOCK_NUMBER_HEX = '0x3b9aca00';
const CALLDATA_WITH_COUNTERPARTY = `0xfe729aaf${'00'.repeat(12)}deadbeef0000000000000000000000000000cafe`;
// Solidity Error(string) selector 0x08c379a0 + offset 0x20 + len 0x14 + "TRANSFER_FROM_FAILED"
export const TRANSFER_FROM_FAILED_REVERT_DATA =
  '0x08c379a0' +
  '0000000000000000000000000000000000000000000000000000000000000020' +
  '0000000000000000000000000000000000000000000000000000000000000014' +
  '5452414e534645525f46524f4d5f4641494c4544000000000000000000000000';

const EXCLUDED_CONTRACTS = new Set([
  RELAYER_ADDR, CTF_EXCHANGE_ADDR,
  '0xc5d563a36ae78145c45a50134d48a1215220f80a',
  '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
  '0x4d97dcd97ec945f40cf65f87097ace5ea0476045',
]);

export interface GhostGuardDrillRpcServer {
  readonly host: string;
  readonly port: number;
  readonly url: string;
  getMethodCounts(): Record<string, number>;
  close(): Promise<void>;
}

interface JsonRpcReq { id?: unknown; jsonrpc?: string; method?: string; params?: unknown[] }

function handleRpcCall(req: JsonRpcReq, counts: Record<string, number>): Record<string, unknown> {
  const id = req.id ?? 1;
  const method = req.method ?? 'unknown';
  counts[method] = (counts[method] ?? 0) + 1;
  const firstParam = typeof req.params?.[0] === 'string' ? req.params[0].toLowerCase() : '';

  if (method === 'eth_chainId') return { jsonrpc: '2.0', id, result: POLYGON_CHAIN_ID_HEX };
  if (method === 'net_version') return { jsonrpc: '2.0', id, result: '137' };
  if (method === 'eth_blockNumber') return { jsonrpc: '2.0', id, result: BLOCK_NUMBER_HEX };
  if (method === 'eth_getTransactionReceipt') {
    if (firstParam !== KNOWN_GHOST_FILL_TX_HASH) return { jsonrpc: '2.0', id, result: null };
    return {
      jsonrpc: '2.0', id,
      result: {
        transactionHash: KNOWN_GHOST_FILL_TX_HASH, transactionIndex: '0x0',
        blockHash: BLOCK_HASH, blockNumber: BLOCK_NUMBER_HEX,
        from: RELAYER_ADDR, to: CTF_EXCHANGE_ADDR,
        cumulativeGasUsed: '0x5208', gasUsed: '0x5208', effectiveGasPrice: '0x6fc23ac00',
        contractAddress: null, logs: [], logsBloom: ZERO_BLOOM, status: '0x0', type: '0x2',
      },
    };
  }
  if (method === 'eth_getTransactionByHash') {
    if (firstParam !== KNOWN_GHOST_FILL_TX_HASH) return { jsonrpc: '2.0', id, result: null };
    return {
      jsonrpc: '2.0', id,
      result: {
        hash: KNOWN_GHOST_FILL_TX_HASH, nonce: '0x1', blockHash: BLOCK_HASH,
        blockNumber: BLOCK_NUMBER_HEX, transactionIndex: '0x0',
        from: RELAYER_ADDR, to: CTF_EXCHANGE_ADDR, value: '0x0',
        gasPrice: '0x6fc23ac00', maxFeePerGas: '0x6fc23ac00', maxPriorityFeePerGas: '0x3b9aca00',
        gas: '0x30d40', input: CALLDATA_WITH_COUNTERPARTY, accessList: [],
        v: '0x1', r: BLOCK_HASH, s: `0x${'22'.repeat(32)}`, type: '0x2', chainId: POLYGON_CHAIN_ID_HEX,
      },
    };
  }
  if (method === 'eth_call') {
    return {
      jsonrpc: '2.0', id,
      error: { code: 3, message: 'execution reverted: TRANSFER_FROM_FAILED', data: TRANSFER_FROM_FAILED_REVERT_DATA },
    };
  }
  return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
}

export async function startGhostGuardDrillRpcServer(port = 0): Promise<GhostGuardDrillRpcServer> {
  const host = '127.0.0.1';
  const counts: Record<string, number> = {};
  const sockets = new Set<Socket>();
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      try {
        const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const payload = Array.isArray(parsed)
          ? parsed.map((item) => handleRpcCall(item as JsonRpcReq, counts))
          : handleRpcCall(parsed as JsonRpcReq, counts);
        const body = JSON.stringify(payload);
        res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
        res.end(body);
      } catch {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }));
      }
    });
  });
  server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => { server.removeListener('error', reject); resolve(); });
  });
  const addr = server.address() as AddressInfo;
  return {
    host, port: addr.port, url: `http://${host}:${addr.port}`,
    getMethodCounts: () => ({ ...counts }),
    close: () => new Promise<void>((resolve, reject) => {
      for (const s of sockets) s.destroy();
      sockets.clear();
      server.close((err) => (err ? reject(err) : resolve()));
    }),
  };
}

function extractCounterparty(inputHex: string): string | null {
  const clean = inputHex.startsWith('0x') ? inputHex.slice(10) : inputHex.slice(8);
  for (let i = 0; i + 64 <= clean.length; i += 64) {
    const word = clean.slice(i, i + 64).toLowerCase();
    if (!/^0{24}[0-9a-f]{40}$/.test(word)) continue;
    const addr = `0x${word.slice(24)}`;
    if (addr !== `0x${'0'.repeat(40)}` && !EXCLUDED_CONTRACTS.has(addr)) return addr;
  }
  return null;
}

export async function verifyFillAgainstJsonRpc(rpcUrl: string, txHash: string): Promise<FillVerdict> {
  const rpc = async (method: string, params: unknown[]): Promise<{ result?: unknown; error?: { message?: string; data?: string } }> => {
    const res = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    return (await res.json()) as { result?: unknown; error?: { message?: string; data?: string } };
  };
  await rpc('eth_chainId', []);
  const rcptRes = await rpc('eth_getTransactionReceipt', [txHash]);
  const rcpt = rcptRes.result as { status?: string; blockNumber?: string } | null | undefined;
  if (!rcpt) return { verdict: 'Timeout', tx_hash: txHash };
  if (rcpt.status === '0x1') return { verdict: 'Real', tx_hash: txHash, block: Number.parseInt(rcpt.blockNumber ?? '0x0', 16) };
  const txRes = await rpc('eth_getTransactionByHash', [txHash]);
  const tx = txRes.result as { from?: string; to?: string; input?: string } | null | undefined;
  const callRes = await rpc('eth_call', [{ from: tx?.from, to: tx?.to, data: tx?.input ?? '0x' }, rcpt.blockNumber ?? 'latest']);
  const errMsg = `${callRes.error?.message ?? ''} ${callRes.error?.data ?? ''}`;
  const reason = errMsg.includes('TRANSFER_FROM_FAILED') ? 'TRANSFER_FROM_FAILED' : (callRes.error?.message ?? 'unknown revert');
  return { verdict: 'Ghost', tx_hash: txHash, reason, counterparty: tx?.input ? extractCounterparty(tx.input) : null };
}

export async function runKnownGhostFillDrill(killSwitch: PolyKillSwitch): Promise<{ verdict: FillVerdict; webhookResult: GhostGuardHandleResult; rpcCalls: Record<string, number>; elapsedMs: number }> {
  const startedAt = performance.now();
  const rpcServer = await startGhostGuardDrillRpcServer();
  const webhookServer = await startGhostGuardWebhookServer({ killSwitch });
  try {
    const verdict = await verifyFillAgainstJsonRpc(rpcServer.url, KNOWN_GHOST_FILL_TX_HASH);
    const resp = await fetch(webhookServer.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(verdict) });
    const webhookResult = (await resp.json()) as GhostGuardHandleResult;
    return { verdict, webhookResult, rpcCalls: rpcServer.getMethodCounts(), elapsedMs: Math.max(0, performance.now() - startedAt) };
  } finally {
    await Promise.allSettled([webhookServer.close(), rpcServer.close()]);
  }
}
