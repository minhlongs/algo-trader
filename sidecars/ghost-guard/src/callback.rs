use anyhow::{anyhow, bail, Context, Result};
use hmac::{Hmac, Mac};
use reqwest::StatusCode;
use serde::Serialize;
use serde_json::{Map, Value};
use sha2::Sha256;
use std::collections::BTreeMap;
use std::fmt;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use subtle::ConstantTimeEq;
use tokio::time::sleep;
use tracing::{info, warn};

use crate::types::{FillVerdict, GhostFillEvent};

type HmacSha256 = Hmac<Sha256>;

pub const HEADER_TIMESTAMP: &str = "X-GhostGuard-Timestamp";
pub const HEADER_NONCE: &str = "X-GhostGuard-Nonce";
pub const HEADER_SOURCE: &str = "X-GhostGuard-Source";
pub const HEADER_KEY_ID: &str = "X-GhostGuard-Key-Id";
pub const HEADER_SIGNATURE: &str = "X-GhostGuard-Signature";

pub const DEFAULT_SOURCE_ID: &str = "ghostguard-sidecar";
pub const DEFAULT_HTTP_TIMEOUT: Duration = Duration::from_secs(5);
pub const DEFAULT_MAX_RETRIES: usize = 2;
pub const DEFAULT_RETRY_BACKOFF: Duration = Duration::from_millis(100);

static NONCE_COUNTER: AtomicU64 = AtomicU64::new(1);

/// Authenticated webhook signing configuration.
/// Custom `Debug` implementation redacts `secret` so credentials never leak to logs.
#[derive(Clone)]
pub struct CallbackAuthConfig {
    pub key_id: String,
    pub secret: String,
    pub source_id: String,
    pub timeout: Duration,
    pub max_retries: usize,
    pub retry_backoff: Duration,
}

impl fmt::Debug for CallbackAuthConfig {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("CallbackAuthConfig")
            .field("key_id", &self.key_id)
            .field("secret", &"[REDACTED]")
            .field("source_id", &self.source_id)
            .field("timeout", &self.timeout)
            .field("max_retries", &self.max_retries)
            .field("retry_backoff", &self.retry_backoff)
            .finish()
    }
}

impl CallbackAuthConfig {
    pub fn new(key_id: impl Into<String>, secret: impl Into<String>) -> Self {
        Self {
            key_id: key_id.into(),
            secret: secret.into(),
            source_id: DEFAULT_SOURCE_ID.to_string(),
            timeout: DEFAULT_HTTP_TIMEOUT,
            max_retries: DEFAULT_MAX_RETRIES,
            retry_backoff: DEFAULT_RETRY_BACKOFF,
        }
    }

    pub fn with_source_id(mut self, source_id: impl Into<String>) -> Self {
        self.source_id = source_id.into();
        self
    }

    /// Fail closed if any required authentication field is missing or whitespace.
    pub fn validate(&self) -> Result<()> {
        if self.secret.trim().is_empty() {
            bail!("callback HMAC secret must not be empty");
        }
        if self.key_id.trim().is_empty() {
            bail!("callback key_id must not be empty");
        }
        if self.source_id.trim().is_empty() {
            bail!("callback source_id must not be empty");
        }
        Ok(())
    }
}

fn normalize_canonical_value(value: Value) -> Value {
    match value {
        Value::Object(map) => {
            let sorted: BTreeMap<String, Value> = map
                .into_iter()
                .map(|(k, v)| (k, normalize_canonical_value(v)))
                .collect();
            let mut out = Map::with_capacity(sorted.len());
            for (k, v) in sorted {
                out.insert(k, v);
            }
            Value::Object(out)
        }
        Value::Array(items) => {
            Value::Array(items.into_iter().map(normalize_canonical_value).collect())
        }
        Value::Number(num) => {
            if !num.is_i64() && !num.is_u64() {
                if let Some(f) = num.as_f64() {
                    if f.is_finite()
                        && f.fract() == 0.0
                        && f >= (i64::MIN as f64)
                        && f < (i64::MAX as f64)
                    {
                        return Value::Number(serde_json::Number::from(f as i64));
                    }
                }
            }
            Value::Number(num)
        }
        other => other,
    }
}

