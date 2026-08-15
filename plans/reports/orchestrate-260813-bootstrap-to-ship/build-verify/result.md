# Build Verification Report
**Status: PASS**

## Compilation
- Exit code: 0
- Errors: 0
- Warnings: 0
- Build command: `npm run build` (prebuild: disk check, build: tsc)

## Output Integrity
- dist/ exists: yes
- Total files: 1664
- JS files: 828
- DTS files: 827
- Directories: 11 (root-level: agentic, agents, api, billing, commands, dashboard, db, deck, desk, durable-objects, engine, events, forest, intelligence, lib, middleware, paper-trading, platform, queues, raas, redis, regions, resilience, risk, rollback, seed, shared, signal, strategies, utils, wiring, worker)
- Empty/1-byte files: 0 (excluding tsbuildinfo)
- Incremental build info: tsconfig.worker.tsbuildinfo present

## Key Entry Points Verified
- dist/index.js + dist/index.d.ts: present
- dist/app.js + dist/app.d.ts: present
- dist/engine.js + dist/engine.d.ts: present

## TypeScript Config
- Target: ES2022
- Module: commonjs
- Strict: true
- OutDir: ./dist
- RootDir: ./src
- Lib: ES2023, DOM
- Incremental: true
- Declaration: true
- Path aliases: @shared/*, @desk/*, @platform/*, @forest/*, @redis

## Source vs Compiled
- Source .ts files (excl. tests, workers, dashboard, landing, wiring): 775
- Compiled .js files: 828 (includes generated code, barrel re-exports)
- Source coverage: 100% of included source files compiled

## Excluded from Build (by design)
- Test files (*.test.ts)
- src/platform/workers/**
- src/platform/dashboard/**
- src/platform/landing/**
- src/wiring/**
- src/desk/wiring/**
- src/desk/polymarket/trading-pipeline.ts

## Issues
- None detected

## Recommendations
- Clean build: `tsc` produces zero errors and zero warnings
- Incremental builds: tsbuildinfo present for fast subsequent builds
- All source files in scope compile successfully to dist/
