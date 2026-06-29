#!/usr/bin/env bash
# Rebuild all .wasm kernels from their .wat sources.
# Requires: wat2wasm (wabt) — brew install wabt
set -euo pipefail
KERNELS_DIR="$(cd "$(dirname "$0")/kernels" && pwd)"
for wat in "$KERNELS_DIR"/*.wat; do
  out="${wat%.wat}.wasm"
  wat2wasm "$wat" -o "$out"
  echo "Built $out ($(wc -c < "$out") bytes)"
done
echo "Done."
