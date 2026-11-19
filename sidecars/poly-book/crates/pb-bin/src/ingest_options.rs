//! Resolve the complete fixed universe before starting any runtime or network I/O.
use std::collections::HashSet;
use std::io::Read;
use std::path::PathBuf;

use anyhow::{bail, Context, Result};

use crate::commands::feed::FeedPlan;
use crate::settings::Settings;

const MAX_TOKENS_FILE_BYTES: u64 = 1024 * 1024;
const MAX_TOKEN: &str =
    "115792089237316195423570985008687907853269984665640564039457584007913129639935";

#[derive(Debug)]
pub struct ConfigurationError(pub anyhow::Error);

impl std::fmt::Display for ConfigurationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "ingest configuration: {:#}", self.0)
    }
}

impl std::error::Error for ConfigurationError {}

pub fn configuration<T>(result: Result<T>) -> Result<T> {
    result.map_err(|error| ConfigurationError(error).into())
}

pub fn resolve(
    tokens: Option<String>,
    tokens_file: Option<PathBuf>,
    auto_rotate: bool,
) -> Result<FeedPlan> {
    if usize::from(tokens.is_some()) + usize::from(tokens_file.is_some()) + usize::from(auto_rotate)
        != 1
    {
        bail!("choose exactly one of --tokens, --tokens-file, or --auto-rotate");
    }
    if auto_rotate {
        return Ok(FeedPlan::AutoRotate);
    }
    let raw;
    let parts: Vec<&str> = if let Some(path) = tokens_file {
        // Check before opening too: opening a FIFO would otherwise block preflight indefinitely.
        if !std::fs::metadata(&path)
            .with_context(|| format!("cannot inspect tokens file {}", path.display()))?
            .is_file()
        {
            bail!("tokens file must be a regular file");
        }
        let file = std::fs::File::open(&path)
            .with_context(|| format!("cannot open tokens file {}", path.display()))?;
        if !file.metadata()?.is_file() {
            bail!("tokens file must be a regular file");
        }
        let mut bytes = Vec::new();
        file.take(MAX_TOKENS_FILE_BYTES + 1)
            .read_to_end(&mut bytes)?;
        if bytes.len() as u64 > MAX_TOKENS_FILE_BYTES {
            bail!("tokens file exceeds {MAX_TOKENS_FILE_BYTES} bytes");
        }
        raw = String::from_utf8(bytes).context("tokens file must be UTF-8")?;
        raw.lines().collect()
    } else {
        raw = tokens.expect("exactly one token source checked above");
        raw.split(',').collect()
    };
    if parts.is_empty() {
        bail!("token universe must not be empty");
    }
    let mut seen = HashSet::new();
    let mut result = Vec::with_capacity(parts.len());
    for (index, raw) in parts.into_iter().enumerate() {
        let token = raw.trim();
        if token.is_empty()
            || !token.bytes().all(|b| b.is_ascii_digit())
            || token.starts_with('0')
            || token.len() > MAX_TOKEN.len()
            || (token.len() == MAX_TOKEN.len() && token > MAX_TOKEN)
        {
            bail!(
                "token {} must be a canonical positive decimal uint256 ID",
                index + 1
            );
        }
        if !seen.insert(token.to_owned()) {
            bail!("duplicate token ID at position {}", index + 1);
        }
        // Preserve the declared order; never discover, sample, sort, or deduplicate silently.
        result.push(token.to_owned());
    }
    Ok(FeedPlan::Fixed(result))
}

pub fn validate_settings(settings: &Settings) -> Result<()> {
    for (key, value, schemes) in [
        ("feed.ws_url", &settings.feed.ws_url, &["ws", "wss"][..]),
        (
            "feed.rest_url",
            &settings.feed.rest_url,
            &["http", "https"][..],
        ),
        (
            "feed.gamma_url",
            &settings.feed.gamma_url,
            &["http", "https"][..],
        ),
    ] {
        let url = url::Url::parse(value).with_context(|| format!("invalid {key}"))?;
        if !schemes.contains(&url.scheme()) || url.host_str().is_none() {
            bail!("invalid scheme or host in {key}");
        }
    }
    Ok(())
}

pub fn print_validation(
    config: &str,
    settings: &Settings,
    plan: &FeedPlan,
    parquet: bool,
    metrics: bool,
) -> Result<()> {
    let (mode, tokens) = match plan {
        FeedPlan::Fixed(tokens) => ("fixed", tokens.as_slice()),
        FeedPlan::AutoRotate => ("auto-rotate", &[][..]),
    };
    let summary = serde_json::json!({
        "valid": true,
        "config": config,
        "mode": mode,
        "tokens": tokens,
        "parquet": parquet,
        "metrics": metrics,
        "wal_base_path": settings.wal.base_path,
        "parquet_base_path": settings.storage.parquet_base_path,
        "parquet_flush_interval_secs": settings.storage.parquet_flush_interval_secs,
        "metrics_listen_addr": settings.metrics.listen_addr.to_string(),
        "logging_format": settings.logging.format,
    });
    serde_json::to_writer(std::io::stdout().lock(), &summary)?;
    Ok(())
}
