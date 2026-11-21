"""Plan without writes; execute only from pinned, revalidated source descriptors."""
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import fcntl
import hashlib
import os
from pathlib import Path
import re
import runpy
import signal
import sys
import tempfile
import json
from urllib.parse import urlsplit

# Only these adjacent, repository-owned modules are loaded, never archive input.
HERE = Path(__file__).resolve().parent
SAFE = runpy.run_path(str(HERE / "poly-collector-safe-files.py"))
WIRE = runpy.run_path(str(HERE / "poly-collector-transport.py"))


def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=True, separators=(",", ":")).encode("ascii")


def configuration():
    hour = sys.argv[1] if len(sys.argv) == 2 else (datetime.now(timezone.utc) - timedelta(hours=1)).strftime("%Y/%m/%d/%H")
    if len(sys.argv) > 2 or not re.fullmatch(r"\d{4}/\d{2}/\d{2}/\d{2}", hour):
        raise ValueError("expected one UTC hour YYYY/MM/DD/HH")
    datetime.strptime(hour, "%Y/%m/%d/%H")
    endpoint = os.environ["R2_ENDPOINT"]
    url = urlsplit(endpoint)
    if url.scheme != "https" or not url.hostname or url.username or url.password or url.query or url.fragment:
        raise ValueError("HTTPS endpoint without credentials required")
    bucket = os.environ["R2_BUCKET"]
    prefix = os.environ.get("R2_PREFIX", "poly-l2-v1")
    if not re.fullmatch(r"[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]", bucket):
        raise ValueError("invalid bucket")
    if any(not re.fullmatch(r"[A-Za-z0-9_-][A-Za-z0-9._-]*", part) or part in (".", "..")
           for part in prefix.split("/")):
        raise ValueError("invalid object prefix")
    tool = os.environ.get("POLY_UPLOAD_TOOL", "aws")
    retries = int(os.environ.get("UPLOAD_MAX_RETRIES", "3"))
    dry = os.environ.get("DRY_RUN", "0")
    if tool not in ("rclone", "aws") or not 1 <= retries <= 10 or dry not in ("0", "1"):
        raise ValueError("invalid upload configuration")
    if tool == "rclone" and dry != "1":
        raise ValueError("rclone execution lacks atomic conditional-create assurance; use aws")
    return {"hour": hour, "batch": hour.replace("/", "-"), "bucket": bucket,
            "base": f"{prefix}/{hour}", "endpoint": endpoint, "tool": tool,
            "retries": retries, "dry": dry == "1",
            "root": os.environ.get("POLY_COLLECTOR_DATA_ROOT", "/var/lib/poly-collector")}


def interrupted(signum, _frame):
    # InterruptedError is an OSError that poll/select may transparently retry.
    # SystemExit unwinds client cleanup and cannot be mistaken for a retryable IO.
    raise SystemExit(128 + signum)


