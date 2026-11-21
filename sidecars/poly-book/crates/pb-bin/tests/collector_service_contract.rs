//! Runs the shipped parser, not a source-text approximation of its CLI.
use std::path::Path;
use std::process::{Command, Output};

const SERVICE: &str =
    include_str!("../../../../../infra/poly-collector/poly-book-collector.service");
const MAX_TOKEN: &str =
    "115792089237316195423570985008687907853269984665640564039457584007913129639935";

fn command(root: &Path) -> Command {
    let mut command = Command::new(env!("CARGO_BIN_EXE_poly-book"));
    command.env_clear().current_dir(root);
    command
}

fn fixture() -> tempfile::TempDir {
    let root = tempfile::tempdir().unwrap();
    std::fs::write(
        root.path().join("collector.toml"),
        "[feed]\nws_url='ws://127.0.0.1:1'\nrest_url='http://127.0.0.1:1'\ngamma_url='http://127.0.0.1:1'\n",
    )
    .unwrap();
    std::fs::write(root.path().join("tokens.txt"), "123\n456\n").unwrap();
    root
}

fn validate(root: &Path, args: &[&str]) -> Output {
    command(root)
        .args(["--config", "collector.toml", "ingest"])
        .args(args)
        .arg("--validate-only")
        .output()
        .unwrap()
}

fn success(output: Output) -> serde_json::Value {
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    serde_json::from_slice(&output.stdout).unwrap()
}

fn rejected(output: Output, code: i32) {
    assert_eq!(output.status.code(), Some(code), "{output:?}");
    assert!(!output.stderr.is_empty());
}

#[test]
fn collector_tokens_file_validates_offline_in_the_real_executable() {
    let root = fixture();
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    listener.set_nonblocking(true).unwrap();
    let addr = listener.local_addr().unwrap().to_string();
    let run = || {
        command(root.path())
            .args([
                "--config",
                "collector.toml",
                "ingest",
                "--tokens-file",
                "tokens.txt",
            ])
            .args(["--parquet=true", "--metrics=true", "--validate-only"])
            .env("PB__FEED__WS_URL", format!("ws://{addr}"))
            .env("PB__FEED__REST_URL", format!("http://{addr}"))
            .env("PB__FEED__GAMMA_URL", format!("http://{addr}"))
            .env("PB__METRICS__LISTEN_ADDR", &addr)
            .output()
            .unwrap()
    };
    std::fs::write(
        root.path().join("tokens.txt"),
        format!(" 456\r\n123\r\n{MAX_TOKEN}\r\n"),
    )
    .unwrap();
    let first = success(run());
    assert_eq!(
        first["tokens"],
        serde_json::json!(["456", "123", MAX_TOKEN])
    );
    assert_eq!(first["mode"], "fixed");
    assert_eq!(first, success(run()));
    assert_eq!(
        listener.accept().unwrap_err().kind(),
        std::io::ErrorKind::WouldBlock
    );
    assert!(!root.path().join("data").exists());
    assert_eq!(std::fs::read_dir(root.path()).unwrap().count(), 2);
}

#[test]
fn collector_rejects_invalid_missing_and_ambiguous_universes_before_startup() {
    let root = fixture();
    for invalid in [
        "",
        "\n",
        "123\n\n456\n",
        "123\n123\n",
        "0\n",
        "01\n",
        "-1\n",
        "+1\n",
        "1.5\n",
        "1e3\n",
        "123,456\n",
        "# comment\n",
        "١٢٣\n",
        "115792089237316195423570985008687907853269984665640564039457584007913129639936\n",
    ] {
        std::fs::write(root.path().join("tokens.txt"), invalid).unwrap();
        rejected(validate(root.path(), &["--tokens-file", "tokens.txt"]), 78);
    }
    std::fs::write(root.path().join("tokens.txt"), [0xff]).unwrap();
    rejected(validate(root.path(), &["--tokens-file", "tokens.txt"]), 78);
    std::fs::write(root.path().join("tokens.txt"), vec![b'1'; 1024 * 1024 + 1]).unwrap();
    rejected(validate(root.path(), &["--tokens-file", "tokens.txt"]), 78);
    for args in [
        vec![],
        vec!["--tokens-file", "absent.txt"],
        vec!["--tokens-file", "."],
        vec!["--tokens", ""],
        vec!["--tokens", "1,,2"],
        vec!["--tokens", "1,1"],
    ] {
        rejected(validate(root.path(), &args), 78);
    }
    for args in [
        vec!["--tokens-file", "tokens.txt", "--tokens", "123"],
        vec!["--tokens-file", "tokens.txt", "--auto-rotate"],
        vec!["--tokens", "123", "--auto-rotate"],
        vec!["--tokens-file", "tokens.txt", "--tokens-file", "other.txt"],
        vec!["--tokens", "123", "--unknown"],
    ] {
        rejected(validate(root.path(), &args), 2);
    }
    std::fs::write(root.path().join("tokens.txt"), "invalid\n").unwrap();
    rejected(
        command(root.path())
            .args([
                "--config",
                "collector.toml",
                "ingest",
                "--tokens-file",
                "tokens.txt",
            ])
            .output()
            .unwrap(),
        78,
    );
    assert!(!root.path().join("data").exists());
}

