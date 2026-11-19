//! Local defense state machine for GhostGuard (zero CLOB trading credentials in Rust).
//!
//! Responsibilities:
//! - Counterparty blacklist (in-memory set + optional append-only file persistence with deduplication).
//! - Circuit-breaker latch tracking ghost fills (`latched`, `trigger_tx_hash`, `trigger_count`).
//! - Defense decision evaluator (`evaluate_ghost_event`) producing structured `DefenseAction`s.
//! - Authenticated alert dispatch via `callback::send_authenticated_verdict` / `send_authenticated_ghost_event`.

use anyhow::{Context, Result};
use ethers::types::{Address, H256};
use reqwest::StatusCode;
use std::collections::HashSet;
use std::fs::{create_dir_all, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};

use crate::callback::{
    send_authenticated_ghost_event, send_authenticated_verdict, CallbackAuthConfig,
};
use crate::types::{FillVerdict, GhostFillEvent};

/// Local defense policy flags (mirrored from `config::DefenseSection`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DefensePolicy {
    pub auto_cancel: bool,
    pub auto_blacklist: bool,
}

impl Default for DefensePolicy {
    fn default() -> Self {
        Self {
            auto_cancel: true,
            auto_blacklist: true,
        }
    }
}

/// In-memory counterparty blacklist with optional append-only file persistence.
#[derive(Debug, Clone)]
pub struct CounterpartyBlacklist {
    entries: HashSet<Address>,
    file_path: Option<PathBuf>,
}

impl CounterpartyBlacklist {
    pub fn new(file_path: Option<PathBuf>) -> Self {
        Self {
            entries: HashSet::new(),
            file_path,
        }
    }

    /// Load existing blacklist addresses from disk, deduplicating and ignoring comments/blank lines.
    /// If the file does not exist yet, starts empty and will create it on first append.
    pub fn load_from_file(path: impl Into<PathBuf>) -> Result<Self> {
        let path = path.into();
        let mut entries = HashSet::new();
        if path.exists() {
            let file = OpenOptions::new()
                .read(true)
                .open(&path)
                .with_context(|| format!("open blacklist file {}", path.display()))?;
            let reader = BufReader::new(file);
            for line_res in reader.lines() {
                let line = line_res.context("read blacklist line")?;
                let trimmed = line.trim();
                if trimmed.is_empty() || trimmed.starts_with('#') {
                    continue;
                }
                if let Ok(addr) = trimmed.parse::<Address>() {
                    entries.insert(addr);
                }
            }
        }
        Ok(Self {
            entries,
            file_path: Some(path),
        })
    }

    pub fn contains(&self, addr: &Address) -> bool {
        self.entries.contains(addr)
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    pub fn file_path(&self) -> Option<&Path> {
        self.file_path.as_deref()
    }

    /// Add an address to the blacklist. Returns `Ok(true)` if newly added, `Ok(false)` if already present.
    /// Persists append-only when `file_path` is configured and the address is new.
    pub fn add(&mut self, addr: Address) -> Result<bool> {
        if !self.entries.insert(addr) {
            return Ok(false);
        }
        if let Some(ref path) = self.file_path {
            if let Some(parent) = path.parent() {
                if !parent.as_os_str().is_empty() {
                    create_dir_all(parent).with_context(|| {
                        format!("create blacklist parent dir {}", parent.display())
                    })?;
                }
            }
            let mut file = OpenOptions::new()
                .create(true)
                .append(true)
                .open(path)
                .with_context(|| format!("open blacklist file {} for append", path.display()))?;
            writeln!(file, "{addr:?}")
                .with_context(|| format!("append address to {}", path.display()))?;
            file.flush().context("flush blacklist file")?;
        }
        Ok(true)
    }
}

/// Circuit-breaker latch state tracking ghost fills locally.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct CircuitBreakerLatch {
    pub latched: bool,
    pub trigger_tx_hash: Option<H256>,
    pub trigger_count: u64,
    pub last_reason: Option<String>,
}

impl CircuitBreakerLatch {
    /// Latch the circuit breaker on a ghost fill.
    /// Returns `true` if this call transitioned from unlatched -> latched.
    pub fn latch(&mut self, tx_hash: H256, reason: impl Into<String>) -> bool {
        let newly_latched = !self.latched;
        self.latched = true;
        if self.trigger_tx_hash.is_none() {
            self.trigger_tx_hash = Some(tx_hash);
        }
        self.trigger_count = self.trigger_count.saturating_add(1);
        self.last_reason = Some(reason.into());
        newly_latched
    }

    pub fn reset(&mut self) {
        self.latched = false;
        self.trigger_tx_hash = None;
        self.trigger_count = 0;
        self.last_reason = None;
    }
}

