//! Offline executable durability test: every feed endpoint is bound to loopback.
#![cfg(unix)]

use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use futures_util::{SinkExt, StreamExt};
use pb_replay::EventReader;
use tokio_tungstenite::tungstenite::Message;

struct ChildGuard(Child);
impl Drop for ChildGuard {
    fn drop(&mut self) {
        if !matches!(self.0.try_wait(), Ok(Some(_))) {
            let _ = self.0.kill();
            let _ = self.0.wait();
        }
    }
}

struct TaskGuard(tokio::task::JoinHandle<()>);
impl Drop for TaskGuard {
    fn drop(&mut self) {
        self.0.abort();
    }
}

fn parquet_files(root: &std::path::Path) -> usize {
    let Ok(entries) = std::fs::read_dir(root) else {
        return 0;
    };
    entries
        .map(|entry| {
            let path = entry.unwrap().path();
            if path.is_dir() {
                parquet_files(&path)
            } else {
                usize::from(path.extension().is_some_and(|ext| ext == "parquet"))
            }
        })
        .sum()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn collector_sigterm_flushes_buffered_wal_and_parquet_from_the_real_executable() {
    let root = tempfile::tempdir().unwrap();
    let feed = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let feed_addr = feed.local_addr().unwrap();
    // A listener reserves this address until the child is ready to bind metrics.
    let reserved = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let metrics_addr = reserved.local_addr().unwrap();
    let timestamp_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;
    let (sub_tx, sub_rx) = tokio::sync::oneshot::channel();
    let mut server = TaskGuard(tokio::spawn(async move {
        let (tcp, _) = feed.accept().await.unwrap();
        let mut ws = tokio_tungstenite::accept_async(tcp).await.unwrap();
        let Message::Text(subscription) = ws.next().await.unwrap().unwrap() else {
            panic!("expected real collector subscription");
        };
        let subscription: serde_json::Value = serde_json::from_str(&subscription).unwrap();
        sub_tx.send(subscription).unwrap();
        let book = serde_json::json!({
            "event_type": "book", "asset_id": "123", "timestamp": timestamp_ms.to_string(),
            "bids": [{"price": "0.45", "size": "10"}],
            "asks": [{"price": "0.55", "size": "20"}], "hash": "offline-book"
        });
        ws.send(Message::Text(book.to_string().into()))
            .await
            .unwrap();
        while let Some(message) = ws.next().await {
            match message.unwrap() {
                Message::Ping(data) => ws.send(Message::Pong(data)).await.unwrap(),
                Message::Close(_) => break,
                _ => {}
            }
        }
    }));
    // Disable checkpoints so this test cannot make a REST request; REST and Gamma
    // also point at loopback, and the HTTP client below explicitly bypasses proxies.
    let config = format!(
        "[feed]\nws_url='ws://{feed_addr}'\nrest_url='http://{feed_addr}'\ngamma_url='http://{feed_addr}'\n\
         [storage]\nparquet_base_path='parquet'\nparquet_flush_interval_secs=3600\ncheckpoints_enabled=false\n\
         [metrics]\nlisten_addr='{metrics_addr}'\n\
         [wal]\nbase_path='wal'\nflush_interval_ms=3600000\nsync_interval_ms=3600000\n"
    );
    std::fs::write(root.path().join("collector.toml"), config).unwrap();
    std::fs::write(root.path().join("tokens.txt"), "123\n456\n").unwrap();
    let log = std::fs::File::create(root.path().join("collector.log")).unwrap();
    drop(reserved);
    let mut child = ChildGuard(
        Command::new(env!("CARGO_BIN_EXE_poly-book"))
            .env_clear()
            .env("TOKIO_WORKER_THREADS", "2")
            .current_dir(root.path())
            .args([
                "--config",
                "collector.toml",
                "ingest",
                "--tokens-file",
                "tokens.txt",
                "--parquet=true",
                "--metrics=true",
            ])
            .stdout(Stdio::from(log.try_clone().unwrap()))
            .stderr(Stdio::from(log))
            .spawn()
            .unwrap(),
    );
    let subscription = tokio::time::timeout(Duration::from_secs(10), sub_rx)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        subscription["assets_ids"],
        serde_json::json!(["123", "456"])
    );
    assert_eq!(subscription["type"], "market");
    let http = reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(1))
        .build()
        .unwrap();
    let deadline = Instant::now() + Duration::from_secs(10);
    loop {
        assert!(
            child.0.try_wait().unwrap().is_none(),
            "collector exited before SIGTERM"
        );
        if let Ok(response) = http
            .get(format!("http://{metrics_addr}/metrics"))
            .send()
            .await
        {
            let text = response.text().await.unwrap();
            if text.lines().any(|line| {
                line.starts_with("pb_messages_received_total{")
                    && line.contains("event_type=\"snapshot\"")
                    && line.ends_with(" 2")
            }) {
                break;
            }
        }
        assert!(
            Instant::now() < deadline,
            "snapshot was not accepted by dispatcher"
        );
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    assert_eq!(
        parquet_files(&root.path().join("parquet")),
        0,
        "must test final flush, not periodic flush"
    );
    let stopped_at = Instant::now();
    assert!(Command::new("/bin/kill")
        .args(["-TERM", &child.0.id().to_string()])
        .status()
        .unwrap()
        .success());
    let status = loop {
        if let Some(status) = child.0.try_wait().unwrap() {
            break status;
        }
        assert!(
            stopped_at.elapsed() < Duration::from_secs(8),
            "collector did not stop before service deadline"
        );
        tokio::time::sleep(Duration::from_millis(20)).await;
    };
    let logs = std::fs::read_to_string(root.path().join("collector.log")).unwrap();
    assert!(status.success(), "{status}: {logs}");
    assert!(logs.contains("received SIGTERM"), "{logs}");
    assert!(logs.contains("graceful shutdown complete"), "{logs}");
    assert!(
        !logs.contains("timeout") && !logs.contains("panicked"),
        "{logs}"
    );
    assert!(parquet_files(&root.path().join("parquet")) > 0);
    let wal_config = pb_wal::WalConfig {
        base_path: root.path().join("wal"),
        ..Default::default()
    };
    let mut reader = pb_wal::WalReader::open_from_start(wal_config, "service-contract").unwrap();
    let mut wal_books = Vec::new();
    while let Some(payload) = reader.next().unwrap() {
        if let pb_types::PersistedRecord::Book(book) = pb_wal::codec::decode(&payload).unwrap() {
            wal_books.push(book);
        }
    }
    assert_eq!(
        wal_books.len(),
        2,
        "shutdown must sync both buffered book records"
    );
    let parquet = pb_replay::ParquetReader::new(root.path().join("parquet"));
    let window = parquet
        .read_market_data(
            &pb_types::AssetId::new("123"),
            timestamp_ms * 1000 - 1_000_000,
            timestamp_ms * 1000 + 5_000_000,
        )
        .await
        .unwrap();
    assert_eq!(
        window.book_events, wal_books,
        "final Parquet row group must equal durable WAL"
    );
    tokio::time::timeout(Duration::from_secs(2), &mut server.0)
        .await
        .unwrap()
        .unwrap();
}