/// Produce deterministic key-sorted compact JSON matching TypeScript `canonicalizeJson`.
pub fn canonical_json_string<T: Serialize>(payload: &T) -> Result<String> {
    let raw_val = serde_json::to_value(payload).context("serialize payload to JSON value")?;
    let normalized = normalize_canonical_value(raw_val);
    serde_json::to_string(&normalized).context("encode canonical JSON string")
}

/// Build the canonical newline-delimited signing preimage.
pub fn canonical_signing_string(
    timestamp_ms: u64,
    nonce: &str,
    source_id: &str,
    key_id: &str,
    canonical_json_body: &str,
) -> String {
    format!("{timestamp_ms}\n{nonce}\n{source_id}\n{key_id}\n{canonical_json_body}")
}

/// Compute lowercase hex HMAC-SHA256 signature over the canonical signing string.
/// Fails closed if `secret`, `nonce`, `source_id`, or `key_id` is empty.
pub fn sign_canonical_payload(
    secret: &str,
    timestamp_ms: u64,
    nonce: &str,
    source_id: &str,
    key_id: &str,
    canonical_json_body: &str,
) -> Result<String> {
    if secret.trim().is_empty() {
        bail!("refusing to sign callback payload with empty secret");
    }
    if nonce.trim().is_empty() || source_id.trim().is_empty() || key_id.trim().is_empty() {
        bail!("refusing to sign callback payload with empty metadata header");
    }
    let preimage =
        canonical_signing_string(timestamp_ms, nonce, source_id, key_id, canonical_json_body);
    let mut mac =
        HmacSha256::new_from_slice(secret.as_bytes()).map_err(|_| anyhow!("invalid HMAC key"))?;
    mac.update(preimage.as_bytes());
    let digest = mac.finalize().into_bytes();
    Ok(hex::encode(digest))
}

/// Constant-time verification helper for canonical HMAC-SHA256 signatures.
/// Fails closed (`false`) if secret/metadata is empty or signature is not 64 lowercase hex chars.
pub fn verify_canonical_signature(
    secret: &str,
    timestamp_ms: u64,
    nonce: &str,
    source_id: &str,
    key_id: &str,
    canonical_json_body: &str,
    signature_hex: &str,
) -> bool {
    if secret.trim().is_empty()
        || nonce.trim().is_empty()
        || source_id.trim().is_empty()
        || key_id.trim().is_empty()
    {
        return false;
    }
    if signature_hex.len() != 64
        || !signature_hex
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return false;
    }
    let candidate = match hex::decode(signature_hex) {
        Ok(bytes) if bytes.len() == 32 => bytes,
        _ => return false,
    };
    let preimage =
        canonical_signing_string(timestamp_ms, nonce, source_id, key_id, canonical_json_body);
    let mut mac = match HmacSha256::new_from_slice(secret.as_bytes()) {
        Ok(m) => m,
        Err(_) => return false,
    };
    mac.update(preimage.as_bytes());
    let expected = mac.finalize().into_bytes();
    expected.as_slice().ct_eq(candidate.as_slice()).into()
}

fn now_epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

/// Generate a unique nonce per attempt without exposing secret material.
pub fn generate_nonce() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let seq = NONCE_COUNTER.fetch_add(1, Ordering::Relaxed);
    let pid = std::process::id();
    format!("{nanos:032x}{pid:08x}{seq:016x}")
}

fn build_bounded_client(timeout: Duration) -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .timeout(timeout)
        .build()
        .context("build bounded HTTP webhook client")
}

