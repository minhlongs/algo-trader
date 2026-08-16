# Security Review: pnpm-workspace.yaml

Date: 2026-08-16T04:46Z
Commit: 322ba16d
Reporter: automated security review

## Finding
Supply-chain concern: `pnpm-workspace.yaml` allowBuilds entries permit build
scripts to run during install for 12 dependencies.

## Analysis
This is NOT a new change — same allowlist existed on `main` before sabotage.
`pnpm-workspace.yaml` was damaged by Konflux, then same day was partially
restored (but with placeholder strings, making it non-functional — hence PR #4).

## What the allowlist covers
Required for CI:
- @prisma/client, @prisma/engines — DB client binding
- esbuild — bundling during build
- bufferutil — optional WebSocket perf
- protobufjs, workerd — sandbox runtime
- ccxt — exchange adapters
- msgpackr-extract — serialization lib

Disabled (safe):
- core-js: false
- sharp: false

## Risk level: LOW
- Values match `main` upstream before sabotage (not widened)
- Two packages explicitly disabled (sharp, core-js)
- All packages are well-known, audited ecosystem deps
- CI deploy is blocked without this allowlist; security through non-functional
  config is just broken pipeline

## Acknowledged