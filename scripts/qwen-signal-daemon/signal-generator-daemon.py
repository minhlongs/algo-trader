#!/usr/bin/env python3
"""
Qwen Signal Generator Daemon
M1 Max daemon: polls market data, calls Qwen3-30B-A3B @ :11437,
extracts trade signals, HMAC-signs payload, POSTs to CF Worker ingest endpoint.

Scheduling: launchd runs during US market hours (13:30-20:00 UTC).
Kill switch: QWEN_SIGNAL_KILL env var (any non-empty value).
Poll interval: 60 seconds (RAM-safe — Qwen16GB weights stay loaded).
"""

import argparse
import hashlib
import hmac
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone

import httpx

# ── Configuration ────────────────────────────────────────────────────────────

HMAC_SECRET = os.environ.get("QWEN_INGEST_HMAC_SECRET", "")
INGEST_URL = os.environ.get(
    "QWEN_SIGNAL_INGEST_URL",
    "https://algo-trader.pages.dev/api/v1/signals/ingest",
)
<<<<<<< HEAD
QWEN_URL = os.environ.get("QWEN_SERVER_URL", "http://127.0.0.1:4002")
=======
QWEN_URL = os.environ.get("QWEN_SERVER_URL", "http://127.0.0.1:11437")
>>>>>>> origin/feat/qwen-signal-daemon-phase03
QWEN_MODEL = os.environ.get("QWEN_MODEL", "mlx-community/Qwen3-30B-A3B-4bit")
KILL_SWITCH_KEY = "QWEN_SIGNAL_KILL"  # daemon exits cleanly if set to non-empty
POLL_INTERVAL_S = 60
DAEMON_ID = f"qwen-m1max-{os.uname().nodename}"
LOG_DIR = os.path.expanduser("~/.local/logs")
LOG_FILE = os.path.join(LOG_DIR, "qwen-signal-daemon.log")

# Market symbols to rotate through per cycle
MARKETS = ["BTC-USD", "ETH-USD", "SOL-USD"]

# ── Logging ──────────────────────────────────────────────────────────────────

