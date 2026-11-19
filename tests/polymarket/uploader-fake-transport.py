#!/usr/bin/env python3
"""Offline CLI boundary: copy actual bytes, inject faults, never open a socket."""
import json
import os
from pathlib import Path
import shutil
import sys
import time

args = sys.argv[1:]
root = Path(os.environ["FAKE_REMOTE"])
mode = os.environ.get("FAKE_MODE", "")
aws = Path(sys.argv[0]).name == "aws"


def option(name):
    return args[args.index(name) + 1]


if aws:
    operation = args[1]
    key = option("--key")
    source = option("--body") if operation == "put-object" else None
else:
    operation = args[0]
    remote = next(value for value in args if value.startswith("r2:"))
    key = remote.split("/", 1)[1]
    source = args[-2] if operation == "copyto" else None

path = root / key
if not path.resolve().is_relative_to(root.resolve()):
    sys.exit("unsafe fake transport key")
put = operation in ("copyto", "put-object")
manifest = "manifest" in key
with (root / "calls.jsonl").open("a") as log:
    log.write(json.dumps({"op": operation, "key": key, "conditional": "--if-none-match" in args}) + "\n")

if put:
    if source is None:
        sys.exit("missing source path")
    if mode == "upload-failure":
        sys.exit(23)
    if mode == "pause" and not manifest:
        (root / "ready").touch()
        while not (root / "release").exists():
            time.sleep(0.01)
    if mode in ("swap-file", "swap-batch", "mutate-file") and not manifest:
        target = Path(os.environ["FAKE_SOURCE"])
        if mode == "mutate-file":
            content = target.read_bytes()
            target.write_bytes(bytes([content[0] ^ 1]) + content[1:])
        elif not (root / "swapped").exists():
            was_directory = target.is_dir()
            target.rename(str(target) + ".saved")
            target.symlink_to(Path(os.environ["FAKE_VICTIM"]), target_is_directory=was_directory)
            (root / "swapped").touch()
    path.parent.mkdir(parents=True, exist_ok=True)
    if mode == "remote-race" and not path.exists():
        path.write_bytes(b"another writer's bytes")
    try:
        # AWS conditional-create is atomic; do not grant rclone that guarantee.
        if not aws or "--if-none-match" not in args:
            with path.open("wb") as dest, open(source, "rb") as src:
                shutil.copyfileobj(src, dest)
        else:
            with path.open("xb") as dest, open(source, "rb") as src:
                shutil.copyfileobj(src, dest)
    except FileExistsError:
        sys.exit(12 if aws else 0)
    if mode == "corrupt-data" and not manifest or mode == "corrupt-manifest" and manifest:
        content = path.read_bytes()
        path.write_bytes(bytes([content[0] ^ 1]) + content[1:])
    if mode == "lost-put-response":
        sys.exit(23)
    sys.exit(0)

if not path.exists():
    sys.stderr.write("An error occurred (NoSuchKey): missing\n" if aws else "file not found\n")
    sys.exit(254 if aws else 4)
if operation in ("lsjson", "head-object"):
    print(path.stat().st_size if aws else json.dumps([{"Size": path.stat().st_size}], separators=(",", ":")))
elif mode == "download-failure":
    sys.exit(23)
elif aws:
    shutil.copyfile(path, args[-1])
else:
    with path.open("rb") as src:
        shutil.copyfileobj(src, sys.stdout.buffer)
