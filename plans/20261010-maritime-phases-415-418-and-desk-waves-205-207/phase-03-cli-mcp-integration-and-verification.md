# Phase 03: CLI, MCP Integration & End-to-End Verification

## Overview
Integrate Maritime Automation Phases 415-418 into `mekong-cli`:
1. Master Engine Facade: `src/core/maritime_cpp_homogenizer_dewpoint_omd_engine.py` (< 200 LOC)
2. Typer CLI Command Group: `src/cli/commands/maritime_cpp_homogenizer_dewpoint_omd_command.py` (< 200 LOC)
3. Bilingual Command Aliases registered in `src/cli/app_setup.py`:
   - `cpppropeller` / `chanvithoavan`
   - `fuelhomogenizer` / `donghoanhietlieu`
   - `cargodewpoint` / `diemsuonghamhang`
   - `crankcaseomd` / `bododausuongcacte`
4. FastMCP Tool Functions in `scripts/mcp_server.py`:
   - `mekong_maritime_cpp_propeller_evaluate`
   - `mekong_maritime_fuel_homogenizer_evaluate`
   - `mekong_maritime_cargo_dewpoint_evaluate`
   - `mekong_maritime_crankcase_omd_evaluate`
5. Zero-Mock Unit Test Suite: `tests/test_maritime_phases_415_418_unit_suite.py` (< 200 LOC)
6. Vitest Test Suites for Waves 205-207 in `algo-trader`.

## Verification & Quality Gates
- `pytest tests/test_maritime_phases_415_418_unit_suite.py -v`: 100% green
- `npm test src/desk/realizedkernel/ src/desk/rqv/ src/desk/vrp/`: 100% green
- Line count check: Every TypeScript file strictly < 180 LOC, every Python file strictly < 200 LOC.
- Zero `:any` types, zero `console.log`, zero mocks.
- Memory index updated at `/Users/macbook/.claude/projects/-Users-macbook/memory/`.

## Checklist
- [ ] Create Master Facade in `mekong-cli`
- [ ] Create Typer CLI commands in `mekong-cli`
- [ ] Register bilingual aliases in `app_setup.py`
- [ ] Register FastMCP tools in `scripts/mcp_server.py`
- [ ] Write and run `tests/test_maritime_phases_415_418_unit_suite.py`
- [ ] Run Vitest for Waves 205-207
- [ ] Update Memory and finish report