os.makedirs(LOG_DIR, exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format='{"ts":"%(asctime)s","level":"%(levelname)s","msg":%(message)s}',
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger("qwen-daemon")


# ── HMAC Signing ─────────────────────────────────────────────────────────────

def hmac_sign(body: str, secret: str) -> str:
    """Return sha256=<hex> signature over raw body string."""
    digest = hmac.new(secret.encode(), body.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"sha256={digest}"


# ── Market Data ──────────────────────────────────────────────────────────────

def fetch_market_snapshot(market: str, client: httpx.Client) -> dict:
    """
    Fetch lightweight price snapshot via public Binance REST (no auth needed).
    Returns {symbol, price, change_24h_pct} or raises on failure.
    """
    symbol_map = {"BTC-USD": "BTCUSDT", "ETH-USD": "ETHUSDT", "SOL-USD": "SOLUSDT"}
    binance_sym = symbol_map.get(market, market.replace("-", ""))
    r = client.get(
        f"https://api.binance.com/api/v3/ticker/24hr?symbol={binance_sym}",
        timeout=10,
    )
    r.raise_for_status()
    data = r.json()
    return {
        "symbol": market,
        "price": float(data["lastPrice"]),
        "change_24h_pct": float(data["priceChangePercent"]),
        "volume": float(data["volume"]),
        "high_24h": float(data["highPrice"]),
        "low_24h": float(data["lowPrice"]),
    }


# ── Qwen Inference ───────────────────────────────────────────────────────────

SIGNAL_PROMPT_TEMPLATE = """You are a quantitative trading signal generator.
Given the following market snapshot, output a JSON trade signal.

Market: {symbol}
Price: {price}
24h Change: {change_24h_pct}%
24h Volume: {volume}
24h High: {high_24h}
24h Low: {low_24h}

Respond ONLY with valid JSON (no markdown, no explanation):
{{
  "side": "BUY" or "SELL",
  "confidence": <float 0.0-1.0>,
  "reasoning": "<brief reason, max 100 chars>"
}}"""


def call_qwen(snapshot: dict, client: httpx.Client) -> dict:
    """
<<<<<<< HEAD
    Call Qwen3-30B-A3B via OpenAI-compat API (port from QWEN_SERVER_URL, default :4002).
=======
    Call Qwen3-30B-A3B via OpenAI-compat API at :11437.
>>>>>>> origin/feat/qwen-signal-daemon-phase03
    Returns parsed signal dict with {side, confidence, reasoning}.
    Raises ValueError if JSON is malformed or fields missing.
    """
    prompt = SIGNAL_PROMPT_TEMPLATE.format(**snapshot)
    payload = {
        "model": QWEN_MODEL,
<<<<<<< HEAD
        # System prompt `/no_think` disables Qwen3 thinking mode (cuts latency + avoids <think> tokens)
        "messages": [
            {"role": "system", "content": "/no_think"},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.3,
        "max_tokens": 300,
=======
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.3,
        "max_tokens": 200,
>>>>>>> origin/feat/qwen-signal-daemon-phase03
    }
    r = client.post(
        f"{QWEN_URL}/v1/chat/completions",
        json=payload,
<<<<<<< HEAD
        timeout=120,
=======
        timeout=60,
>>>>>>> origin/feat/qwen-signal-daemon-phase03
    )
    r.raise_for_status()
    content = r.json()["choices"][0]["message"]["content"].strip()

<<<<<<< HEAD
    # Strip Qwen3 <think>...</think> block if present (fallback if /no_think ignored)
    if "</think>" in content:
        content = content.split("</think>", 1)[1].strip()
=======
>>>>>>> origin/feat/qwen-signal-daemon-phase03
    # Strip markdown fences if Qwen wraps output
    if content.startswith("```"):
        content = content.split("```")[1]
        if content.startswith("json"):
            content = content[4:]
<<<<<<< HEAD
    # Find first { and last } to tolerate surrounding whitespace/prose
    if "{" in content and "}" in content:
        content = content[content.index("{") : content.rindex("}") + 1]
=======
>>>>>>> origin/feat/qwen-signal-daemon-phase03

    parsed = json.loads(content)
    side = parsed.get("side")
    confidence = float(parsed.get("confidence", 0))
    reasoning = str(parsed.get("reasoning", ""))[:200]

    if side not in ("BUY", "SELL"):
        raise ValueError(f"Invalid side: {side!r}")
    if not (0.0 <= confidence <= 1.0):
        raise ValueError(f"Confidence out of range: {confidence}")

    return {"side": side, "confidence": confidence, "reasoning": reasoning}


# ── Signal Posting ───────────────────────────────────────────────────────────

def post_signal(market: str, signal: dict, dry_run: bool, client: httpx.Client) -> bool:
    """
    Build HMAC-signed payload and POST to ingest endpoint.
    Returns True on 2xx, False on error (logs, does not raise).
    """
    ts_seconds = int(time.time())
    body_dict = {
        "market": market,
        "side": signal["side"],
        "size": round(signal["confidence"] * 0.5, 4),  # size = 50% of confidence
        "confidence": signal["confidence"],
        "strategy": "qwen-m1max-v1",
        "ttlSec": 300,
        "ts": ts_seconds * 1000,  # ms for signal-publisher
        # Extra metadata (ignored by zod schema, harmless)
        "_reasoning": signal["reasoning"],
        "_daemon_id": DAEMON_ID,
    }
    # Remove extra keys not in schema before signing to keep payload clean
    ingest_body = {k: v for k, v in body_dict.items() if not k.startswith("_")}
    raw_body = json.dumps(ingest_body, separators=(",", ":"))
    sig = hmac_sign(raw_body, HMAC_SECRET)

    if dry_run:
        log.info(
            json.dumps({
                "dry_run": True,
                "market": market,
                "side": signal["side"],
                "confidence": signal["confidence"],
                "reasoning": signal["reasoning"],
                "hmac_prefix": sig[:20] + "...",
                "would_post_to": INGEST_URL,
            })
        )
        return True

    last_err = None
    for attempt, delay in enumerate([0, 1, 2, 4]):
        if attempt > 0:
            time.sleep(delay)
        try:
            r = client.post(
                INGEST_URL,
                content=raw_body,
                headers={
                    "Content-Type": "application/json",
                    "X-Signature-256": sig,
                    "X-Timestamp": str(ts_seconds),
                },
                timeout=15,
            )
            if r.status_code in (200, 202):
                log.info(json.dumps({"posted": True, "market": market, "status": r.status_code, "body": r.json()}))
                return True
            log.warning(json.dumps({"post_failed": True, "status": r.status_code, "resp": r.text[:200]}))
            last_err = f"HTTP {r.status_code}"
        except Exception as e:
            last_err = str(e)
            log.warning(json.dumps({"post_error": True, "attempt": attempt, "error": last_err}))

    log.error(json.dumps({"post_exhausted": True, "market": market, "last_err": last_err}))
    return False


# ── Main Loop ────────────────────────────────────────────────────────────────

def main(dry_run: bool = False) -> None:
    if not HMAC_SECRET:
        log.error('"QWEN_INGEST_HMAC_SECRET not set — daemon cannot sign payloads"')
        sys.exit(1)

    log.info(json.dumps({"daemon_start": True, "daemon_id": DAEMON_ID, "dry_run": dry_run}))

    market_idx = 0
    with httpx.Client() as client:
        while True:
            # Kill switch check
            if os.environ.get(KILL_SWITCH_KEY):
                log.info('"Kill switch activated — exiting cleanly"')
                sys.exit(0)

            market = MARKETS[market_idx % len(MARKETS)]
            market_idx += 1

            cycle_start = time.monotonic()
            try:
                snapshot = fetch_market_snapshot(market, client)
                log.info(json.dumps({"market_snapshot": snapshot}))

                signal = call_qwen(snapshot, client)
                log.info(json.dumps({"qwen_signal": {**signal, "market": market}}))

                post_signal(market, signal, dry_run, client)

            except Exception as e:
                log.error(json.dumps({"cycle_error": True, "market": market, "error": str(e)}))

            elapsed = time.monotonic() - cycle_start
            sleep_s = max(0, POLL_INTERVAL_S - elapsed)
            log.info(json.dumps({"cycle_done": True, "elapsed_s": round(elapsed, 2), "sleep_s": round(sleep_s, 1)}))
            time.sleep(sleep_s)


# ── Entry Point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Qwen Signal Generator Daemon")
    parser.add_argument("--dry-run", action="store_true", help="Log signals without posting")
    args = parser.parse_args()
    main(dry_run=args.dry_run)