/// Dispatch a canonical JSON payload signed with HMAC-SHA256 headers, bounded timeout,
/// and bounded retry on 5xx / network errors using a fresh timestamp + nonce per attempt.
pub async fn send_authenticated_json<T: Serialize>(
    url: &str,
    payload: &T,
    auth: &CallbackAuthConfig,
) -> Result<StatusCode> {
    auth.validate()?;
    let canonical_body = canonical_json_string(payload)?;
    let client = build_bounded_client(auth.timeout)?;
    let total_attempts = auth.max_retries.saturating_add(1);

    for attempt in 0..total_attempts {
        let timestamp_ms = now_epoch_ms();
        let nonce = generate_nonce();
        let signature = sign_canonical_payload(
            &auth.secret,
            timestamp_ms,
            &nonce,
            &auth.source_id,
            &auth.key_id,
            &canonical_body,
        )?;

        let send_res = client
            .post(url)
            .header(reqwest::header::CONTENT_TYPE, "application/json")
            .header(HEADER_TIMESTAMP, timestamp_ms.to_string())
            .header(HEADER_NONCE, &nonce)
            .header(HEADER_SOURCE, &auth.source_id)
            .header(HEADER_KEY_ID, &auth.key_id)
            .header(HEADER_SIGNATURE, &signature)
            .body(canonical_body.clone())
            .send()
            .await;

        match send_res {
            Ok(resp) => {
                let status = resp.status();
                if status.is_success() {
                    info!(
                        url,
                        key_id = %auth.key_id,
                        source = %auth.source_id,
                        attempt = attempt + 1,
                        "authenticated webhook delivered"
                    );
                    return Ok(status);
                }
                if status.is_server_error() && attempt + 1 < total_attempts {
                    warn!(
                        url,
                        status = %status,
                        attempt = attempt + 1,
                        "authenticated webhook returned 5xx; retrying"
                    );
                    sleep(auth.retry_backoff.saturating_mul((attempt + 1) as u32)).await;
                    continue;
                }
                warn!(
                    url,
                    status = %status,
                    attempt = attempt + 1,
                    "authenticated webhook rejected with non-retryable status"
                );
                bail!("authenticated webhook failed with HTTP status {status}");
            }
            Err(err) => {
                if attempt + 1 < total_attempts {
                    warn!(
                        url,
                        attempt = attempt + 1,
                        "authenticated webhook transport error; retrying"
                    );
                    sleep(auth.retry_backoff.saturating_mul((attempt + 1) as u32)).await;
                    continue;
                }
                return Err(anyhow!(
                    "authenticated webhook transport failed after {total_attempts} attempts: {}",
                    err.without_url()
                ));
            }
        }
    }

    bail!("authenticated webhook exhausted retry budget")
}

/// Dispatch an authenticated `FillVerdict` to a webhook URL.
pub async fn send_authenticated_verdict(
    url: &str,
    verdict: &FillVerdict,
    auth: &CallbackAuthConfig,
) -> Result<StatusCode> {
    send_authenticated_json(url, verdict, auth).await
}

/// Dispatch an authenticated `GhostFillEvent` to a webhook URL.
pub async fn send_authenticated_ghost_event(
    url: &str,
    event: &GhostFillEvent,
    auth: &CallbackAuthConfig,
) -> Result<StatusCode> {
    send_authenticated_json(url, event, auth).await
}

/// Dispatch an unauthenticated fill verdict to a webhook URL via bounded HTTP POST.
pub async fn send_webhook(url: &str, verdict: &FillVerdict) -> Result<()> {
    let client = build_bounded_client(DEFAULT_HTTP_TIMEOUT)?;
    let resp = client.post(url).json(verdict).send().await?;

    if resp.status().is_success() {
        info!(url, "webhook delivered successfully");
    } else {
        warn!(url, status = %resp.status(), "webhook returned non-2xx");
    }

    Ok(())
}

