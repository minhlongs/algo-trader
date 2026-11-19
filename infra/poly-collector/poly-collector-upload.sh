#!/usr/bin/env bash
# VN: DRY_RUN=1 chỉ xuất kế hoạch JSON; không khóa/ghi/xóa hoặc gọi kho từ xa.
# EN: DRY_RUN=1 emits a read-only JSON plan, without locks or transport calls.
# VN: Không có chính sách xóa. Luôn giữ bản gốc, kể cả sau xác minh thành công.
# EN: No retention is authorized. Original batches are never pruned or changed.
#
# Requires Python 3 with POSIX dir_fd/O_NOFOLLOW/flock, plus AWS CLI supporting
# put-object --if-none-match. POLY_UPLOAD_TOOL defaults to aws. rclone execution
# fails closed (atomic server-side create unproven); rclone dry-run is allowed.
# VN: Hash có thể đổi atime trên macOS; dùng mount read-only/noatime nếu cần.
# EN: Reads may affect atime on macOS; use a read-only/noatime mount if required.
# Manifest v2 is canonical ASCII JSON (sorted keys, compact,
# no newline/timestamp); data and manifest keys bind SHA256 of exact bytes.
# A local manifests/manifest-<batch>.json receipt is committed only after every
# object AND the remote manifest have been downloaded and SHA256-verified.
# Receipt is not a deletion permit or proof of source provenance/WAL replay.
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
exec python3 -I -B "${SCRIPT_DIR}/poly-collector-archive.py" "$@"