/// Structured decision emitted by `evaluate_ghost_event`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DefenseAction {
    NoOp,
    BlacklistCounterparty {
        counterparty: Address,
        newly_added: bool,
        tx_hash: H256,
    },
    LatchAndAlert {
        tx_hash: H256,
        reason: String,
        counterparty: Option<Address>,
        blacklisted: bool,
        newly_latched: bool,
    },
}

/// Local defense coordinator combining policy, blacklist, and circuit-breaker latch.
#[derive(Debug, Clone)]
pub struct DefenseEngine {
    pub policy: DefensePolicy,
    pub blacklist: CounterpartyBlacklist,
    pub latch: CircuitBreakerLatch,
}

impl DefenseEngine {
    pub fn new(policy: DefensePolicy, blacklist: CounterpartyBlacklist) -> Self {
        Self {
            policy,
            blacklist,
            latch: CircuitBreakerLatch::default(),
        }
    }

    /// Evaluate a `FillVerdict` and update local defense state accordingly.
    pub fn evaluate_ghost_event(&mut self, verdict: &FillVerdict) -> Result<DefenseAction> {
        match verdict {
            FillVerdict::Real { .. } => Ok(DefenseAction::NoOp),
            FillVerdict::Ghost {
                tx_hash,
                reason,
                counterparty,
            } => self.apply_ghost(*tx_hash, reason.clone(), *counterparty),
            FillVerdict::Timeout { tx_hash } => {
                self.apply_ghost(*tx_hash, "timeout — no receipt".to_string(), None)
            }
        }
    }

    /// Evaluate a `GhostFillEvent` directly and update local defense state.
    pub fn evaluate_ghost_fill_event(&mut self, event: &GhostFillEvent) -> Result<DefenseAction> {
        self.apply_ghost(event.tx_hash, event.reason.clone(), event.counterparty)
    }

    fn apply_ghost(
        &mut self,
        tx_hash: H256,
        reason: String,
        counterparty: Option<Address>,
    ) -> Result<DefenseAction> {
        let mut newly_added = false;
        let mut blacklisted = false;
        if self.policy.auto_blacklist {
            if let Some(cp) = counterparty {
                newly_added = self.blacklist.add(cp)?;
                blacklisted = true;
            }
        }

        if self.policy.auto_cancel {
            let newly_latched = self.latch.latch(tx_hash, reason.clone());
            return Ok(DefenseAction::LatchAndAlert {
                tx_hash,
                reason,
                counterparty,
                blacklisted,
                newly_latched,
            });
        }

        if let Some(cp) = counterparty {
            if blacklisted {
                return Ok(DefenseAction::BlacklistCounterparty {
                    counterparty: cp,
                    newly_added,
                    tx_hash,
                });
            }
        }

        Ok(DefenseAction::NoOp)
    }

    /// Dispatch an authenticated verdict alert to the Node/TS bridge (zero CLOB keys in Rust).
    pub async fn dispatch_verdict_alert(
        &self,
        webhook_url: &str,
        verdict: &FillVerdict,
        auth: &CallbackAuthConfig,
    ) -> Result<StatusCode> {
        send_authenticated_verdict(webhook_url, verdict, auth).await
    }

    /// Dispatch an authenticated `GhostFillEvent` alert to the Node/TS bridge.
    pub async fn dispatch_ghost_event_alert(
        &self,
        webhook_url: &str,
        event: &GhostFillEvent,
        auth: &CallbackAuthConfig,
    ) -> Result<StatusCode> {
        send_authenticated_ghost_event(webhook_url, event, auth).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    fn sample_addr(byte: u8) -> Address {
        Address::repeat_byte(byte)
    }

    fn sample_tx(byte: u8) -> H256 {
        H256::repeat_byte(byte)
    }

    #[test]
    fn blacklist_add_dedup_and_reload_from_file() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("blacklist.txt");

        let mut bl = CounterpartyBlacklist::load_from_file(&path).unwrap();
        assert!(bl.is_empty());

        let attacker = sample_addr(0xaa);
        assert!(bl.add(attacker).unwrap());
        assert!(!bl.add(attacker).unwrap(), "duplicate insert must return false");
        assert!(bl.contains(&attacker));
        assert_eq!(bl.len(), 1);

        // Reload from disk and verify deduplicated persistence
        let reloaded = CounterpartyBlacklist::load_from_file(&path).unwrap();
        assert!(reloaded.contains(&attacker));
        assert_eq!(reloaded.len(), 1);

        let raw = std::fs::read_to_string(&path).unwrap();
        assert_eq!(raw.lines().count(), 1);
    }