/// Dispatch an unauthenticated ghost fill event to a webhook URL via bounded HTTP POST.
pub async fn send_ghost_event_webhook(url: &str, event: &GhostFillEvent) -> Result<()> {
    let client = build_bounded_client(DEFAULT_HTTP_TIMEOUT)?;
    let resp = client.post(url).json(event).send().await?;

    if resp.status().is_success() {
        info!(url, "ghost event webhook delivered");
    } else {
        warn!(url, status = %resp.status(), "ghost event webhook non-2xx");
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use ethers::types::{Address, H256};
    use std::sync::atomic::AtomicUsize;
    use std::sync::Arc;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    #[test]
    fn canonical_json_sorts_keys_and_normalizes_whole_floats() {
        let tx: H256 = "0x9e3230abde0f569da87511a6f8823076f7b211bb00d10689db3b7c50d6652df0"
            .parse()
            .unwrap();
        let event = GhostFillEvent {
            tx_hash: tx,
            market: "btc-updown-5m".to_string(),
            side: "SELL".to_string(),
            size: 100.0,
            price: 0.52,
            counterparty: None,
            reason: "TRANSFER_FROM_FAILED".to_string(),
            timestamp: 1_700_000_010,
        };
        let encoded = canonical_json_string(&event).unwrap();
        assert_eq!(
            encoded,
            r#"{"counterparty":null,"market":"btc-updown-5m","price":0.52,"reason":"TRANSFER_FROM_FAILED","side":"SELL","size":100,"timestamp":1700000010,"tx_hash":"0x9e3230abde0f569da87511a6f8823076f7b211bb00d10689db3b7c50d6652df0"}"#
        );
    }

    #[test]
    fn sign_and_verify_constant_time_and_golden_vector() {
        // Shared cross-language Golden Vector 1 (FillVerdict::Ghost) — mirrored verbatim in
        // tests/polymarket/ghost-guard-hmac-security.test.ts
        const EXPECTED_GV1_BODY: &str = r#"{"counterparty":"0xdeadbeef0000000000000000000000000000cafe","reason":"TRANSFER_FROM_FAILED","tx_hash":"0x9e3230abde0f569da87511a6f8823076f7b211bb00d10689db3b7c50d6652df0","verdict":"Ghost"}"#;
        const EXPECTED_GV1_SIG: &str =
            "3a3e50f69b024c8dbff4a26291b2566830938b83523cf4322b6d413d20d28a2b";

        let tx: H256 = "0x9e3230abde0f569da87511a6f8823076f7b211bb00d10689db3b7c50d6652df0"
            .parse()
            .unwrap();
        let cp: Address = "0xdeadbeef0000000000000000000000000000cafe"
            .parse()
            .unwrap();
        let verdict = FillVerdict::Ghost {
            tx_hash: tx,
            reason: "TRANSFER_FROM_FAILED".to_string(),
            counterparty: Some(cp),
        };
        let body = canonical_json_string(&verdict).unwrap();
        assert_eq!(body, EXPECTED_GV1_BODY);

        let sig = sign_canonical_payload(
            "test-hmac-secret-v1",
            1_700_000_000_123,
            "nonce-golden-001",
            "ghostguard-sidecar",
            "key-v1",
            &body,
        )
        .unwrap();

        assert_eq!(sig, EXPECTED_GV1_SIG);
        assert!(verify_canonical_signature(
            "test-hmac-secret-v1",
            1_700_000_000_123,
            "nonce-golden-001",
            "ghostguard-sidecar",
            "key-v1",
            &body,
            EXPECTED_GV1_SIG
        ));

        // Shared cross-language Golden Vector 2 (GhostFillEvent with whole-float normalization)
        const EXPECTED_GV2_BODY: &str = r#"{"counterparty":null,"market":"btc-updown-5m","price":0.52,"reason":"TRANSFER_FROM_FAILED","side":"SELL","size":100,"timestamp":1700000010,"tx_hash":"0x9e3230abde0f569da87511a6f8823076f7b211bb00d10689db3b7c50d6652df0"}"#;
        const EXPECTED_GV2_SIG: &str =
            "a51b14ac96acdc3a46078111bb7ab71b01d119504fccb88243b8a9f4a40ac2c5";

        let event = GhostFillEvent {
            tx_hash: tx,
            market: "btc-updown-5m".to_string(),
            side: "SELL".to_string(),
            size: 100.0,
            price: 0.52,
            counterparty: None,
            reason: "TRANSFER_FROM_FAILED".to_string(),
            timestamp: 1_700_000_010,
        };
        let event_body = canonical_json_string(&event).unwrap();
        assert_eq!(event_body, EXPECTED_GV2_BODY);

        let event_sig = sign_canonical_payload(
            "test-hmac-secret-v1",
            1_700_000_010_456,
            "nonce-golden-002",
            "ghostguard-sidecar",
            "key-v1",
            &event_body,
        )
        .unwrap();
        assert_eq!(event_sig, EXPECTED_GV2_SIG);
        assert!(verify_canonical_signature(
            "test-hmac-secret-v1",
            1_700_000_010_456,
            "nonce-golden-002",
            "ghostguard-sidecar",
            "key-v1",
            &event_body,
            EXPECTED_GV2_SIG
        ));

        // Modified payload fails
        let tampered_body = body.replace("TRANSFER_FROM_FAILED", "MODIFIED");
        assert!(!verify_canonical_signature(
            "test-hmac-secret-v1",
            1_700_000_000_123,
            "nonce-golden-001",
            "ghostguard-sidecar",
            "key-v1",
            &tampered_body,
            &sig
        ));
        // Wrong secret fails
        assert!(!verify_canonical_signature(
            "wrong-secret",
            1_700_000_000_123,
            "nonce-golden-001",
            "ghostguard-sidecar",
            "key-v1",
            &body,
            &sig
        ));
        // Uppercase or malformed hex fails closed
        assert!(!verify_canonical_signature(
            "test-hmac-secret-v1",
            1_700_000_000_123,
            "nonce-golden-001",
            "ghostguard-sidecar",
            "key-v1",
            &body,
            &sig.to_uppercase()
        ));
    }

    #[test]
    fn fails_closed_when_secret_or_metadata_missing_and_redacts_debug() {
        assert!(sign_canonical_payload("", 1000, "n1", "src", "k1", "{}").is_err());
        assert!(sign_canonical_payload("   ", 1000, "n1", "src", "k1", "{}").is_err());
        assert!(sign_canonical_payload("sec", 1000, "", "src", "k1", "{}").is_err());
        assert!(!verify_canonical_signature(
            "",
            1000,
            "n1",
            "src",
            "k1",
            "{}",
            &"a".repeat(64)
        ));

        let cfg = CallbackAuthConfig::new("k1", "top-secret-material-xyz");
        let dbg_str = format!("{cfg:?}");
        assert!(!dbg_str.contains("top-secret-material-xyz"));
        assert!(dbg_str.contains("[REDACTED]"));

        let bad_cfg = CallbackAuthConfig::new("k1", "   ");
        assert!(bad_cfg.validate().is_err());
    }

    #[tokio::test]
    async fn retries_on_5xx_with_fresh_nonce_and_delivers_valid_hmac_headers() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let hit_count = Arc::new(AtomicUsize::new(0));
        let hit_count_srv = Arc::clone(&hit_count);

        let server = tokio::spawn(async move {
            let mut nonces = Vec::new();
            for i in 0..2 {
                let (mut sock, _) = listener.accept().await.unwrap();
                let mut buf = vec![0u8; 4096];
                let n = sock.read(&mut buf).await.unwrap();
                let req_str = String::from_utf8_lossy(&buf[..n]).to_string();
                hit_count_srv.fetch_add(1, Ordering::SeqCst);

                for line in req_str.lines() {
                    if let Some(rest) = line.to_ascii_lowercase().strip_prefix("x-ghostguard-nonce:") {
                        nonces.push(rest.trim().to_string());
                    }
                }

                let resp = if i == 0 {
                    "HTTP/1.1 503 Service Unavailable\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}"
                } else {
                    "HTTP/1.1 200 OK\r\nContent-Length: 11\r\nConnection: close\r\n\r\n{\"ok\":true}"
                };
                sock.write_all(resp.as_bytes()).await.unwrap();
            }
            nonces
        });

        let mut auth = CallbackAuthConfig::new("key-rot-1", "unit-test-secret-01");
        auth.retry_backoff = Duration::from_millis(10);
        auth.max_retries = 2;

        let verdict = FillVerdict::Timeout {
            tx_hash: H256::repeat_byte(0xcd),
        };
        let status =
            send_authenticated_verdict(&format!("http://{addr}/ghost-alert"), &verdict, &auth)
                .await
                .unwrap();

        assert_eq!(status, StatusCode::OK);
        assert_eq!(hit_count.load(Ordering::SeqCst), 2);
        let nonces = server.await.unwrap();
        assert_eq!(nonces.len(), 2);
        assert_ne!(nonces[0], nonces[1], "retry must mint a fresh nonce");
    }

    #[tokio::test]
    async fn fails_closed_without_retry_on_401_and_on_invalid_config() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let hit_count = Arc::new(AtomicUsize::new(0));
        let hit_count_srv = Arc::clone(&hit_count);

        let server = tokio::spawn(async move {
            let (mut sock, _) = listener.accept().await.unwrap();
            let mut buf = vec![0u8; 4096];
            let _ = sock.read(&mut buf).await.unwrap();
            hit_count_srv.fetch_add(1, Ordering::SeqCst);
            let resp = "HTTP/1.1 401 Unauthorized\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}";
            sock.write_all(resp.as_bytes()).await.unwrap();
        });

        let mut auth = CallbackAuthConfig::new("key-rot-1", "unit-test-secret-01");
        auth.retry_backoff = Duration::from_millis(5);
        auth.max_retries = 2;

        let verdict = FillVerdict::Timeout {
            tx_hash: H256::repeat_byte(0xab),
        };
        let err = send_authenticated_verdict(&format!("http://{addr}/ghost-alert"), &verdict, &auth)
            .await
            .unwrap_err();
        assert!(err.to_string().contains("401"), "unexpected error: {err}");
        server.await.unwrap();
        assert_eq!(hit_count.load(Ordering::SeqCst), 1, "4xx must not retry");

        // Invalid config (empty secret) fails closed before any network call
        let bad_auth = CallbackAuthConfig::new("key-rot-1", "   ");
        let bad_err =
            send_authenticated_verdict(&format!("http://{addr}/ghost-alert"), &verdict, &bad_auth)
                .await
                .unwrap_err();
        assert!(bad_err.to_string().contains("secret"));
    }

    #[tokio::test]
    async fn fails_closed_after_bounded_timeout_and_exhausted_retries() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let hit_count = Arc::new(AtomicUsize::new(0));
        let hit_count_srv = Arc::clone(&hit_count);

        let server = tokio::spawn(async move {
            for _ in 0..2 {
                if let Ok((mut sock, _)) = listener.accept().await {
                    hit_count_srv.fetch_add(1, Ordering::SeqCst);
                    tokio::spawn(async move {
                        let mut buf = vec![0u8; 1024];
                        let _ = sock.read(&mut buf).await;
                        // Hold open past client timeout without replying
                        sleep(Duration::from_millis(250)).await;
                    });
                }
            }
        });

        let mut auth = CallbackAuthConfig::new("key-timeout-1", "unit-test-secret-timeout");
        auth.timeout = Duration::from_millis(50);
        auth.max_retries = 1;
        auth.retry_backoff = Duration::from_millis(10);

        let verdict = FillVerdict::Timeout {
            tx_hash: H256::repeat_byte(0xef),
        };
        let err = send_authenticated_verdict(&format!("http://{addr}/ghost-alert"), &verdict, &auth)
            .await
            .unwrap_err();
        assert!(
            err.to_string().contains("after 2 attempts"),
            "unexpected timeout error: {err}"
        );
        assert_eq!(hit_count.load(Ordering::SeqCst), 2);
        server.abort();
    }
}
