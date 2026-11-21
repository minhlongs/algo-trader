"""Descriptor-relative, no-follow source inspection. Never mutate source files."""
from contextlib import ExitStack
import fcntl
import hashlib
import os
import stat

NOATIME = getattr(os, "O_NOATIME", 0)
DIRECTORY = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
READ = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | NOATIME
SUFFIXES = (".wal", ".wal.zst", ".parquet", ".jsonl")


def identity(info):
    return info.st_dev, info.st_ino, stat.S_IFMT(info.st_mode)


def version(info):
    return identity(info), info.st_size, info.st_mtime_ns, info.st_ctime_ns, info.st_nlink


def hash_fd(fd, destination=None):
    checksum = hashlib.sha256()
    offset = 0
    while True:
        chunk = os.pread(fd, 1024 * 1024, offset)
        if not chunk:
            break
        checksum.update(chunk)
        if destination is not None:
            destination.write(chunk)
        offset += len(chunk)
    return checksum.hexdigest(), offset


class SafeFiles:
    def __init__(self):
        self.stack = ExitStack()
        self.edges = []
        self.directories = []
        self.sources = []

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return self.stack.__exit__(*args)

    def retain(self, fd):
        self.stack.callback(os.close, fd)
        return fd

    def directory(self, parent, name, create=False):
        if create:
            try:
                os.mkdir(name, mode=0o700, dir_fd=parent)
            except FileExistsError:
                pass
        fd = self.retain(os.open(name, DIRECTORY, dir_fd=parent))
        self.edges.append((parent, name, identity(os.fstat(fd))))
        return fd

    def root(self, path):
        if not path.startswith("/") or any(part in (".", "..") for part in path.split("/")):
            raise ValueError("data root must be absolute without traversal")
        fd = self.retain(os.open("/", DIRECTORY))
        for part in path.split("/"):
            if part:
                fd = self.directory(fd, part)
        return fd

    def regular(self, parent, name, flags=READ):
        fd = self.retain(os.open(name, flags, 0o600, dir_fd=parent))
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
            raise ValueError("regular single-link file required")
        self.edges.append((parent, name, identity(info)))
        return fd

    def scan(self, directory, prefix=""):
        if NOATIME:
            # Ancestors are opened without NOATIME (non-root users do not own
            # '/'). Only owned batch directories are listed; fail if disallowed.
            flags = fcntl.fcntl(directory, fcntl.F_GETFL)
            fcntl.fcntl(directory, fcntl.F_SETFL, flags | NOATIME)
        names = sorted(os.listdir(directory))
        self.directories.append((directory, names))
        for name in names:
            info = os.stat(name, dir_fd=directory, follow_symlinks=False)
            relative = prefix + name
            if stat.S_ISDIR(info.st_mode):
                self.scan(self.directory(directory, name), relative + "/")
            elif not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
                raise ValueError("symlink, special file or hardlink in batch")
            elif name.endswith(SUFFIXES):
                fd = self.regular(directory, name)
                before = version(os.fstat(fd))
                checksum, size = hash_fd(fd)
                if version(os.fstat(fd)) != before:
                    raise ValueError("source changed during planning")
                self.sources.append((relative, fd, before, checksum, size))

    def validate_metadata(self):
        for parent, name, expected in self.edges:
            if identity(os.stat(name, dir_fd=parent, follow_symlinks=False)) != expected:
                raise ValueError("path substituted")
        for fd, names in self.directories:
            if sorted(os.listdir(fd)) != names:
                raise ValueError("batch directory changed")
        for _, fd, expected, _, _ in self.sources:
            if version(os.fstat(fd)) != expected:
                raise ValueError("source changed")

    def validate(self, content=False):
        self.validate_metadata()
        if content:
            for _, fd, _, checksum, size in self.sources:
                if hash_fd(fd) != (checksum, size):
                    raise ValueError("source content changed")
            # A file already hashed (or any directory edge/listing) may have
            # changed while another file was being read. Check the entire set.
            self.validate_metadata()