@contextmanager
def locked(tree, root):
    # Never unlink the lock inode: waiters must always contend on the same file.
    fd = tree.regular(root, "upload.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError as error:
        raise RuntimeError("another uploader holds the lock; retry later") from error
    yield


def receipt_at(tree, directory, name):
    try:
        fd = tree.regular(directory, name)
    except FileNotFoundError:
        return None
    size = os.fstat(fd).st_size
    if size > 1024 * 1024:
        raise ValueError("oversized existing receipt")
    return os.pread(fd, size, 0)


def commit(tree, root, config, receipt):
    tree.validate(content=True)
    directory = tree.directory(root, "manifests", create=True)
    name = f"manifest-{config['batch']}.json"
    existing = receipt_at(tree, directory, name)
    if existing is not None:
        if existing != receipt:
            raise ValueError("existing receipt conflicts; refusing overwrite")
        return
    temporary = f".receipt-{os.getpid()}-{os.urandom(12).hex()}"
    fd = os.open(temporary, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=directory)
    expected_temp = None
    unlinked = False
    try:
        with os.fdopen(fd, "w+b") as output:
            output.write(receipt)
            output.flush()
            os.fsync(output.fileno())
            expected_temp = SAFE["version"](os.fstat(output.fileno()))
            tree.validate(content=True)
            if SAFE["version"](os.stat(temporary, dir_fd=directory, follow_symlinks=False)) != expected_temp:
                raise ValueError("temporary receipt substituted before publish")
            if os.pread(output.fileno(), len(receipt) + 1, 0) != receipt:
                raise ValueError("temporary receipt changed before publish")
            # Hard-link publication is atomic and fails if another receipt exists.
            os.link(temporary, name, src_dir_fd=directory, dst_dir_fd=directory, follow_symlinks=False)
            os.unlink(temporary, dir_fd=directory)
            unlinked = True
            os.fsync(directory)
            published_fd = tree.regular(directory, name)
            if SAFE["identity"](os.fstat(published_fd)) != expected_temp[0]:
                raise ValueError("published receipt identity mismatch")
            if os.pread(published_fd, len(receipt) + 1, 0) != receipt:
                raise ValueError("published receipt content mismatch")
            tree.validate()
    finally:
        if not unlinked:
            try:
                if expected_temp is not None and SAFE["identity"](os.stat(temporary, dir_fd=directory, follow_symlinks=False)) == expected_temp[0]:
                    os.unlink(temporary, dir_fd=directory)
            except FileNotFoundError:
                pass


def execute(tree, root, config, manifest, key, checksum, receipt):
    os.umask(0o077)
    with locked(tree, root):
        tree.validate(content=True)
        try:
            directory = tree.directory(root, "manifests")
            existing = receipt_at(tree, directory, f"manifest-{config['batch']}.json")
            if existing is not None and existing != receipt:
                raise ValueError("committed hour differs; preserve and investigate")
        except FileNotFoundError:
            pass
        # New private staging space only; no writes in the source batch or logs.
        with tempfile.TemporaryDirectory(prefix="poly-upload-") as temporary:
            transport = WIRE["Transport"](config, temporary)
            for index, entry in enumerate(manifest["files"]):
                tree.validate()
                fd = tree.sources[index][1]
                path = Path(temporary) / f"source-{index}"
                with path.open("xb") as output:
                    actual = SAFE["hash_fd"](fd, output)
                if actual != (entry["sha256"], entry["sizeBytes"]):
                    raise ValueError("source changed while snapshotting")
                tree.validate()
                transport.ensure(path, entry["objectKey"], entry["sha256"])
                tree.validate()
            path = Path(temporary) / "manifest.json"
            path.write_bytes(canonical(manifest))
            tree.validate(content=True)
            transport.ensure(path, key, checksum)
            tree.validate(content=True)
            commit(tree, root, config, receipt)


def main():
    config = configuration()
    with SAFE["SafeFiles"]() as tree:
        try:
            root = tree.root(config["root"])
            staging = tree.directory(root, "staging")
            batch = tree.directory(staging, config["batch"])
        except FileNotFoundError:
            print(canonical({"mode": "PLAN_ONLY" if config["dry"] else "NO_UPLOAD",
                             "status": "MISSING_INTERVAL", "batchId": config["batch"]}).decode())
            return
        tree.scan(batch)
        tree.validate(content=True)
        files = [{"relativePath": name, "sha256": checksum, "sizeBytes": size,
                  "objectKey": f"{config['base']}/objects/sha256/{checksum}"}
                 for name, _, _, checksum, size in tree.sources]
        manifest = {"version": 2, "batchId": config["batch"], "windowUtc": config["hour"],
                    "status": "SNAPSHOT", "fileCount": len(files),
                    "totalBytes": sum(entry["sizeBytes"] for entry in files), "files": files}
        checksum = hashlib.sha256(canonical(manifest)).hexdigest()
        key = f"{config['base']}/manifests/sha256/{checksum}/manifest.json"
        receipt = canonical({"version": 2, "status": "ARCHIVED_VERIFIED", "batchId": config["batch"],
                             "manifestKey": key, "manifestSha256": checksum})
        if config["dry"] or not files:
            print(canonical({"mode": "PLAN_ONLY" if config["dry"] else "NO_UPLOAD", "manifest": manifest,
                             "manifestKey": key, "manifestSha256": checksum}).decode())
            return
        execute(tree, root, config, manifest, key, checksum, receipt)
        print(receipt.decode())


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        main()
    except (OSError, ValueError, RuntimeError, KeyError) as error:
        # Do not leak transport stderr, paths, endpoint values or credentials.
        print(f"uploader failed closed: {type(error).__name__}", file=sys.stderr)
        sys.exit(1)
