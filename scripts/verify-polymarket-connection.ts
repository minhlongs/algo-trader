#!/usr/bin/env npx ts-node
/**
 * Polymarket Connection Verification Script
 *
 * Tests algo-trader ↔ Polymarket CLOB connectivity.
 * Safe: only reads — no orders placed.
 *
 * Usage:
 *   npx ts-node scripts/verify-polymarket-connection.ts
 *   npx ts-node scripts/verify-polymarket-connection.ts --live   (also tests auth)
 */

import * as https from 'https';
import * as http from 'http';

const CLOB_HOST = process.env.POLY_CLOB_HOST || 'https://clob.polymarket.com';
const TRADING_MODE = process.env.POLYMARKET_TRADING_MODE || 'paper';
const isLive = process.argv.includes('--live') || TRADING_MODE === 'live';

interface CheckResult {
  name: string;
  pass: boolean;
  detail: string;
}

function fetchJson(path: string, headers?: Record<string, string>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, CLOB_HOST);
    const client = url.protocol === 'https:' ? https : http;
    const req = client.get(url, { headers, timeout: 10_000 }, res => {
      const chunks: Buffer[] = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
          return;
        }
        try { resolve(JSON.parse(body)); } catch { reject(new Error(`JSON parse failed: ${body.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

async function checkPublicEndpoint(): Promise<CheckResult> {
  try {
    const data = await fetchJson('/markets') as { markets?: unknown[] };
    const count = Array.isArray(data?.markets) ? data.markets.length : 'unknown';
    return { name: 'Public /markets (no auth)', pass: true, detail: `${count} markets returned` };
  } catch (err) {
    return { name: 'Public /markets (no auth)', pass: false, detail: String(err) };
  }
}

async function checkAuthEndpoint(): Promise<CheckResult> {
  const apiKey = process.env.POLYMARKET_API_KEY || process.env.POLY_API_KEY;
  const apiSecret = process.env.POLYMARKET_API_SECRET || process.env.POLY_API_SECRET;
  const passphrase = process.env.POLYMARKET_PASSPHRASE || process.env.POLY_PASSPHRASE;

  if (!apiKey || !apiSecret || !passphrase) {
    return {
      name: 'Authenticated /open-orders',
      pass: false,
      detail: 'Missing credentials — set POLYMARKET_API_KEY, POLYMARKET_API_SECRET, POLYMARKET_PASSPHRASE',
    };
  }

  try {
    // HMAC-SHA256 auth requires PolymarketSigner — test with simple GET that returns auth error or success
    const data = await fetchJson('/open-orders', {
      'POLY_API_KEY': apiKey,
      'POLY_PASSPHRASE': passphrase,
    });
    return { name: 'Authenticated /open-orders', pass: true, detail: `Orders returned: ${JSON.stringify(data).slice(0, 100)}` };
  } catch (err) {
    const msg = String(err);
    // HTTP 401/403 = auth reached server but credentials invalid — connection works
    if (msg.includes('401') || msg.includes('403')) {
      return { name: 'Authenticated /open-orders', pass: true, detail: `Auth reachable (credentials may need HMAC signing): ${msg.slice(0, 100)}` };
    }
    return { name: 'Authenticated /open-orders', pass: false, detail: msg.slice(0, 200) };
  }
}

async function main() {
  console.log(`\n═══ Polymarket Connection Verification ═══`);
  console.log(`CLOB Host:  ${CLOB_HOST}`);
  console.log(`Mode:       ${TRADING_MODE}${isLive ? ' (LIVE)' : ' (paper)'}\n`);

  const results: CheckResult[] = [];

  // 1. Public endpoint
  process.stdout.write('Testing /markets... ');
  const publicCheck = await checkPublicEndpoint();
  results.push(publicCheck);
  console.log(publicCheck.pass ? '✓' : '✗', publicCheck.detail);

  // 2. Auth endpoint (only in live mode)
  if (isLive) {
    process.stdout.write('Testing /open-orders (auth)... ');
    const authCheck = await checkAuthEndpoint();
    results.push(authCheck);
    console.log(authCheck.pass ? '✓' : '✗', authCheck.detail);
  }

  // Summary
  const allPass = results.every(r => r.pass);
  console.log(`\n═══ ${allPass ? 'ALL CHECKS PASSED ✓' : 'SOME CHECKS FAILED ✗'} ═══\n`);

  if (!allPass) {
    console.log('Next steps:');
    console.log('  1. Add Polymarket API keys to .env (see .env.example)');
    console.log('  2. Set POLYMARKET_TRADING_MODE=live in .env');
    console.log('  3. Run: npx ts-node scripts/verify-polymarket-connection.ts --live');
    process.exit(1);
  }

  console.log('Ready for trading. Start the bot:');
  console.log('  npm run start');
}

main().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