#[test]
fn collector_validates_config_and_typed_pb_overrides_without_runtime_writes() {
    let root = fixture();
    rejected(
        command(root.path())
            .args([
                "--config",
                "missing.toml",
                "ingest",
                "--tokens",
                "123",
                "--validate-only",
            ])
            .output()
            .unwrap(),
        78,
    );
    for config in [
        "[wal]\nsegment_size_md=64\n",
        "[wal",
        "[feed]\nws_url='https://127.0.0.1'\n",
    ] {
        std::fs::write(root.path().join("collector.toml"), config).unwrap();
        rejected(validate(root.path(), &["--tokens", "123"]), 78);
    }
    std::fs::write(root.path().join("collector.toml"), "").unwrap();
    for (key, value) in [
        ("PB__WAL__BASE_PTH", "/tmp/no"),
        ("PB__METRICS__LISTEN_ADDR", "bad"),
        ("PB__STORAGE__PARQUET_FLUSH_INTERVAL_SECS", "-1"),
    ] {
        rejected(
            command(root.path())
                .args([
                    "--config",
                    "collector.toml",
                    "ingest",
                    "--tokens",
                    "123",
                    "--validate-only",
                ])
                .env(key, value)
                .output()
                .unwrap(),
            78,
        );
    }
    let fixed = success(validate(
        root.path(),
        &["--tokens", "456, 123", "--parquet=false", "--metrics=false"],
    ));
    assert_eq!(fixed["tokens"], serde_json::json!(["456", "123"]));
    assert_eq!(fixed["parquet"], false);
    assert_eq!(fixed["metrics"], false);
    assert_eq!(
        success(validate(root.path(), &["--auto-rotate"]))["mode"],
        "auto-rotate"
    );
    assert!(!root.path().join("data").exists());
}

// Only the unit's continued command lines are folded; this is not a systemd runtime emulator.
fn unit_values(key: &str) -> Vec<String> {
    SERVICE
        .replace("\\\n", " ")
        .lines()
        .filter_map(|line| line.strip_prefix(key).map(str::to_owned))
        .collect()
}

#[test]
fn collector_unit_argv_and_environment_are_accepted_by_the_pinned_executable() {
    let root = fixture();
    let start = unit_values("ExecStart=");
    assert_eq!(start.len(), 1);
    let args: Vec<&str> = start[0].split_whitespace().collect();
    assert_eq!(
        args,
        [
            "/opt/poly-collector/bin/poly-book",
            "--config",
            "/etc/poly-collector/collector.toml",
            "ingest",
            "--tokens-file",
            "/etc/poly-collector/tokens.txt",
            "--parquet=true",
            "--metrics=true"
        ]
    );
    let conditions = unit_values("ExecCondition=");
    assert_eq!(conditions.len(), 2);
    assert_eq!(
        conditions[0].split_whitespace().collect::<Vec<_>>(),
        [args.clone(), vec!["--validate-only"]].concat()
    );
    assert!(conditions[1].contains("NTPSynchronized"));
    let mut cmd = command(root.path());
    for arg in args.iter().skip(1) {
        cmd.arg(match *arg {
            "/etc/poly-collector/collector.toml" => {
                root.path().join("collector.toml").into_os_string()
            }
            "/etc/poly-collector/tokens.txt" => root.path().join("tokens.txt").into_os_string(),
            other => other.into(),
        });
    }
    for env in unit_values("Environment=") {
        let (key, value) = env.split_once('=').unwrap();
        assert!(!key.contains("R2") && !key.contains("AWS") && !key.contains("SECRET"));
        cmd.env(key, value);
    }
    let value = success(cmd.arg("--validate-only").output().unwrap());
    assert_eq!(value["wal_base_path"], "/var/lib/poly-collector/wal");
    assert_eq!(
        value["parquet_base_path"],
        "/var/lib/poly-collector/parquet"
    );
    assert_eq!(value["parquet_flush_interval_secs"], 300);
    assert_eq!(value["metrics_listen_addr"], "127.0.0.1:9090");
    assert_eq!(value["logging_format"], "json");
    assert!(unit_values("EnvironmentFile=").is_empty());
    assert_eq!(unit_values("Restart="), ["on-failure"]);
    assert_eq!(unit_values("RestartPreventExitStatus="), ["2 78"]);
    assert_eq!(unit_values("StartLimitBurst="), ["3"]);
    assert_eq!(unit_values("StartLimitIntervalSec="), ["300"]);
    assert_eq!(unit_values("RestartSec="), ["10"]);
    assert_eq!(unit_values("TimeoutStopSec="), ["30"]);
    assert_eq!(unit_values("KillSignal="), ["SIGTERM"]);
}

#[test]
fn collector_binary_exposes_its_version_and_validation_schema() {
    let root = fixture();
    let output = command(root.path()).arg("--version").output().unwrap();
    assert!(output.status.success());
    assert_eq!(
        String::from_utf8(output.stdout).unwrap().trim(),
        "poly-book 0.1.0"
    );
    let output = command(root.path())
        .args(["ingest", "--help"])
        .output()
        .unwrap();
    assert!(output.status.success());
    let help = String::from_utf8(output.stdout).unwrap();
    for flag in [
        "--tokens-file",
        "--validate-only",
        "--parquet",
        "--metrics",
        "--auto-rotate",
    ] {
        assert!(help.contains(flag), "{help}");
    }
}
