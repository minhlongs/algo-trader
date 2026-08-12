---
name: algo-trader-public-repo-tracked-secret
description: .claude/settings.json is git-tracked with an AUTH_TOKEN, committed to algo-trader's PUBLIC GitHub repo, and a prior audit's fix was incomplete
metadata:
  type: project
---

`.claude/settings.json` is tracked in git (confirmed via `git ls-files`) and committed at HEAD
(last touched by commit `615f6d40c`, "chore(bootstrap): apply mk-bootstrap lane changes"). Its
`env` block contains:
```
"ANTHROPIC_BASE_URL": "http://omnimbp.local:20128/api",
"ANTHROPIC_AUTH_TOKEN": "sk-completed",
```
`github.com/longtho638-jpg/algo-trader` is **PUBLIC** (confirmed via `gh repo view --json visibility`).

A prior suntzu audit (`.orchestrate/latest/plan-verdict.md`, from an earlier "bootstrap→ship" pass
that predates this memory) already flagged this as P0 and specified the fix: `git checkout --` or
`git rm --cached` + rotate the token if real. **Only the `.gitignore` entries
(`.claude/settings.json`, `.claude/settings.local.json`) were added — the file was never actually
untracked, so it's still live in the working tree and in history.** Adding a path to `.gitignore`
does not remove an already-tracked file; this is the specific incomplete-fix pattern to check for.

`"sk-completed"` does not match Anthropic's real key format (`sk-ant-...`), so it may be an inert
placeholder tied to a local-only LAN proxy that doesn't validate the header (`ANTHROPIC_BASE_URL`
points at the same `omnimbp.local:20128` OmniRoute gateway used elsewhere — see
[[algo-trader-llm-strategy-prod-gotchas]]). Unconfirmed either way — don't assert it's harmless
without checking with the user/owner of that proxy.

**Why:** this is unrelated to whatever feature work is being finalized, but it sits in the same
working tree, so it's easy to either (a) miss it entirely and let it slide again, or (b) wrongly
treat it as this session's problem to fix and scope-creep. Since the repo is public, this is a
disclosure risk regardless of urgency.

**How to apply:** when advising on any commit/PR/go-live for algo-trader, check
`git diff .claude/settings.json` — if empty (no new diff), it's *not* newly introduced by the
current change, so don't block the current PR on it, but explicitly call it out as a separate,
already-open, time-sensitive P0 (public repo + committed token-shaped value) that still needs:
1) confirm whether `sk-completed` is real or a placeholder, 2) `git rm --cached` + commit,
3) if real, rotate it, 4) if it's been public a while, treat as compromised regardless of rotation
timing. Do not silently drop this from the checklist just because it's out of scope for the
requested task.