    #[test]
    fn circuit_breaker_latch_tracks_first_trigger_and_count() {
        let mut latch = CircuitBreakerLatch::default();
        assert!(!latch.latched);
        assert_eq!(latch.trigger_count, 0);
        assert_eq!(latch.trigger_tx_hash, None);

        let tx1 = sample_tx(0x11);
        let tx2 = sample_tx(0x22);

        assert!(latch.latch(tx1, "TRANSFER_FROM_FAILED"));
        assert!(latch.latched);
        assert_eq!(latch.trigger_tx_hash, Some(tx1));
        assert_eq!(latch.trigger_count, 1);

        assert!(!latch.latch(tx2, "timeout"));
        assert!(latch.latched);
        assert_eq!(latch.trigger_tx_hash, Some(tx1));
        assert_eq!(latch.trigger_count, 2);

        latch.reset();
        assert!(!latch.latched);
        assert_eq!(latch.trigger_count, 0);
        assert_eq!(latch.trigger_tx_hash, None);
    }

    #[test]
    fn evaluate_ghost_event_handles_real_vs_ghost_vs_blacklist_only() {
        let dir = tempdir().unwrap();
        let bl = CounterpartyBlacklist::load_from_file(dir.path().join("bl.txt")).unwrap();
        let mut engine = DefenseEngine::new(DefensePolicy::default(), bl);

        // Real verdict -> NoOp, latch stays false
        let real = FillVerdict::Real {
            tx_hash: sample_tx(0x01),
            block: 61_000_000,
        };
        assert_eq!(engine.evaluate_ghost_event(&real).unwrap(), DefenseAction::NoOp);
        assert!(!engine.latch.latched);
        assert!(engine.blacklist.is_empty());

        // Ghost verdict -> LatchAndAlert + counterparty blacklisted
        let cp = sample_addr(0xde);
        let ghost_tx = sample_tx(0x02);
        let ghost = FillVerdict::Ghost {
            tx_hash: ghost_tx,
            reason: "TRANSFER_FROM_FAILED".to_string(),
            counterparty: Some(cp),
        };
        let action = engine.evaluate_ghost_event(&ghost).unwrap();
        assert_eq!(
            action,
            DefenseAction::LatchAndAlert {
                tx_hash: ghost_tx,
                reason: "TRANSFER_FROM_FAILED".to_string(),
                counterparty: Some(cp),
                blacklisted: true,
                newly_latched: true,
            }
        );
        assert!(engine.latch.latched);
        assert!(engine.blacklist.contains(&cp));

        // Blacklist-only policy -> BlacklistCounterparty without latching
        let mut bl_only = DefenseEngine::new(
            DefensePolicy {
                auto_cancel: false,
                auto_blacklist: true,
            },
            CounterpartyBlacklist::new(None),
        );
        let cp2 = sample_addr(0xbe);
        let ghost2 = FillVerdict::Ghost {
            tx_hash: sample_tx(0x03),
            reason: "reverted".to_string(),
            counterparty: Some(cp2),
        };
        assert_eq!(
            bl_only.evaluate_ghost_event(&ghost2).unwrap(),
            DefenseAction::BlacklistCounterparty {
                counterparty: cp2,
                newly_added: true,
                tx_hash: sample_tx(0x03),
            }
        );
        assert!(!bl_only.latch.latched);
    }

    #[tokio::test]
    async fn dispatch_verdict_alert_sends_authenticated_hmac_request() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        let srv = tokio::spawn(async move {
            let (mut sock, _) = listener.accept().await.unwrap();
            let mut buf = vec![0u8; 4096];
            let n = sock.read(&mut buf).await.unwrap();
            let req = String::from_utf8_lossy(&buf[..n]).to_string();
            let resp = "HTTP/1.1 200 OK\r\nContent-Length: 11\r\nConnection: close\r\n\r\n{\"ok\":true}";
            sock.write_all(resp.as_bytes()).await.unwrap();
            req
        });

        let engine = DefenseEngine::new(DefensePolicy::default(), CounterpartyBlacklist::new(None));
        let auth = CallbackAuthConfig::new("k-defense", "defense-secret-key-01");
        let verdict = FillVerdict::Ghost {
            tx_hash: sample_tx(0x44),
            reason: "TRANSFER_FROM_FAILED".to_string(),
            counterparty: Some(sample_addr(0x55)),
        };

        let status = engine
            .dispatch_verdict_alert(&format!("http://{addr}/ghost-alert"), &verdict, &auth)
            .await
            .unwrap();
        assert_eq!(status, StatusCode::OK);

        let raw_req = srv.await.unwrap().to_ascii_lowercase();
        assert!(raw_req.contains("x-ghostguard-signature:"));
        assert!(raw_req.contains("x-ghostguard-key-id: k-defense"));
        assert!(raw_req.contains("x-ghostguard-source: ghostguard-sidecar"));
    }
}
