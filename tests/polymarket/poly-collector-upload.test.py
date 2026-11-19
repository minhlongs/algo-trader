"""Run with python3 -I -B .../poly-collector-upload.test.py; no third-party deps."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import runpy
import subprocess
from unittest import mock
import tempfile
import time
import unittest

REPO = Path(__file__).resolve().parents[2]
UPLOADER = REPO / "infra/poly-collector/poly-collector-upload.sh"
TRANSPORT = Path(__file__).with_name("uploader-fake-transport.py")
BASH = shutil.which("bash")
if BASH is None:
    raise RuntimeError("bash executable not found on PATH")
HOUR = "2026/11/18/12"
BATCH = "2026-11-18-12"


def digest(content):
    return hashlib.sha256(content).hexdigest()


def snapshot(root):
    result = {}
    for path in sorted(root.rglob("*")):
        info = path.lstat()
        value = os.readlink(path) if path.is_symlink() else path.read_bytes() if path.is_file() else None
        result[str(path.relative_to(root))] = (info.st_mode, info.st_mtime_ns, value)
    return result


class UploaderTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="poly-uploader-test-")
        self.root = Path(self.temp.name).resolve()
        self.data = self.root / "data"
        self.batch = self.data / "staging" / BATCH
        self.batch.mkdir(parents=True)
        self.content = b"TEST_ONLY WAL bytes\x00\xff\n"
        self.source = self.batch / "part.wal"
        self.source.write_bytes(self.content)
        self.remote = self.root / "remote"
        self.remote.mkdir()
        self.bin = self.root / "bin"
        self.bin.mkdir()
        for name in ("rclone", "aws"):
            executable = self.bin / name
            shutil.copyfile(TRANSPORT, executable)
            executable.chmod(0o700)
        # The baseline uses Linux flock; this equivalent holds the inherited fd
        # on macOS too. Sleep is removed only to bound baseline retry tests.
        self.executable("flock", "#!/usr/bin/env python3\nimport fcntl,sys\nfcntl.flock(int(sys.argv[-1]),fcntl.LOCK_EX|fcntl.LOCK_NB)\n")
        self.executable("sleep", "#!/bin/sh\nexit 0\n")
        self.env = {
            "PATH": str(self.bin) + os.pathsep + os.environ["PATH"],
            "HOME": str(self.root), "TMPDIR": str(self.root),
            "R2_BUCKET": "offline-test", "R2_ENDPOINT": "https://offline.invalid",
            "R2_PREFIX": "test-prefix", "POLY_COLLECTOR_DATA_ROOT": str(self.data),
            "POLY_COLLECTOR_UPLOAD_LOG": str(self.root / "logs/upload.jsonl"),
            "POLY_COLLECTOR_LOG": str(self.root / "collector.log"),
            "UPLOAD_MAX_RETRIES": "2", "FAKE_REMOTE": str(self.remote),
        }
        self.children = []

    def tearDown(self):
        for child in self.children:
            if child.poll() is None:
                os.killpg(child.pid, signal.SIGKILL)
                child.communicate(timeout=5)
        self.temp.cleanup()

    def executable(self, name, content):
        path = self.bin / name
        path.write_text(content)
        path.chmod(0o700)

    def run_upload(self, hour=HOUR, **env):
        return subprocess.run([BASH, str(UPLOADER), hour], env=self.env | env,
                              cwd=REPO, capture_output=True, timeout=20)

    def start_upload(self, **env):
        child = subprocess.Popen([BASH, str(UPLOADER), HOUR], env=self.env | env,
                                 cwd=REPO, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                 start_new_session=True)
        self.children.append(child)
        return child

    def wait_ready(self, child):
        deadline = time.monotonic() + 10
        while not (self.remote / "ready").exists():
            if child.poll() is not None or time.monotonic() > deadline:
                out, err = child.communicate(timeout=5)
                self.fail(f"transport barrier not reached: {child.returncode} {out!r} {err!r}")
            time.sleep(0.01)

    def receipt(self):
        path = self.data / "manifests" / f"manifest-{BATCH}.json"
        return json.loads(path.read_bytes()) if path.exists() else None

    def require_receipt(self):
        value = self.receipt()
        self.assertIsInstance(value, dict, "expected local receipt manifest")
        assert isinstance(value, dict)
        return value

    def assert_not_committed(self):
        value = self.receipt()
        self.assertFalse(value and value.get("status") in ("SEALED_VERIFIED", "ARCHIVED_VERIFIED"))
        self.assertFalse((self.batch / ".uploaded-verified").exists())

    def test_dry_run_is_strictly_read_only_even_under_retention_pressure(self):
        old = self.data / "staging/2000-01-01-00"
        old.mkdir()
        (old / "precious.wal").write_bytes(b"keep")
        marker = old / ".uploaded-verified"
        marker.touch()
        os.utime(marker, (1, 1))
        before = snapshot(self.root)
        result = self.run_upload(DRY_RUN="1", LOCAL_RETENTION_HOURS="0", LOCAL_DISK_CEILING_PCT="100")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(snapshot(self.root), before)
        self.assertEqual(json.loads(result.stdout)["mode"], "PLAN_ONLY")

    def test_missing_interval_dry_run_creates_no_directories_or_gap_markers(self):
        shutil.rmtree(self.data)
        before = snapshot(self.root)
        result = self.run_upload(DRY_RUN="1")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(snapshot(self.root), before)

    def test_success_preserves_source_and_ignores_unauthorized_prune_settings(self):
        result = self.run_upload(LOCAL_DISK_CEILING_PCT="0", LOCAL_RETENTION_HOURS="-1")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.source.read_bytes(), self.content)
        self.assertEqual(self.require_receipt()["status"], "ARCHIVED_VERIFIED")
        self.assertFalse((self.batch / ".uploaded-verified").exists())

    def test_canonical_manifest_and_digest_bound_keys_verified_by_download(self):
        odd = self.batch / 'quote"and\nline.jsonl'
        odd.write_bytes(b"{}\n")
        result = self.run_upload()
        self.assertEqual(result.returncode, 0, result.stderr)
        receipt = self.require_receipt()
        body = (self.remote / receipt["manifestKey"]).read_bytes()
        self.assertEqual(digest(body), receipt["manifestSha256"])
        self.assertIn(receipt["manifestSha256"], receipt["manifestKey"])
        manifest = json.loads(body)
        canonical = json.dumps(manifest, sort_keys=True, ensure_ascii=True, separators=(",", ":")).encode("ascii")
        self.assertEqual(body, canonical)
        for entry in manifest["files"]:
            self.assertIn(entry["sha256"], entry["objectKey"])
            self.assertEqual(digest((self.remote / entry["objectKey"]).read_bytes()), entry["sha256"])
        calls = [json.loads(line) for line in (self.remote / "calls.jsonl").read_text().splitlines()]
        self.assertTrue(any(call["op"] == "get-object" and call["key"] == receipt["manifestKey"] for call in calls))

    def test_retry_is_idempotent_and_changed_bytes_get_new_keys(self):
        self.assertEqual(self.run_upload().returncode, 0)
        first = self.require_receipt()
        before = {str(p.relative_to(self.remote)): p.read_bytes() for p in self.remote.rglob("*") if p.is_file() and p.name != "calls.jsonl"}
        self.assertEqual(self.run_upload().returncode, 0)
        self.assertEqual(self.require_receipt(), first)
        self.assertEqual({str(p.relative_to(self.remote)): p.read_bytes() for p in self.remote.rglob("*") if p.is_file() and p.name != "calls.jsonl"}, before)
        self.source.write_bytes(b"different bytes")
        self.assertNotEqual(self.run_upload().returncode, 0, "a committed hour must not silently change")
        self.assertEqual(self.require_receipt(), first)

    def test_same_length_remote_corruption_is_not_committed(self):
        result = self.run_upload(FAKE_MODE="corrupt-data")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.source.read_bytes(), self.content)
        self.assert_not_committed()

    def test_manifest_corruption_is_not_committed(self):
        result = self.run_upload(FAKE_MODE="corrupt-manifest")
        self.assertNotEqual(result.returncode, 0)
        self.assert_not_committed()

    def test_upload_and_download_failures_preserve_source(self):
        for mode in ("upload-failure", "download-failure"):
            with self.subTest(mode=mode):
                self.assertNotEqual(self.run_upload(FAKE_MODE=mode).returncode, 0)
                self.assertEqual(self.source.read_bytes(), self.content)
                self.assert_not_committed()

    def test_lost_put_response_recovers_by_remote_digest(self):
        result = self.run_upload(FAKE_MODE="lost-put-response")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.require_receipt()["status"], "ARCHIVED_VERIFIED")

    def test_traversal_invalid_dates_and_invalid_configuration_are_rejected_without_writes(self):
        before = snapshot(self.root)
        for hour in ("../../../../escape", "2026/02/30/00", "2026/11/18/99", HOUR + "/.."):
            with self.subTest(hour=hour):
                self.assertNotEqual(self.run_upload(hour).returncode, 0)
        for config in ({"R2_PREFIX": "../escape"}, {"POLY_UPLOAD_TOOL": "unexpected"},
                       {"UPLOAD_MAX_RETRIES": "0"}, {"R2_ENDPOINT": "http://offline.invalid"}):
            with self.subTest(config=config):
                self.assertNotEqual(self.run_upload(**config).returncode, 0)
        self.assertEqual(snapshot(self.root), before)

    def test_symlink_in_source_tree_or_any_ancestor_is_rejected(self):
        victim = self.root / "victim"
        victim.mkdir()
        (victim / "outside.wal").write_bytes(b"private")
        link = self.batch / "link"
        link.symlink_to(victim, target_is_directory=True)
        self.assertNotEqual(self.run_upload().returncode, 0)
        link.unlink()
        alias = self.root / "alias"
        alias.symlink_to(self.data, target_is_directory=True)
        self.assertNotEqual(self.run_upload(POLY_COLLECTOR_DATA_ROOT=str(alias)).returncode, 0)
        staging = self.data / "staging"
        staging.rename(self.data / "real-staging")
        staging.symlink_to(self.data / "real-staging", target_is_directory=True)
        self.assertNotEqual(self.run_upload().returncode, 0)
        self.assertEqual((victim / "outside.wal").read_bytes(), b"private")
        self.assert_not_committed()

    def test_path_substitution_during_upload_is_detected(self):
        victim = self.root / "victim.wal"
        victim.write_bytes(b"do not upload me")
        result = self.run_upload(FAKE_MODE="swap-file", FAKE_SOURCE=str(self.source), FAKE_VICTIM=str(victim))
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(Path(str(self.source) + ".saved").read_bytes(), self.content)
        self.assertEqual(victim.read_bytes(), b"do not upload me")
        self.assert_not_committed()

    def test_batch_ancestor_substitution_during_upload_is_detected(self):
        victim = self.root / "victim-dir"
        victim.mkdir()
        (victim / "part.wal").write_bytes(b"private")
        result = self.run_upload(FAKE_MODE="swap-batch", FAKE_SOURCE=str(self.batch), FAKE_VICTIM=str(victim))
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(Path(str(self.batch) + ".saved/part.wal").read_bytes(), self.content)
        self.assertEqual((victim / "part.wal").read_bytes(), b"private")
        self.assert_not_committed()

    def test_in_place_source_mutation_during_upload_is_detected(self):
        result = self.run_upload(FAKE_MODE="mutate-file", FAKE_SOURCE=str(self.source))
        self.assertNotEqual(result.returncode, 0)
        self.assert_not_committed()

    def test_concurrent_retry_does_not_claim_success_or_commit_early(self):
        first = self.start_upload(FAKE_MODE="pause")
        self.wait_ready(first)
        second = self.run_upload()
        self.assertNotEqual(second.returncode, 0)
        self.assert_not_committed()
        (self.remote / "release").touch()
        out, err = first.communicate(timeout=15)
        self.assertEqual(first.returncode, 0, (out, err))
        self.assertEqual(self.run_upload().returncode, 0)
        self.assertEqual(self.source.read_bytes(), self.content)

    def test_interrupt_preserves_source_and_releases_lock_for_retry(self):
        child = self.start_upload(FAKE_MODE="pause")
        self.wait_ready(child)
        child.send_signal(signal.SIGTERM)
        child.communicate(timeout=10)
        self.assertNotEqual(child.returncode, 0)
        self.assertEqual(self.source.read_bytes(), self.content)
        self.assert_not_committed()
        self.assertEqual(self.run_upload().returncode, 0)

    def test_aws_uses_conditional_writes_and_download_hash_verification(self):
        result = self.run_upload(POLY_UPLOAD_TOOL="aws", FAKE_MODE="corrupt-data")
        self.assertNotEqual(result.returncode, 0)
        self.assert_not_committed()
        calls = [json.loads(line) for line in (self.remote / "calls.jsonl").read_text().splitlines()]
        puts = [call for call in calls if call["op"] == "put-object"]
        self.assertTrue(puts)
        self.assertTrue(all(call["conditional"] for call in puts))

    def test_remote_creation_race_never_overwrites_other_bytes(self):
        result = self.run_upload(FAKE_MODE="remote-race")
        self.assertNotEqual(result.returncode, 0)
        objects = list(self.remote.glob("**/objects/sha256/*"))
        self.assertEqual(len(objects), 1)
        self.assertEqual(objects[0].read_bytes(), b"another writer's bytes")
        self.assertEqual(self.source.read_bytes(), self.content)
        self.assert_not_committed()

    def test_rclone_execution_is_rejected_before_any_writes(self):
        before = snapshot(self.root)
        result = self.run_upload(POLY_UPLOAD_TOOL="rclone")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(snapshot(self.root), before)
        result = self.run_upload(POLY_UPLOAD_TOOL="rclone", DRY_RUN="1")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(snapshot(self.root), before)

    def test_symlinked_lock_manifest_directory_and_receipt_do_not_touch_victim(self):
        victim = self.root / "victim"
        victim.mkdir()
        sentinel = victim / "sentinel"
        sentinel.write_bytes(b"private")
        lock = self.data / "upload.lock"
        lock.symlink_to(sentinel)
        self.assertNotEqual(self.run_upload().returncode, 0)
        self.assertEqual(sentinel.read_bytes(), b"private")
        lock.unlink()
        manifests = self.data / "manifests"
        manifests.symlink_to(victim, target_is_directory=True)
        self.assertNotEqual(self.run_upload().returncode, 0)
        self.assertEqual(list(victim.iterdir()), [sentinel])
        manifests.unlink()
        manifests.mkdir()
        (manifests / f"manifest-{BATCH}.json").symlink_to(sentinel)
        self.assertNotEqual(self.run_upload().returncode, 0)
        self.assertEqual(sentinel.read_bytes(), b"private")

    def test_special_file_and_hardlink_are_rejected_without_remote_calls(self):
        special = self.batch / "pipe.wal"
        os.mkfifo(special)
        self.assertNotEqual(self.run_upload().returncode, 0)
        self.assertEqual(list(self.remote.iterdir()), [])
        special.unlink()
        os.link(self.source, self.batch / "linked.wal")
        self.assertNotEqual(self.run_upload().returncode, 0)
        self.assertEqual(list(self.remote.iterdir()), [])

    def test_plan_is_deterministic_and_does_not_refresh_existing_receipt_or_lock(self):
        self.assertEqual(self.run_upload().returncode, 0)
        before = snapshot(self.root)
        first = self.run_upload(DRY_RUN="1")
        second = self.run_upload(DRY_RUN="1")
        self.assertEqual(first.returncode, 0)
        self.assertEqual(first.stdout, second.stdout)
        self.assertEqual(snapshot(self.root), before)

    def test_existing_corrupt_object_is_preserved_not_repaired(self):
        self.assertEqual(self.run_upload().returncode, 0)
        receipt = self.require_receipt()
        manifest = json.loads((self.remote / receipt["manifestKey"]).read_bytes())
        path = self.remote / manifest["files"][0]["objectKey"]
        content = path.read_bytes()
        corrupted = bytes([content[0] ^ 1]) + content[1:]
        path.write_bytes(corrupted)
        self.assertNotEqual(self.run_upload().returncode, 0)
        self.assertEqual(path.read_bytes(), corrupted)
        self.assertEqual(self.require_receipt(), receipt)

    def test_ancestor_open_never_requires_noatime_ownership(self):
        safe = runpy.run_path(str(UPLOADER.with_name("poly-collector-safe-files.py")))
        with safe["SafeFiles"]() as tree, mock.patch.object(os, "open", wraps=os.open) as opened:
            tree.root(str(self.data))
            for call in opened.call_args_list:
                self.assertEqual(call.args[1] & getattr(os, "O_NOATIME", 0x40000), 0)

    def test_content_validation_rechecks_metadata_after_hash(self):
        safe = runpy.run_path(str(UPLOADER.with_name("poly-collector-safe-files.py")))
        with safe["SafeFiles"]() as tree:
            root = tree.root(str(self.data))
            staging = tree.directory(root, "staging")
            batch = tree.directory(staging, BATCH)
            tree.scan(batch)
            original = tree.validate.__globals__["hash_fd"]

            def changing_hash(fd):
                actual = original(fd)
                self.source.write_bytes(b"changed after hash")
                return actual

            with mock.patch.dict(tree.validate.__globals__, {"hash_fd": changing_hash}):
                with self.assertRaises(ValueError):
                    tree.validate(content=True)

    def test_receipt_temporary_substitution_is_not_committed(self):
        archive = runpy.run_path(str(UPLOADER.with_name("poly-collector-archive.py")))
        manifests = self.data / "manifests"
        manifests.mkdir()
        victim = self.root / "private-receipt"
        victim.write_bytes(b"private")
        safe = archive["SAFE"]
        for kind in ("symlink", "regular"):
            with self.subTest(kind=kind), safe["SafeFiles"]() as tree:
                root = tree.root(str(self.data))
                validate = tree.validate
                count = 0

                def substituting_validate(content=False):
                    nonlocal count
                    count += 1
                    if count == 2:
                        temporary = next(manifests.glob(".receipt-*"))
                        temporary.unlink()
                        if kind == "symlink":
                            temporary.symlink_to(victim)
                        else:
                            temporary.write_bytes(b"forged receipt")
                    validate(content=content)

                tree.validate = substituting_validate
                with self.assertRaises((ValueError, OSError)):
                    archive["commit"](tree, root, {"batch": BATCH}, b'{"verified":true}')
                self.assertEqual(victim.read_bytes(), b"private")
                self.assertFalse(os.path.lexists(manifests / f"manifest-{BATCH}.json"))
                for temporary in manifests.glob(".receipt-*"):
                    temporary.unlink()

    def test_system_bash_entrypoint_has_same_read_only_plan(self):
        before = snapshot(self.root)
        result = subprocess.run(["/bin/bash", str(UPLOADER), HOUR], env=self.env | {"DRY_RUN": "1"},
                                cwd=REPO, capture_output=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["mode"], "PLAN_ONLY")
        self.assertEqual(snapshot(self.root), before)

    def test_sigkill_leaves_source_uncommitted_and_retryable(self):
        child = self.start_upload(FAKE_MODE="pause")
        self.wait_ready(child)
        child.kill()
        child.communicate(timeout=10)
        self.assertEqual(self.source.read_bytes(), self.content)
        self.assert_not_committed()
        # SIGKILL cannot run cleanup; release the fake client's barrier and
        # wait for its observable completion before retrying the same objects.
        (self.remote / "release").touch()
        deadline = time.monotonic() + 5
        key = self.remote / f"test-prefix/{HOUR}/objects/sha256/{digest(self.content)}"
        while not key.exists() and time.monotonic() < deadline:
            time.sleep(0.01)
        self.assertTrue(key.exists())
        self.assertEqual(self.run_upload().returncode, 0)


if __name__ == "__main__":
    print(f"TEST_ONLY repository root: {REPO}", flush=True)
    unittest.main(verbosity=2)
