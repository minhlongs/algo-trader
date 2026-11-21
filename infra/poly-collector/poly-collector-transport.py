"""Conditional-create transport; downloaded bytes, never size/ETag, prove integrity."""
import hashlib
import math
import os
from pathlib import Path
import signal
import subprocess

DEFAULT_TIMEOUT_SECONDS = 120.0
MIN_TIMEOUT_SECONDS = 0.05
MAX_TIMEOUT_SECONDS = 3600.0


def resolve_timeout_seconds():
    raw = os.environ.get("POLY_UPLOAD_TIMEOUT_SECONDS")
    if not raw:
        return DEFAULT_TIMEOUT_SECONDS
    try:
        value = float(raw)
    except ValueError:
        return DEFAULT_TIMEOUT_SECONDS
    if not math.isfinite(value):
        return DEFAULT_TIMEOUT_SECONDS
    return max(MIN_TIMEOUT_SECONDS, min(value, MAX_TIMEOUT_SECONDS))


def sha256_path(path):
    checksum = hashlib.sha256()
    with open(path, "rb") as stream:
        while chunk := stream.read(1024 * 1024):
            checksum.update(chunk)
    return checksum.hexdigest()


class Transport:
    def __init__(self, config, temporary):
        if config["tool"] != "aws":
            raise ValueError("only conditional-create aws transport is supported")
        self.config = config
        self.temporary = Path(temporary)

    def command(self, args):
        child = subprocess.Popen(args, stdout=subprocess.DEVNULL,
                                 stderr=subprocess.PIPE, start_new_session=True)
        try:
            _, error = child.communicate(timeout=resolve_timeout_seconds())
            return child.returncode, error
        except BaseException:
            # Stop the whole client process group, including its subprocesses.
            try:
                os.killpg(child.pid, signal.SIGTERM)
                child.wait(timeout=2)
            except (ProcessLookupError, subprocess.TimeoutExpired):
                if child.poll() is None:
                    os.killpg(child.pid, signal.SIGKILL)
            child.communicate()
            raise

    def options(self):
        return ["--endpoint-url", self.config["endpoint"], "--bucket", self.config["bucket"]]

    def download(self, key, expected):
        target = self.temporary / "download"
        # Do not let an unsuccessful GET leave stale verified output behind.
        target.unlink(missing_ok=True)
        code, error = self.command(["aws", "s3api", "get-object", *self.options(), "--key", key, str(target)])
        if code:
            if code == 254 and any(marker in error for marker in (b"NoSuchKey", b"(404)", b"(NotFound)")):
                return False
            raise RuntimeError("remote download failed")
        if sha256_path(target) != expected:
            raise ValueError("remote SHA256 mismatch")
        return True

    def ensure(self, source, key, checksum):
        for _ in range(self.config["retries"]):
            try:
                if self.download(key, checksum):
                    return
                # A lost PUT acknowledgement or competing identical PUT succeeds
                # only when a subsequent download has the expected SHA256.
                self.command(["aws", "s3api", "put-object", *self.options(), "--key", key,
                              "--if-none-match", "*", "--body", str(source)])
                if self.download(key, checksum):
                    return
            except (RuntimeError, subprocess.TimeoutExpired):
                continue
        raise RuntimeError("object upload/download verification exhausted retries")
