---
name: algo-trader-ship-pipeline-toolchain-gap
description: The bootstrap→ship slash commands the user keeps invoking for algo-trader do not exist; use the native PR pipeline instead
metadata:
  type: project
---

The user has twice requested an algo-trader run of the form `/ak:bootstrap to /ak:ship --auto --parallel`, then `/mk-bootstrap to /ak-ship --auto --parallel`. **Neither entry point exists**, and both runs stalled on discovering this:

- `mk` (Mekong CLI 7, a Python Typer app) has no `bootstrap` and no `ship` subcommand.
- `/ak-ship` exists as a slash-command file but shells to `ak ship`, which returns `unknown command` / exit 1. The installed AgentKit `core` kit ships 0 commands.
- `--auto` and `--parallel` are not flags on any available mk/ak command.
- The generic `/bootstrap` is a *new-project scaffolder* — actively wrong for this mature repo.

**Why:** these aliases appear in the user's muscle memory / prior docs but were never implemented. Each run rediscovers it and burns a planning cycle.

**How to apply:** when asked to run algo-trader bootstrap→ship, do not try the literal commands. Skip "bootstrap" entirely and go straight to the native pipeline: verify → feature branch → PR → CI gates → squash merge → CF deploy → smoke. `mk orchestrate` is the only real CLI equivalent (plan → gate → execute → gate → ship) and is a reasonable fallback. Never push algo-trader payloads directly to `main` — 4 workflows (`ci.yml`, `ci-cd.yml`, `cloudflare-deploy.yml`, `deploy.yml`) auto-deploy on `push: branches: [main]`, and the code is live trading execution. See [[algo-trader-deploy-contract]].

**Recurring trap (2026-08-12):** work sessions keep committing straight onto local `main` instead of a feature branch, then discovering it via `git status` ("ahead of origin/main by N commits") only when asked to finalize. Before advising any go-live/finalize step: run `git branch --show-current` and `git log origin/main..HEAD --oneline`. If on `main` with unpushed local commits, branch off *now* (`git switch -c feat/<slug>`) then `git reset --hard origin/main` on `main`, rather than pushing — pushing main triggers the 4 workflows above with unreviewed code. The canonical deploy contract is `CLAUDE.deploy.md` (Cloudflare **Pages** — `algo-trader.pages.dev` + `cashclaw.cc`, squash-merge, 11-line Binh-phap verification report); the root `CLAUDE.md` "Deployment Commands" section (multi-region VPS, `workers.dev` health checks) is stale/superseded — don't hand that to the user as current.
