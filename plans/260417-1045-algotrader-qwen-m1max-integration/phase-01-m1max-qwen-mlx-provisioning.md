# Phase 01 — M1 Max Qwen MLX Server Provisioning

## Context Links

- Research: `/Users/macbookprom1/plans/reports/researcher-260417-1030-qwen3-6-35b-a3b-m1max.md`
- Existing LLM host: DeepSeek R1 MLX @ `:11435`, Nemotron Nano MLX @ `:11436`
- Memory: `reference_m1max_cloudflare_tunnel.md` — SSH via `ssh m1max-cf`
- Memory: `feedback_m1pro_remote_only.md` — M1 Pro is terminal only

## Overview

**Priority:** P1 (blocks all other phases)
**Status:** completed (2026-04-17)
**Effort:** 3h
**Description:** Pull Qwen3-30B-A3B MLX 4-bit weights on M1 Max, start `mlx_lm.server` on port 11437 alongside existing DeepSeek R1/Nemotron. Validate OpenAI-compatible `/v1/chat/completions` endpoint.

## Key Insights

- **Model choice:** `mlx-community/Qwen3-30B-A3B-4bit` (~18GB RAM). NOT 3.6-35B (no MLX weights).
- **Concurrency:** DeepSeek R1 (~20GB) + Qwen3-30B-A3B (~18GB) + Nemotron (~18GB) + macOS (~10GB) = 66GB → over budget on 64GB. **Decision: park Nemotron**; keep DeepSeek + Qwen hot. Nemotron cold-starts on demand.
- **Port scheme:** 11435 DeepSeek, 11436 Nemotron (optional/cold), **11437 Qwen (new)**, 11434 Ollama fallback.
- **Persistence:** launchd plist for auto-start on M1 Max reboot.

## Requirements

**Functional:**
- Qwen MLX server reachable at `http://127.0.0.1:11437/v1/chat/completions` (M1 Max local)
- Reachable from CF Tunnel-exposed endpoint OR daemon-local-only (daemon is ON M1 Max)
- Health check: `curl :11437/v1/models` returns JSON with `Qwen3-30B-A3B-4bit`
- Latency: p50 <800ms for 256-token response

**Non-functional:**
- Auto-start on M1 Max reboot (launchd)
- Log rotation (10MB cap)
- RAM headroom alarm if >56GB used

## Architecture

```
M1 Max 64GB
├─ macOS (~10GB baseline)
├─ :11435 DeepSeek R1 MLX 4-bit (~20GB) [EXISTING]
├─ :11437 Qwen3-30B-A3B MLX 4-bit (~18GB) [NEW]
├─ :11436 Nemotron Nano (COLD — launchd disabled) [EXISTING, demote]
└─ ~16GB free for kernel + apps
```

## Related Code Files

**Modify:** none in algo-trader repo (M1 Max ops only)

**Create (on M1 Max):**
- `~/.local/bin/start-qwen-mlx-server.sh` — startup script
- `~/Library/LaunchAgents/com.mekong.qwen-mlx.plist` — launchd auto-start
- `~/.local/logs/qwen-mlx.log` — log target

**Deprecate (on M1 Max):**
- `~/Library/LaunchAgents/com.mekong.nemotron-mlx.plist` — disable auto-start (retain plist for revert)

## Implementation Steps

1. `ssh m1max-cf` — verify reach
2. `cd ~ && uv pip install mlx-lm` (or `pip install --upgrade mlx-lm`) — ensure latest
3. `python -m mlx_lm.convert --hf-path Qwen/Qwen3-30B-A3B --mlx-path ~/models/Qwen3-30B-A3B-4bit --quantize --q-bits 4` — or pull pre-quantized `mlx-community/Qwen3-30B-A3B-4bit` via `huggingface-cli download`
4. Write `~/.local/bin/start-qwen-mlx-server.sh`:
   ```sh
   #!/bin/bash
   exec python -m mlx_lm.server \
     --model ~/models/Qwen3-30B-A3B-4bit \
     --host 127.0.0.1 --port 11437 \
     --max-tokens 2048 >> ~/.local/logs/qwen-mlx.log 2>&1
   ```
5. Test manually: `./start-qwen-mlx-server.sh &` → `curl -s :11437/v1/models`
6. Create launchd plist, `launchctl load com.mekong.qwen-mlx.plist`
7. Disable Nemotron: `launchctl unload com.mekong.nemotron-mlx.plist`
8. Verify reboot-persistence: `sudo shutdown -r now` (only if user approves; otherwise `launchctl list | grep qwen`)
9. Record RAM baseline: `vm_stat | head -5`
10. Document in `docs/system-architecture.md` (phase 05 will actually commit this)

## Todo List

- [x] SSH reach M1 Max confirmed
- [x] mlx-lm latest installed (v0.31.1 in mlx-env)
- [x] Qwen3-30B-A3B-4bit weights downloaded (~16GB on disk)
- [x] start-qwen-mlx-server.sh written + executable (~/.local/bin/)
- [x] Manual smoke test passes (curl models endpoint)
- [x] Chat completion smoke test passes — 37.7 tok/s
- [x] launchd plist installed + loaded (com.mekong.qwen-server, PID 74355)
- [ ] Nemotron demoted to cold-start (SKIPPED — Nemotron already idle at 0% mem)
- [x] RAM 63GB / 64GB with Qwen+DeepSeek concurrent (tight but OK)
- [x] Phase 02 unblocked

## Success Criteria

- `curl http://127.0.0.1:11437/v1/chat/completions -d '{"model":"Qwen3-30B-A3B-4bit","messages":[{"role":"user","content":"Return JSON {\"ok\":true}"}]}'` returns valid JSON response <5s
- `launchctl list | grep qwen` shows running state
- `ps aux | grep mlx_lm` shows both DeepSeek and Qwen processes
- Memory `project_algotrade_deepseek_monitoring.md` update queued: "Qwen3-30B-A3B added 2026-04-17, Nemotron cold-demoted"

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| MLX weights missing for 30B-A3B | Low | Fallback to `Qwen2.5-32B-Instruct-4bit` (proven MLX) |
| RAM swap thrashing | Medium | Demote Nemotron. Monitor `memory_pressure` cmd. |
| launchd plist permissions | Low | Use LaunchAgents (user-level), not LaunchDaemons |
| Port 11437 collision | Low | `lsof -i :11437` pre-check |

## Security Considerations

- MLX server bound to `127.0.0.1` ONLY. Never expose to WAN.
- CF Tunnel access for daemon is unnecessary — daemon runs ON M1 Max (see Phase 03).
- No API key on MLX server (local trust boundary).

## Next Steps

- Phase 02 can start in parallel (isolated to algo-trader repo) once MLX server is up.
- Phase 03 depends on Phase 01 + 02.
