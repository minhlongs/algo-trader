#!/usr/bin/env node
// Gate 5 (Deployment) — post-deploy smoke test with retry.
// Fails CI if any required production URL returns non-2xx after retries.

const TARGETS = [
  { url: "https://algo-trader.pages.dev", label: "CF Pages" },
  { url: "https://cashclaw.cc", label: "custom domain" },
];
const MAX_ATTEMPTS = 5;
const BACKOFF_MS = 6000;

async function probe(url) {
  try {
    const res = await fetch(url, { redirect: "manual" });
    return res.status;
  } catch (err) {
    return `ERR ${err.code ?? err.message}`;
  }
}

async function waitHealthy({ url, label }) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const status = await probe(url);
    const ok = typeof status === "number" && status >= 200 && status < 400;
    console.log(`  attempt ${attempt}/${MAX_ATTEMPTS} · ${label} · ${url} → ${status}`);
    if (ok) return { url, label, status, ok: true };
    if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, BACKOFF_MS));
  }
  return { url, label, status: "exhausted", ok: false };
}

console.log("Gate 5 — post-deploy smoke test");
const results = [];
for (const target of TARGETS) results.push(await waitHealthy(target));

const failed = results.filter((r) => !r.ok);
if (failed.length === 0) {
  console.log("✅ All production URLs healthy.");
  process.exit(0);
}

console.error("❌ Gate 5 failed for:");
for (const r of failed) console.error(`  • ${r.label} ${r.url} → ${r.status}`);
process.exit(1);
